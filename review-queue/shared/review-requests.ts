import { defineRpc, defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

export const pullRequestSchema = z.object({
  repo: z.string(),
  number: z.number(),
  title: z.string(),
  url: z.string(),
  author: z.string(),
  isDraft: z.boolean(),
  reviewRequested: z.boolean(),
  assigned: z.boolean(),
  // Local clone of the PR's repo on the daemon host, when one exists; the client
  // needs it as the worktree source for "create review workspace".
  localCheckoutPath: z.string().nullable(),
  updatedAt: z.string(),
});

export type PullRequest = z.infer<typeof pullRequestSchema>;

export const listReviewRequests = defineRpc({
  name: "reviews.list",
  input: z.object({}),
  output: z.object({
    prs: z.array(pullRequestSchema),
    fetchedAt: z.string(),
  }),
});

/** Spawn defaults every installer can change in Settings; see spawnConfigDoc. */
export const DEFAULT_SPAWN_SPEC = "opencode/deepseek/deepseek-flash";
export const DEFAULT_THINKING_OPTION = "high";
export const DEFAULT_PROMPT_TEMPLATE =
  "Review pull request {repo}#{number} ({url}). The pull request is already " +
  "checked out in this workspace. Read the changes, then produce a tiered " +
  "findings report (critical, high, medium, low) with file and line references. " +
  "Do not merge or push.";

/**
 * Review-agent spawn config. The values are host-specific — which provider and
 * model to run, how hard it should think, and what to tell it — so they live in
 * a settings doc instead of the code.
 */
export const spawnConfigDoc = defineSettings({
  id: "spawn",
  scope: "host",
  version: 1,
  schema: z.object({
    /** "provider/model" as the daemon's agent-create API expects. */
    spawnSpec: z.string().default(DEFAULT_SPAWN_SPEC),
    /** Provider thinking level, e.g. "high"; meaning depends on the provider. */
    thinkingOptionId: z.string().default(DEFAULT_THINKING_OPTION),
    /** Prompt for the review agent; {repo}, {number}, and {url} are substituted. */
    promptTemplate: z.string().default(DEFAULT_PROMPT_TEMPLATE),
  }),
});

export type SpawnConfig = z.infer<typeof spawnConfigDoc.schema>;

/** Fill the {repo}/{number}/{url} placeholders in a prompt template. */
export function renderReviewPrompt(
  template: string,
  pr: { repo: string; number: number; url: string },
): string {
  return template
    .replaceAll("{repo}", pr.repo)
    .replaceAll("{number}", String(pr.number))
    .replaceAll("{url}", pr.url);
}
