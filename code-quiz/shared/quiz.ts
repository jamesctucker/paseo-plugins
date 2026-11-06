import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const listRepos = defineRpc({
  name: "code-quiz.list-repos",
  input: z.object({}),
  output: z.object({
    garageRoot: z.string(),
    repos: z.array(z.object({ name: z.string(), path: z.string() })),
    last: z
      .object({
        repo: z.string(),
        focusId: z.string().optional(),
        topic: z.string().optional(),
      })
      .nullable(),
  }),
});

// repo is a single path segment; the server joins it under <garage>/work and
// the regex is what keeps a crafted value from escaping that directory. focusId
// and topic arrive unresolved so the server can both compose the prompt and
// persist the exact UI state for next visit.
export const launchTeacher = defineRpc({
  name: "code-quiz.launch-teacher",
  input: z.object({
    repo: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/),
    focusId: z.string().optional(),
    topic: z.string().max(200).optional(),
  }),
  output: z.object({
    agentId: z.string(),
    workspaceId: z.string(),
    title: z.string(),
  }),
});
