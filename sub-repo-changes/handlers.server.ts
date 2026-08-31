import type { output as ZodOutput } from "zod";
import type { PluginHandlerContext } from "@getpaseo/plugin/server";
import type { PaseoWorkspace } from "@getpaseo/client";
import type {
  addComment,
  getFileDiff,
  listComments,
  listRepos,
  removeComment,
  searchChangedFiles,
} from "./diff.shared";
import { getFileDiffText, listRepoSummaries } from "./git.server";
import { searchChangedFileAttachments } from "./attachments.server";
import { addFileComment, listFileComments, removeFileComment } from "./comments.server";

export async function handleListRepos({ rootPath }: ZodOutput<typeof listRepos.input>) {
  const result = await listRepoSummaries(rootPath);
  return { scannedAt: new Date().toISOString(), ...result };
}

export async function handleFileDiff({
  repoPath,
  filePath,
  untracked,
}: ZodOutput<typeof getFileDiff.input>) {
  return getFileDiffText(repoPath, filePath, untracked);
}

export function handleListComments({
  repoPath,
  filePath,
}: ZodOutput<typeof listComments.input>) {
  return listFileComments(repoPath, filePath);
}

export function handleAddComment({
  repoPath,
  filePath,
  side,
  line,
  body,
}: ZodOutput<typeof addComment.input>) {
  return addFileComment(repoPath, filePath, side, line, body);
}

export function handleRemoveComment({
  repoPath,
  filePath,
  commentId,
}: ZodOutput<typeof removeComment.input>) {
  return removeFileComment(repoPath, filePath, commentId);
}

export async function handleSearchChangedFiles(
  input: ZodOutput<typeof searchChangedFiles.input>,
  context: PluginHandlerContext,
) {
  let rootPaths: string[] = [];
  try {
    const result = await context.paseo.workspaces.list({});
    rootPaths = result.entries
      .map((entry: PaseoWorkspace) => entry.workspaceDirectory ?? entry.projectRootPath)
      .filter((root: string | undefined | null): root is string => Boolean(root));
  } catch (error) {
    console.error("Failed to list workspaces for attachment search", error);
  }
  return searchChangedFileAttachments(input, rootPaths);
}
