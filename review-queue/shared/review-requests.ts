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
