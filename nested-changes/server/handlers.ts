import path from "node:path";
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
import { containedPath } from "./containment";
import { getFileDiffText, listRepoSummaries } from "./git";
import { searchChangedFileAttachments } from "./attachments";
import { addFileComment, listFileComments, removeFileComment } from "./comments";

export async function handleListRepos(
  { rootPath }: RpcInput<typeof listRepos>,
  context: PluginHandlerContext,
) {
  const safeRoot = await containedPath(rootPath, context);
  if (!safeRoot) {
    return { scannedAt: new Date().toISOString(), repos: [], repoCount: 0, error: "Workspace directory not found" };
  }
  const result = await listRepoSummaries(safeRoot);
  return { scannedAt: new Date().toISOString(), ...result };
}

export async function handleFileDiff(
  { repoPath, filePath, untracked }: RpcInput<typeof getFileDiff>,
  context: PluginHandlerContext,
) {
  const safeRepo = await containedPath(repoPath, context);
  if (!safeRepo) {
    return { diff: "", truncated: false, binary: false };
  }
  if (untracked) {
    // The untracked branch reads the file straight off disk, so the joined
    // path — not just the repo — must resolve inside a workspace. The tracked
    // branch needs no file-level check: git refuses pathspecs outside the
    // repository, so a diff of tracked files cannot leave the repo.
    const safeFile = await containedPath(path.join(safeRepo, filePath), context);
    if (!safeFile) {
      return { diff: "", truncated: false, binary: false };
    }
    return getFileDiffText(safeRepo, path.relative(safeRepo, safeFile), true);
  }
  return getFileDiffText(safeRepo, filePath, false);
}

export async function handleListComments(
  { repoPath, filePath }: RpcInput<typeof listComments>,
  context: PluginHandlerContext,
) {
  await requireRepo(repoPath, context);
  return listFileComments(repoPath, filePath);
}

export async function handleAddComment(
  { repoPath, filePath, side, line, body }: RpcInput<typeof addComment>,
  context: PluginHandlerContext,
) {
  await requireRepo(repoPath, context);
  return addFileComment(repoPath, filePath, side, line, body);
}

export async function handleRemoveComment(
  { repoPath, filePath, commentId }: RpcInput<typeof removeComment>,
  context: PluginHandlerContext,
) {
  await requireRepo(repoPath, context);
  return removeFileComment(repoPath, filePath, commentId);
}

// Comment keys persist forever, so a rogue caller must not be able to grow
// the store with arbitrary paths — the repo must be a real open workspace.
async function requireRepo(repoPath: string, context: PluginHandlerContext): Promise<void> {
  const safeRepo = await containedPath(repoPath, context);
  if (!safeRepo) throw new Error("Repository not found");
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
