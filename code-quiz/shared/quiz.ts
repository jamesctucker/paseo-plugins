import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const listRepos = defineRpc({
  name: "code-quiz.list-repos",
  input: z.object({}),
  output: z.object({
    repos: z.array(
      z.object({
        /** Unique identity: workspace id plus workspace-relative path. Paths
         * alone collide across workspaces (every single-repo workspace lists
         * "."), so selection and restore key on this instead. */
        id: z.string(),
        /** Path relative to its workspace root, e.g. "work/api" (or "." for
         * a workspace that is itself a single repo). */
        path: z.string(),
        /** Display name: the repo directory's basename. */
        name: z.string(),
        /** Id of the workspace the repo lives under; the teacher runs there. */
        workspaceId: z.string(),
        /** Workspace title, shown as row context when several workspaces are open. */
        workspaceName: z.string(),
      }),
    ),
    last: z
      .object({
        repo: z.string(),
        focusId: z.string().optional(),
        topic: z.string().optional(),
      })
      .nullable(),
  }),
});

// repoPath is workspace-relative and discovered server-side; the segment
// charset (each piece of the path must match the repo-name regex, so no "..",
// absolute paths, or empty segments) is the first guard, and the server
// additionally stats the joined path and requires it to stay under the
// workspace root. focusId and topic arrive unresolved so the server can both
// compose the prompt and persist the exact UI state for next visit.
export const launchTeacher = defineRpc({
  name: "code-quiz.launch-teacher",
  input: z.object({
    workspaceId: z.string().min(1),
    repoPath: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._/-]*$/),
    focusId: z.string().optional(),
    topic: z.string().max(200).optional(),
  }),
  output: z.object({
    agentId: z.string(),
    workspaceId: z.string(),
    title: z.string(),
  }),
});
