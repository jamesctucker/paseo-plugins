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
});

export const IssueDetailSchema = z.object({
  identifier: z.string(),
  title: z.string(),
  body: z.string(),
  url: z.url(),
  status: z.string(),
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

export type IssueSearchItem = IssueSummary;
export type { IssueDetail, IssueSummary };