/**
 * Tracker-agnostic issue model. The board renders IssueSummary rows and seeds
 * spawn prompts from IssueDetail; adapters (Jira now, Linear later) map their
 * payloads onto these shapes. Keeping the model here is what makes the adapter
 * interface swappable.
 */

export interface IssueSummary {
  id: string;
  /** Tracker key, e.g. PROJ-142. */
  identifier: string;
  title: string;
  /** Tracker status name, mirrored read-only onto the card badge. */
  status: string;
  subtitle?: string;
  url: string;
  /** Flattened snapshot for prompt attachments. */
  text: string;
  resourceType: string;
}

export interface IssueDetail {
  identifier: string;
  title: string;
  /** Markdown body used to seed a spawn prompt. */
  body: string;
  url: string;
  status: string;
}

export interface IssueAdapter {
  search(query: string): Promise<IssueSummary[]>;
  listAssigned(): Promise<IssueSummary[]>;
  get(key: string): Promise<IssueDetail>;
}

const JIRA_KEY = /^[A-Z][A-Z0-9]+-\d+$/i;

/**
 * GitHub pull request reference: `owner/repo#123`, or a github.com URL with a
 * `/pull/<n>` path. Issues are deliberately not parsed here; only pull requests
 * carry a checkoutSource the spawn loop can act on.
 */
const GITHUB_SHORT = /^([\w.-]+\/[\w.-]+)#(\d+)$/;
const GITHUB_URL = /^https?:\/\/(?:www\.)?github\.com\/([\w.-]+\/[\w.-]+)\/pull\/(\d+)/;

export type QuickAdd =
  | { kind: "jira"; key: string }
  | { kind: "github"; repo: string; number: number }
  | { kind: "prompt"; title: string };

export function parseQuickAdd(input: string): QuickAdd {
  const trimmed = input.trim();
  if (JIRA_KEY.test(trimmed)) {
    return { kind: "jira", key: trimmed.toUpperCase() };
  }
  const short = GITHUB_SHORT.exec(trimmed);
  if (short) {
    return { kind: "github", repo: short[1], number: Number(short[2]) };
  }
  const url = GITHUB_URL.exec(trimmed);
  if (url) {
    return { kind: "github", repo: url[1], number: Number(url[2]) };
  }
  return { kind: "prompt", title: trimmed };
}

export function isJiraKey(input: string): boolean {
  return JIRA_KEY.test(input.trim());
}