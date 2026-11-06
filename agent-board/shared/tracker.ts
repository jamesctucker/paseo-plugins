/**
 * Tracker-agnostic issue model. The board renders IssueSummary rows and seeds
 * spawn prompts from IssueDetail; the Jira, GitHub, and Linear adapters map
 * their payloads onto these shapes. Keeping the model here is what makes the
 * adapter interface swappable.
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
  /** Linear's `Route:` doctrine line, when the adapter can see a description. */
  route?: "rote" | "creative";
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
  | { kind: "jira"; key: string; task?: string }
  | { kind: "github"; repo: string; number: number; task?: string }
  | { kind: "gate"; text: string }
  | { kind: "prompt"; title: string };

/**
 * Quick-add grammar: a bare key/ref is the whole-issue task; `ref: task title`
 * adds a named task under that issue (brief amendment 2026-11-05); `! text`
 * writes a manual "Waiting on you" gate (amendment 2026-11-06); anything else
 * is a prompt card title.
 */
export function parseQuickAdd(input: string): QuickAdd {
  const trimmed = input.trim();
  if (trimmed.startsWith("!")) {
    const text = trimmed.slice(1).trim();
    if (text) return { kind: "gate", text };
  }
  // URLs carry their own colon, so they match before the task split.
  const url = GITHUB_URL.exec(trimmed);
  if (url) {
    return { kind: "github", repo: url[1], number: Number(url[2]) };
  }
  const [refPart, ...taskParts] = trimmed.split(":");
  const task = taskParts.length > 0 ? taskParts.join(":").trim() || undefined : undefined;
  const ref = task !== undefined ? refPart.trim() : trimmed;
  if (JIRA_KEY.test(ref)) {
    return { kind: "jira", key: ref.toUpperCase(), task };
  }
  const short = GITHUB_SHORT.exec(ref);
  if (short) {
    return { kind: "github", repo: short[1], number: Number(short[2]), task };
  }
  return { kind: "prompt", title: trimmed };
}

export function isJiraKey(input: string): boolean {
  return JIRA_KEY.test(input.trim());
}