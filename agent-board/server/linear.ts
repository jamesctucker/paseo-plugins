import type { IssueAdapter, IssueDetail, IssueSummary } from "../shared/tracker";
import { parseRoute, type ChainInfo } from "../shared/gates";

/**
 * Linear GraphQL adapter. The API key stays daemon-side; the client only ever
 * sees IssueSummary/IssueDetail values. Personal API keys are sent verbatim
 * as the Authorization header (no Bearer prefix). Descriptions arrive as
 * markdown, which is what the spawn seed wants — and where the `Route:`
 * doctrine line lives, so summaries carry it too.
 */

export interface LinearAdapterConfig {
  apiKey: string;
}

interface LinearIssueNode {
  identifier: string;
  title: string;
  url: string;
  description?: string | null;
  state?: { name?: string; type?: string } | null;
  team?: { key?: string } | null;
}

interface LinearRelationNode {
  type?: string;
  relatedIssue?: { identifier?: string } | null;
}

interface GqlResponse {
  data?: Record<string, unknown>;
  errors?: { message?: string }[];
}

const API = "https://api.linear.app/graphql";

/** Tracker key, e.g. ENG-123 — the same shape quick-add parses for Jira. */
const LINEAR_KEY = /^[A-Z][A-Z0-9]+-\d+$/i;

const ISSUE_FIELDS = "identifier title url description state { name type } team { key }";

/** Terminal states self-clear gates; everything else is still open. */
function isDoneState(type: string | undefined): boolean {
  return type === "completed" || type === "canceled";
}

/** The adapter plus the gate reads: statuses and the project-as-chain. */
export interface LinearAdapter extends IssueAdapter {
  statuses(keys: string[]): Promise<Record<string, { status: string; done: boolean }>>;
  /** The chain an issue belongs to: its project, ordered by blocked-by. */
  chain(issueKey: string): Promise<ChainInfo>;
}

export class LinearApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LinearApiError";
  }
}

