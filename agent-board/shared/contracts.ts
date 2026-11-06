import { defineAttachmentSource, defineRpc } from "@getpaseo/plugin";
import { z } from "zod";
import type { IssueDetail, IssueSummary } from "./tracker";

/**
 * The board's three adapter RPCs. `jira.search` doubles as the composer
 * attachment source's search, so quick-add, the Add-from-Jira sheet, and the
 * picker all resolve keys through one endpoint.
 */

const IssueSummarySchema = z.object({
  id: z.string(),
  identifier: z.string(),
  title: z.string(),
  status: z.string(),
  subtitle: z.string().optional(),
  url: z.url(),
  text: z.string(),
  resourceType: z.string(),
  route: z.enum(["rote", "creative"]).optional(),
});

export const IssueDetailSchema = z.object({
  identifier: z.string(),
  title: z.string(),
  body: z.string(),
  url: z.url(),
  status: z.string(),
  /** GitHub only: the PR's current review decision, for the detail badge. */
  reviewDecision: z.string().optional(),
});

export const issueSearchRpc = defineRpc({
  name: "jira.search",
  input: z.object({ query: z.string() }),
  output: z.object({ items: z.array(IssueSummarySchema) }),
});

export const issueListRpc = defineRpc({
  name: "jira.list",
  input: z.object({}),
  output: z.object({ items: z.array(IssueSummarySchema) }),
});

export const issueGetRpc = defineRpc({
  name: "jira.get",
  input: z.object({ key: z.string() }),
  output: IssueDetailSchema,
});

export const jiraAttachments = defineAttachmentSource({
  id: "jira-issues",
  title: "Jira issue",
  icon: "CircleDot",
  pickerTitle: "Attach a Jira issue",
  searchPlaceholder: "Search by key or text",
  search: issueSearchRpc,
});

/**
 * The GitHub channel. PRs are the only entity: they are the GitHub unit the
 * board can spawn against (checkoutSource) and the unit quick-add parses.
 * `github.search` doubles as the composer attachment source's search.
 */
export const githubSearchRpc = defineRpc({
  name: "github.search",
  input: z.object({ query: z.string() }),
  output: z.object({ items: z.array(IssueSummarySchema) }),
});

export const githubListRpc = defineRpc({
  name: "github.list",
  input: z.object({}),
  output: z.object({ items: z.array(IssueSummarySchema) }),
});

export const githubGetRpc = defineRpc({
  name: "github.get",
  input: z.object({ key: z.string() }),
  output: IssueDetailSchema,
});

export const githubAttachments = defineAttachmentSource({
  id: "github-prs",
  title: "GitHub PR",
  icon: "GitPullRequest",
  pickerTitle: "Attach a GitHub PR",
  searchPlaceholder: "Search by repo, number, or text",
  search: githubSearchRpc,
});

/**
 * The Linear channel: same adapter interface as Jira and GitHub, so keys
 * resolve to cards and issue bodies seed spawn prompts. `linear.search`
 * doubles as the composer attachment source's search.
 */
export const linearSearchRpc = defineRpc({
  name: "linear.search",
  input: z.object({ query: z.string() }),
  output: z.object({ items: z.array(IssueSummarySchema) }),
});

export const linearListRpc = defineRpc({
  name: "linear.list",
  input: z.object({}),
  output: z.object({ items: z.array(IssueSummarySchema) }),
});

export const linearGetRpc = defineRpc({
  name: "linear.get",
  input: z.object({ key: z.string() }),
  output: IssueDetailSchema,
});

export const linearAttachments = defineAttachmentSource({
  id: "linear-issues",
  title: "Linear issue",
  icon: "Layers",
  pickerTitle: "Attach a Linear issue",
  searchPlaceholder: "Search by key or text",
  search: linearSearchRpc,
});

/**
 * Gate reads (amendment 2026-11-06). Fresh tracker statuses for archived
 * cards (the Done-nag), the Linear project-as-chain read, and the GitHub
 * review asks. All read-only; the zero write-back doctrine is untouched.
 */
export const jiraStatusesRpc = defineRpc({
  name: "jira.statuses",
  input: z.object({ keys: z.array(z.string()).max(50) }),
  output: z.object({ statuses: z.record(z.string(), z.object({ status: z.string(), done: z.boolean() })) }),
});

export const linearStatusesRpc = defineRpc({
  name: "linear.statuses",
  input: z.object({ keys: z.array(z.string()).max(50) }),
  output: z.object({ statuses: z.record(z.string(), z.object({ status: z.string(), done: z.boolean() })) }),
});

const ChainIssueSchema = z.object({
  key: z.string(),
  title: z.string(),
  url: z.string(),
  status: z.string(),
  done: z.boolean(),
  route: z.enum(["rote", "creative"]).nullable(),
  blockedBy: z.array(z.string()),
});

export const linearChainRpc = defineRpc({
  name: "linear.chain",
  input: z.object({ key: z.string() }),
  output: z.object({
    projectId: z.string(),
    projectName: z.string(),
    issues: z.array(ChainIssueSchema),
  }),
});

const PrGateRefSchema = z.object({
  repo: z.string(),
  number: z.number().int().positive(),
  title: z.string(),
  url: z.string(),
});

export const githubReviewGatesRpc = defineRpc({
  // Method names must match /^[a-z][a-z0-9._-]*$/ — camelCase here fails
  // host validation at plugin load with "Invalid plugin RPC method".
  name: "github.review-gates",
  input: z.object({}),
  output: z.object({
    reviewRequested: z.array(PrGateRefSchema),
    changesRequested: z.array(PrGateRefSchema),
  }),
});

/**
 * Stopping a run from the board. The SDK has no cancel, so the server shells
 * to the daemon's CLI (better-paseo's approach); `board.capabilities` lets
 * the client hide the stop control when no CLI is reachable.
 */
export const boardStopRpc = defineRpc({
  name: "board.stop",
  input: z.object({ agentId: z.string() }),
  output: z.object({ ok: z.literal(true) }),
});

export const boardCapabilitiesRpc = defineRpc({
  name: "board.capabilities",
  input: z.object({}),
  output: z.object({ canStop: z.boolean() }),
});

export type IssueSearchItem = IssueSummary;
export type { IssueDetail, IssueSummary };