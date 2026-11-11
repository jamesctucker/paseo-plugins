import { defineRpc } from "@getpaseo/plugin";
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