export function createLinearAdapter(
  config: LinearAdapterConfig,
  request: typeof fetch = fetch,
): LinearAdapter {
  if (!config.apiKey.trim()) {
    throw new LinearApiError("No Linear API key configured. Open the Agent Board settings.");
  }
  const auth = config.apiKey.trim();

  async function gql<T>(query: string): Promise<T> {
    let response: Response;
    try {
      response = await request(API, {
        method: "POST",
        headers: { Authorization: auth, "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : String(cause);
      throw new LinearApiError(`Could not reach Linear: ${reason}`);
    }
    if (response.status === 401 || response.status === 403) {
      throw new LinearApiError("Linear rejected the API key. Check the key in settings.");
    }
    if (!response.ok) {
      throw new LinearApiError(`Linear request failed with HTTP ${response.status}`);
    }
    const payload = (await response.json()) as GqlResponse;
    if (payload.errors?.length) {
      const message = payload.errors[0]?.message ?? "unknown GraphQL error";
      if (/auth/i.test(message)) {
        throw new LinearApiError("Linear rejected the API key. Check the key in settings.");
      }
      throw new LinearApiError(`Linear error: ${message}`);
    }
    return (payload.data ?? {}) as T;
  }

  function toSummary(node: LinearIssueNode): IssueSummary {
    const status = node.state?.name ?? "";
    const route = parseRoute(node.description);
    return {
      id: node.identifier,
      identifier: node.identifier,
      title: node.title,
      status,
      url: node.url,
      resourceType: "linear-issue",
      text: summaryText(node),
      // Explicit undefined is not valid JSON across the RPC boundary.
      ...(route ? { route } : {}),
    };
  }

  function summaryText(node: LinearIssueNode): string {
    const lines = [`Linear issue ${node.identifier}: ${node.title}`, `URL: ${node.url}`];
    if (node.state?.name) lines.push(`Status: ${node.state.name}`);
    if (node.description) lines.push("", node.description);
    return lines.join("\n");
  }

  async function fetchIssue(key: string): Promise<LinearIssueNode | null> {
    const data = await gql<{ issue: LinearIssueNode | null }>(
      `{ issue(id: ${JSON.stringify(key)}) { ${ISSUE_FIELDS} } }`,
    );
    return data.issue;
  }

  return {
    async search(query) {
      const normalized = query.trim();
      if (!normalized) return [];
      // Exact keys are cheapest and are what quick-add pastes; fall through to
      // a text search for everything else.
      if (LINEAR_KEY.test(normalized)) {
        const issue = await fetchIssue(normalized.toUpperCase());
        if (issue) return [toSummary(issue)];
      }
      const data = await gql<{ searchIssues: { nodes: LinearIssueNode[] } }>(
        `{ searchIssues(term: ${JSON.stringify(normalized)}, first: 20) { nodes { ${ISSUE_FIELDS} } } }`,
      );
      return (data.searchIssues?.nodes ?? []).map(toSummary);
    },

    async listAssigned() {
      const data = await gql<{ viewer: { assignedIssues: { nodes: LinearIssueNode[] } } }>(
        `{ viewer { assignedIssues(first: 25, orderBy: updatedAt, filter: { state: { type: { nin: ["completed", "canceled"] } } }) { nodes { ${ISSUE_FIELDS} } } } }`,
      );
      return (data.viewer?.assignedIssues?.nodes ?? []).map(toSummary);
    },

    async get(key): Promise<IssueDetail> {
      const issue = await fetchIssue(key.trim().toUpperCase());
      if (!issue) throw new LinearApiError(`No Linear issue found for ${key}`);
      return {
        identifier: issue.identifier,
        title: issue.title,
        body: issue.description ?? "",
        url: issue.url,
        status: issue.state?.name ?? "",
      };
    },

    async statuses(keys) {
      if (keys.length === 0) return {};
      const data = await gql<{ issues: { nodes: LinearIssueNode[] } }>(
        `{ issues(first: 50, filter: { identifier: { in: ${JSON.stringify(keys.map((k) => k.toUpperCase()))} } }) { nodes { identifier state { name type } } } }`,
      );
      const statuses: Record<string, { status: string; done: boolean }> = {};
      for (const node of data.issues?.nodes ?? []) {
        statuses[node.identifier] = { status: node.state?.name ?? "", done: isDoneState(node.state?.type) };
      }
      return statuses;
    },

    async chain(issueKey) {
      const found = await gql<{ issue: { project?: { id: string; name: string } | null } | null }>(
        `{ issue(id: ${JSON.stringify(issueKey.trim().toUpperCase())}) { project { id name } } }`,
      );
      const project = found.issue?.project;
      if (!project) throw new LinearApiError(`${issueKey} is not in a Linear project — no chain to read.`);
      const data = await gql<{
        project: { issues: { nodes: (LinearIssueNode & { relations?: { nodes: LinearRelationNode[] } })[] } };
      }>(
        `{ project(id: ${JSON.stringify(project.id)}) { issues(first: 100) { nodes { ${ISSUE_FIELDS} relations(first: 25) { nodes { type relatedIssue { identifier } } } } } } }`,
      );
      const nodes = data.project?.issues?.nodes ?? [];
      // Relations arrive outgoing: "blocks" points at the blocked issue, so
      // blocked-by is computed backwards over every issue's relations. The
      // "blocked_by" spelling is handled too — it costs nothing to be sure.
      const blockedBy = new Map<string, Set<string>>();
      for (const node of nodes) {
        for (const relation of node.relations?.nodes ?? []) {
          const other = relation.relatedIssue?.identifier;
          if (!other) continue;
          const pair: [string, string] | null =
            relation.type === "blocks"
              ? [other, node.identifier]
              : relation.type === "blocked_by"
                ? [node.identifier, other]
                : null;
          if (!pair) continue;
          const [blocked, blocker] = pair;
          const set = blockedBy.get(blocked) ?? new Set<string>();
          set.add(blocker);
          blockedBy.set(blocked, set);
        }
      }
      return {
        projectId: project.id,
        projectName: project.name,
        issues: nodes.map((node) => ({
          key: node.identifier,
          title: node.title,
          url: node.url,
          status: node.state?.name ?? "",
          done: isDoneState(node.state?.type),
          route: parseRoute(node.description),
          blockedBy: [...(blockedBy.get(node.identifier) ?? [])],
        })),
      };
    },
  };
}
