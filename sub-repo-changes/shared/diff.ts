import { defineAttachmentSource, defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

/** A single changed file inside one git repository. */
export const ChangedFileSchema = z.object({
  path: z.string(),
  status: z.enum(["modified", "added", "deleted", "renamed", "copied", "untracked", "unmerged"]),
  staged: z.boolean(),
  untracked: z.boolean(),
  oldPath: z.string().nullable(),
  additions: z.number().nullable(),
  deletions: z.number().nullable(),
});
export type ChangedFile = z.output<typeof ChangedFileSchema>;

/** One git repository discovered under the workspace root (includes the root itself). */
export const RepoSummarySchema = z.object({
  absPath: z.string(),
  relPath: z.string(),
  branch: z.string(),
  files: z.array(ChangedFileSchema),
  additions: z.number(),
  deletions: z.number(),
});
export type RepoSummary = z.output<typeof RepoSummarySchema>;

export const listRepos = defineRpc({
  name: "diff.list-repos",
  input: z.object({ rootPath: z.string() }),
  output: z.object({
    scannedAt: z.string(),
    repos: z.array(RepoSummarySchema),
    repoCount: z.number(),
    error: z.string().nullable(),
  }),
});

export const getFileDiff = defineRpc({
  name: "diff.file",
  input: z.object({
    repoPath: z.string(),
    filePath: z.string(),
    untracked: z.boolean(),
  }),
  output: z.object({
    diff: z.string(),
    truncated: z.boolean(),
    binary: z.boolean(),
  }),
});

export const DiffCommentSchema = z.object({
  id: z.string(),
  side: z.enum(["old", "new"]),
  line: z.number().int(),
  body: z.string(),
  createdAt: z.string(),
});
export type DiffComment = z.output<typeof DiffCommentSchema>;

const commentFileRef = z.object({ repoPath: z.string(), filePath: z.string() });

export const listComments = defineRpc({
  name: "diff.comments-list",
  input: commentFileRef,
  output: z.object({ comments: z.array(DiffCommentSchema) }),
});

export const addComment = defineRpc({
  name: "diff.comments-add",
  input: commentFileRef.extend({
    side: z.enum(["old", "new"]),
    line: z.number().int(),
    body: z.string().min(1).max(4000),
  }),
  output: z.object({ comments: z.array(DiffCommentSchema) }),
});

export const removeComment = defineRpc({
  name: "diff.comments-remove",
  input: commentFileRef.extend({ commentId: z.string() }),
  output: z.object({ comments: z.array(DiffCommentSchema) }),
});

/** Composer attachment search over changed files in every open workspace. */
export const searchChangedFiles = defineRpc({
  name: "diff.search-changed-files",
  input: z.object({ query: z.string() }),
  output: z.object({
    items: z.array(
      z.object({
        id: z.string(),
        identifier: z.string(),
        title: z.string(),
        subtitle: z.string().optional(),
        url: z.string(),
        text: z.string(),
        resourceType: z.string(),
      }),
    ),
  }),
});

export const changedFiles = defineAttachmentSource({
  id: "changed-file",
  title: "Changed file",
  icon: "FileDiff",
  pickerTitle: "Attach changed file",
  searchPlaceholder: "Search changed files (incl. sub-repos)",
  search: searchChangedFiles,
});
