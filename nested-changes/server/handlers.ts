import type { RpcInput } from "@getpaseo/plugin";
import type { PluginHandlerContext } from "@getpaseo/plugin/server";
import type {
  addComment,
  getFileDiff,
  listComments,
  listRepos,
  removeComment,
  searchChangedFiles,
} from "../shared/diff";
import { getFileDiffText, listRepoSummaries } from "./git";
import { searchChangedFileAttachments } from "./attachments";
import { addFileComment, listFileComments, removeFileComment } from "./comments";

export async function handleListRepos({ rootPath }: RpcInput<typeof listRepos>) {
  const result = await listRepoSummaries(rootPath);
  return { scannedAt: new Date().toISOString(), ...result };
}

export async function handleFileDiff({
  repoPath,
  filePath,
  untracked,
}: RpcInput<typeof getFileDiff>) {
  return getFileDiffText(repoPath, filePath, untracked);
}

export function handleListComments({
  repoPath,
  filePath,
}: RpcInput<typeof listComments>) {
  return listFileComments(repoPath, filePath);
}

export function handleAddComment({
  repoPath,
  filePath,
  side,
  line,
  body,
}: RpcInput<typeof addComment>) {
  return addFileComment(repoPath, filePath, side, line, body);
}

export function handleRemoveComment({
  repoPath,
  filePath,
  commentId,
}: RpcInput<typeof removeComment>) {
  return removeFileComment(repoPath, filePath, commentId);
}

export async function handleSearchChangedFiles(
  input: RpcInput<typeof searchChangedFiles>,
  context: PluginHandlerContext,
) {
  let rootPaths: string[] = [];
  try {
    const result = await context.paseo.workspaces.list({});
    // The workspace entry type flows in through PluginHandlerContext; importing
    // @getpaseo/client directly would break Git installs, which have no
    // node_modules and only resolve host-provided modules.
    rootPaths = result.entries
      .map((entry) => entry.workspaceDirectory ?? entry.projectRootPath)
      .filter((root: string | undefined | null): root is string => Boolean(root));
  } catch (error) {
    console.error("Failed to list workspaces for attachment search", error);
  }
  return searchChangedFileAttachments(input, rootPaths);
}
