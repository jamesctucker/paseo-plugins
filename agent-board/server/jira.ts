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
  status?: { name?: string };
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
  const host = domain.trim();
  if (!host) throw new Error("No Jira domain configured. Open the Agent Board settings.");
  return host.includes(".") ? `https://${host}` : `https://${host}.atlassian.net`;
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

export function createJiraAdapter(
  config: JiraAdapterConfig,
  request: typeof fetch = fetch,
): IssueAdapter {
  const base = apiBase(config.domain);
  const auth = `Basic ${btoa(`${config.email.trim()}:${config.token.trim()}`)}`;

  if (!config.token.trim()) {
    throw new JiraApiError("No Jira API token configured. Open the Agent Board settings.");
  }

  async function rest<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await request(`${base}${path}`, {
      ...init,
      headers: {
        Authorization: auth,
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
    if (response.status === 401 || response.status === 403) {
      throw new JiraApiError("Jira rejected the token. Check the email and API token in settings.");
    }
    if (!response.ok) {
      throw new JiraApiError(`Jira request failed with HTTP ${response.status}`);
    }
    return (await response.json()) as T;
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
      // a text search for everything else.
      const exact = await rest<SearchResponse>(
        `/rest/api/3/search/jql?jql=${encodeURIComponent(`key = ${jqlString(normalized)}`)}&maxResults=5&fields=${SEARCH_FIELDS}`,
        { method: "POST" },
      ).catch(() => null);
      if (exact?.issues?.length) return exact.issues.map(toSummary);
      const jql = `text ~ ${jqlString(normalized)} ORDER BY updated DESC`;
      const found = await rest<SearchResponse>("/rest/api/3/search/jql", {
        method: "POST",
        body: JSON.stringify({ jql, maxResults: 20, fields: SEARCH_FIELDS.split(",") }),
      });
      return (found.issues ?? []).map(toSummary);
    },

    async listAssigned() {
      const jql = config.jql?.trim() || config.defaultJql?.trim() || "assignee = currentUser() ORDER BY updated DESC";
      const found = await rest<SearchResponse>("/rest/api/3/search/jql", {
        method: "POST",
        body: JSON.stringify({ jql, maxResults: 25, fields: SEARCH_FIELDS.split(",") }),
      });
      return (found.issues ?? []).map(toSummary);
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
  };
}