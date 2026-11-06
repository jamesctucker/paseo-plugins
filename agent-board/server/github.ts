import type { IssueAdapter, IssueDetail, IssueSummary } from "../shared/tracker";

/**
 * GitHub REST adapter for pull requests. Tokens and network stay daemon-side;
 * the client only ever sees IssueSummary/IssueDetail values. Only PRs are
 * modeled: they are the GitHub unit the spawn loop can check out and the unit
 * quick-add parses.
 */

export interface GitHubAdapterConfig {
  token: string;
}

interface GitHubSearchItem {
  number: number;
  title: string;
  html_url: string;
  state: string;
  draft?: boolean;
  repository_url: string;
  updated_at?: string;
}

interface GitHubSearchResponse {
  items?: GitHubSearchItem[];
}

interface GitHubPull {
  number: number;
  title: string;
  body?: string | null;
  html_url: string;
  state: string;
  draft?: boolean;
}

interface GitHubReview {
  user?: { login?: string } | null;
  state?: string;
  submitted_at?: string;
}

/** One PR that needs James's review action (amendment 2026-11-06). */
export interface PrGateRef {
  repo: string;
  number: number;
  title: string;
  url: string;
}

/** The adapter plus the review-loop gate read. */
export interface GitHubAdapter extends IssueAdapter {
  reviewGates(): Promise<{ reviewRequested: PrGateRef[]; changesRequested: PrGateRef[] }>;
}

const API = "https://api.github.com";

/** `owner/repo#123` — the same shape quick-add parses. */
const PR_KEY = /^([\w.-]+\/[\w.-]+)#(\d+)$/;

export class GitHubApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GitHubApiError";
  }
}

function repoOf(item: GitHubSearchItem): string {
  // repository_url is https://api.github.com/repos/<owner>/<repo>
  return item.repository_url.split("/repos/")[1] ?? "";
}

function statusOf(state: string, draft?: boolean): string {
  if (draft) return "Draft";
  return state.charAt(0).toUpperCase() + state.slice(1);
}

