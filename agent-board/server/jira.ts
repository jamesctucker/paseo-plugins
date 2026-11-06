import type { IssueAdapter, IssueSummary } from "../shared/tracker";
import { adfToMarkdown } from "./adf";

/**
 * Jira Cloud REST v3 adapter. Tokens and network stay daemon-side; the client
 * only ever sees IssueSummary/IssueDetail values.
 */

export interface JiraAdapterConfig {
  domain: string;
  email: string;
  token: string;
  jql?: string;
  defaultJql?: string;
}

interface JiraFields {
  summary?: string;
  description?: unknown;
  status?: { name?: string; statusCategory?: { key?: string } };
  assignee?: { displayName?: string } | null;
  updated?: string;
  issuetype?: { name?: string };
  priority?: { name?: string };
}

interface JiraIssue {
  id: string;
  key: string;
  fields?: JiraFields;
}

const SEARCH_FIELDS = [
  "summary",
  "description",
  "status",
  "assignee",
  "updated",
  "issuetype",
  "priority",
].join(",");

function apiBase(domain: string): string {
  // The field accepts a bare site name, a bare host, or a pasted URL; keep
  // only the hostname so a pasted scheme does not double up.
  const raw = domain.trim().replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//, "").split(/[/?#]/)[0];
  if (!raw) throw new JiraApiError("No Jira domain configured. Open the Agent Board settings.");
  const host = raw.includes(".") ? raw : `${raw}.atlassian.net`;
  return `https://${host}`;
}

/** JQL string literals are double-quoted; embedded quotes are escaped twice. */
function jqlString(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export class JiraApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JiraApiError";
  }
}

interface SearchResponse {
  issues?: JiraIssue[];
}

/** The adapter plus the gate read the Done-nag needs (amendment 2026-11-06). */
export interface JiraAdapter extends IssueAdapter {
  /** Fresh status per key; `done` comes from the status category, not the name. */
  statuses(keys: string[]): Promise<Record<string, { status: string; done: boolean }>>;
}

export function createJiraAdapter(
  config: JiraAdapterConfig,
  request: typeof fetch = fetch,
): JiraAdapter {
  const base = apiBase(config.domain);
  const auth = `Basic ${btoa(`${config.email.trim()}:${config.token.trim()}`)}`;

  if (!config.token.trim()) {
    throw new JiraApiError("No Jira API token configured. Open the Agent Board settings.");
  }

  async function rest<T>(path: string, init?: RequestInit): Promise<T> {
    let response: Response;
    try {
      response = await request(`${base}${path}`, {
        ...init,
        headers: {
          Authorization: auth,
          Accept: "application/json",
          "Content-Type": "application/json",
          ...(init?.headers ?? {}),
        },
      });
    } catch (cause) {
      // Node fetch wraps DNS/TLS/URL failures in a generic "fetch failed";
      // unwrap the cause so the message says which host was unreachable.
      const reason =
        cause instanceof Error
          ? cause.cause instanceof Error
            ? cause.cause.message
            : cause.message
          : String(cause);
      throw new JiraApiError(`Could not reach Jira at ${base}: ${reason}`);
    }
    if (response.status === 401 || response.status === 403) {
      throw new JiraApiError("Jira rejected the token. Check the email and API token in settings.");
    }
    if (!response.ok) {
      throw new JiraApiError(`Jira request failed with HTTP ${response.status}`);
    }
    return (await response.json()) as T;
  }

  /**
   * search/jql answers anonymous callers with an empty 200, so a rejected
   * token is indistinguishable from "nothing assigned" until this probe
   * turns it into a clear auth error. Called only when a search comes back
   * empty; results present mean the token worked.
   */
  async function assertAuthenticated(): Promise<void> {
    await rest<{ accountId: string }>("/rest/api/3/myself");
  }

  function toSummary(issue: JiraIssue): IssueSummary {
    const fields = issue.fields ?? {};
    const status = fields.status?.name ?? "";
    const assignee = fields.assignee?.displayName;
    const subtitle = [status, assignee].filter(Boolean).join(" · ");
    return {
      id: issue.id,
      identifier: issue.key,
      title: fields.summary ?? issue.key,
      status,
      ...(subtitle ? { subtitle } : {}),
      url: `${base}/browse/${issue.key}`,
      resourceType: "jira-issue",
      text: summaryText(issue),
    };
  }

  function summaryText(issue: JiraIssue): string {
    const fields = issue.fields ?? {};
    const lines = [`Jira issue ${issue.key}: ${fields.summary ?? ""}`, `URL: ${base}/browse/${issue.key}`];
    if (fields.status?.name) lines.push(`Status: ${fields.status.name}`);
    if (fields.assignee?.displayName) lines.push(`Assignee: ${fields.assignee.displayName}`);
    lines.push("", adfToMarkdown(fields.description));
    return lines.join("\n");
  }

  return {
    async search(query) {
      const normalized = query.trim();
      if (!normalized) return [];
      // Exact keys are cheapest and are what quick-add pastes; fall through to
      // a text search for everything else. The JQL goes in the body: the same
      // request with a query string and no body is a 400 (verified live), and
      // text ~ does not match keys, so a broken exact call loses the issue.
      const exact = await rest<SearchResponse>("/rest/api/3/search/jql", {
        method: "POST",
        body: JSON.stringify({ jql: `key = ${jqlString(normalized)}`, maxResults: 5, fields: SEARCH_FIELDS.split(",") }),
      }).catch(() => null);
      const issues = exact?.issues ?? [];
      if (issues.length === 0) {
        const jql = `text ~ ${jqlString(normalized)} ORDER BY updated DESC`;
        const found = await rest<SearchResponse>("/rest/api/3/search/jql", {
          method: "POST",
          body: JSON.stringify({ jql, maxResults: 20, fields: SEARCH_FIELDS.split(",") }),
        });
        issues.push(...(found.issues ?? []));
      }
      if (issues.length === 0) await assertAuthenticated();
      return issues.map(toSummary);
    },

    async listAssigned() {
      const jql = config.jql?.trim() || config.defaultJql?.trim() || "assignee = currentUser() ORDER BY updated DESC";
      const found = await rest<SearchResponse>("/rest/api/3/search/jql", {
        method: "POST",
        body: JSON.stringify({ jql, maxResults: 25, fields: SEARCH_FIELDS.split(",") }),
      });
      const issues = found.issues ?? [];
      if (issues.length === 0) await assertAuthenticated();
      return issues.map(toSummary);
    },

    async get(key) {
      const issue = await rest<{ id: string; key: string; fields?: JiraFields }>(
        `/rest/api/3/issue/${encodeURIComponent(key)}?fields=${SEARCH_FIELDS}`,
      );
      return {
        identifier: issue.key,
        title: issue.fields?.summary ?? issue.key,
        body: adfToMarkdown(issue.fields?.description),
        url: `${base}/browse/${issue.key}`,
        status: issue.fields?.status?.name ?? "",
      };
    },

    async statuses(keys) {
      if (keys.length === 0) return {};
      const listed = keys.map(jqlString).join(", ");
      const found = await rest<SearchResponse>("/rest/api/3/search/jql", {
        method: "POST",
        body: JSON.stringify({ jql: `key in (${listed})`, maxResults: 50, fields: ["status"] }),
      });
      const statuses: Record<string, { status: string; done: boolean }> = {};
      for (const issue of found.issues ?? []) {
        statuses[issue.key] = {
          status: issue.fields?.status?.name ?? "",
          done: issue.fields?.status?.statusCategory?.key === "done",
        };
      }
      return statuses;
    },
  };
}