export function createGitHubAdapter(
  config: GitHubAdapterConfig,
  request: typeof fetch = fetch,
): GitHubAdapter {
  if (!config.token.trim()) {
    throw new GitHubApiError("No GitHub token configured. Open the Agent Board settings.");
  }
  const auth = `Bearer ${config.token.trim()}`;

  async function rest<T>(path: string): Promise<T> {
    let response: Response;
    try {
      response = await request(`${API}${path}`, {
        headers: {
          Authorization: auth,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      });
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : String(cause);
      throw new GitHubApiError(`Could not reach GitHub: ${reason}`);
    }
    if (response.status === 401 || response.status === 403) {
      throw new GitHubApiError("GitHub rejected the token. Check the token in settings.");
    }
    if (!response.ok) {
      throw new GitHubApiError(`GitHub request failed with HTTP ${response.status}`);
    }
    return (await response.json()) as T;
  }

  /**
   * A classic PAT with only public_repo scope silently omits private repos
   * from every search — the failure mode is an empty list, not an error. When
   * a listing comes back empty, read the scope header and turn that silent
   * miss into guidance. Fine-grained PATs carry no scope header and are
   * inherently repo-scoped, so the probe skips them.
   */
  async function assertRepoScope(): Promise<void> {
    const response = await request(`${API}/user`, {
      headers: { Authorization: auth, Accept: "application/vnd.github+json" },
    });
    const scopes = response.headers.get("x-oauth-scopes");
    if (scopes === null) return;
    const granted = scopes.split(",").map((scope) => scope.trim());
    if (!granted.includes("repo")) {
      throw new GitHubApiError(
        "The GitHub token has limited scopes (no full repo scope), so private repositories never appear. Regenerate it with the repo scope.",
      );
    }
  }

  function toSummary(item: GitHubSearchItem): IssueSummary {
    const repo = repoOf(item);
    const identifier = `${repo}#${item.number}`;
    const status = statusOf(item.state, item.draft);
    return {
      id: identifier,
      identifier,
      title: item.title,
      status,
      url: item.html_url,
      resourceType: "github-pr",
      text: [`GitHub PR ${identifier}: ${item.title}`, `URL: ${item.html_url}`, `Status: ${status}`].join("\n"),
    };
  }

  async function searchPulls(query: string, perPage: number): Promise<GitHubSearchItem[]> {
    const found = await rest<GitHubSearchResponse>(
      `/search/issues?q=${encodeURIComponent(query)}&sort=updated&order=desc&per_page=${perPage}`,
    );
    return found.items ?? [];
  }

  function toGateRef(item: GitHubSearchItem): PrGateRef {
    return { repo: repoOf(item), number: item.number, title: item.title, url: item.html_url };
  }

  /**
   * The current review posture of one PR: each reviewer's latest submitted
   * review decides. CHANGES_REQUESTED anywhere wins (it is the actionable
   * state), then any approval, then pending. Authored PRs are few, so the
   * per-PR reviews call stays cheap at gate-recompute cadence.
   */
  async function reviewDecision(repo: string, number: number): Promise<"changes_requested" | "approved" | "pending"> {
    const reviews = await rest<GitHubReview[]>(`/repos/${repo}/pulls/${number}/reviews?per_page=100`);
    const latest = new Map<string, GitHubReview>();
    for (const review of reviews) {
      const login = review.user?.login;
      if (!login || !review.state) continue;
      const prior = latest.get(login);
      if (!prior || (prior.submitted_at ?? "") < (review.submitted_at ?? "")) latest.set(login, review);
    }
    const states = [...latest.values()].map((review) => review.state);
    if (states.includes("CHANGES_REQUESTED")) return "changes_requested";
    if (states.includes("APPROVED")) return "approved";
    return "pending";
  }

  return {
    async search(query) {
      const normalized = query.trim();
      if (!normalized) return [];
      // An exact ref is cheapest and is what quick-add pastes; fall through to
      // a text search over the user's PRs for everything else.
      const exact = PR_KEY.exec(normalized);
      if (exact) {
        const pull = await rest<GitHubPull>(`/repos/${exact[1]}/pulls/${exact[2]}`);
        return [
          {
            id: normalized,
            identifier: normalized,
            title: pull.title,
            status: statusOf(pull.state, pull.draft),
            url: pull.html_url,
            resourceType: "github-pr",
            text: `GitHub PR ${normalized}: ${pull.title}\nURL: ${pull.html_url}`,
          },
        ];
      }
      const items = await searchPulls(`${normalized} type:pr`, 20);
      if (items.length === 0) await assertRepoScope();
      return items.map(toSummary);
    },

    async listAssigned() {
      // Assigned, authored, and review-requested PRs all belong on the board;
      // GitHub search ANDs qualifiers, so this is three queries merged by
      // identifier. Open drafts are included by state:open.
      const [assigned, authored, reviewRequested] = await Promise.all([
        searchPulls("type:pr state:open assignee:@me", 25),
        searchPulls("type:pr state:open author:@me", 25),
        searchPulls("type:pr state:open review-requested:@me", 25),
      ]);
      const seen = new Map<string, GitHubSearchItem>();
      for (const item of [...assigned, ...authored, ...reviewRequested]) {
        seen.set(`${repoOf(item)}#${item.number}`, item);
      }
      if (seen.size === 0) await assertRepoScope();
      return [...seen.values()]
        .sort((a, b) => (a.updated_at ?? "") < (b.updated_at ?? "") ? 1 : -1)
        .slice(0, 25)
        .map(toSummary);
    },

    async get(key): Promise<IssueDetail> {
      const ref = PR_KEY.exec(key.trim());
      if (!ref) throw new GitHubApiError(`Not a pull request reference: ${key}`);
      const pull = await rest<GitHubPull>(`/repos/${ref[1]}/pulls/${ref[2]}`);
      // The review decision rides along for the detail badge; a failure here
      // must not sink the whole fetch, so it degrades to no badge.
      const decision = await reviewDecision(ref[1], pull.number).catch(() => null);
      return {
        identifier: `${ref[1]}#${pull.number}`,
        title: pull.title,
        body: pull.body ?? "",
        url: pull.html_url,
        status: statusOf(pull.state, pull.draft),
        ...(decision ? { reviewDecision: decision } : {}),
      };
    },

    async reviewGates() {
      const [requested, authored] = await Promise.all([
        searchPulls("type:pr state:open review-requested:@me", 25),
        searchPulls("type:pr state:open author:@me", 25),
      ]);
      const changesRequested: PrGateRef[] = [];
      // Cap the fan-out: authored open PRs are few, and each costs one call.
      for (const item of authored.slice(0, 10)) {
        const repo = repoOf(item);
        const decision = await reviewDecision(repo, item.number).catch(() => "pending" as const);
        if (decision === "changes_requested") changesRequested.push(toGateRef(item));
      }
      return {
        reviewRequested: requested.map(toGateRef),
        changesRequested,
      };
    },
  };
}
