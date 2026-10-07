import path from "node:path";
import type { RpcInput, RpcOutput } from "@getpaseo/plugin";
import type { searchChangedFiles } from "../shared/diff";
import { getFileDiffText, listRepoSummaries, type RepoSummaryList } from "./git";

const DIFF_CONTEXT_CAP = 8000;
const SCAN_CACHE_MS = 5000;
const MAX_ITEMS = 10;

const scanCache = new Map<string, { at: number; repos: RepoSummaryList }>();

async function scanRoot(rootPath: string): Promise<RepoSummaryList> {
  const cached = scanCache.get(rootPath);
  if (cached && Date.now() - cached.at < SCAN_CACHE_MS) return cached.repos;
  const result = await listRepoSummaries(rootPath);
  const repos = result.repos.filter((repo) => repo.files.length > 0);
  scanCache.set(rootPath, { at: Date.now(), repos });
  return repos;
}

function matchScore(fileName: string, repoRelPath: string, query: string): number {
  if (!query) return 1;
  const needle = query.toLowerCase();
  const name = fileName.toLowerCase();
  const base = path.basename(name);
  if (base.includes(needle)) return 0;
  if (name.includes(needle)) return 1;
  if (repoRelPath.toLowerCase().includes(needle)) return 2;
  return -1;
}

/**
 * Build composer attachment items for changed files across every open workspace
 * root. `rootPaths` comes from the workspace picker context; when absent we fall
 * back to roots the daemon knows via a injected provider.
 */
export async function searchChangedFileAttachments(
  { query }: RpcInput<typeof searchChangedFiles>,
  rootPaths: string[],
) {
  const items: RpcOutput<typeof searchChangedFiles>["items"] = [];
  const seenRoots = new Set<string>();

  for (const rootPath of rootPaths) {
    if (seenRoots.has(rootPath)) continue;
    seenRoots.add(rootPath);
    let repos: RepoSummaryList;
    try {
      repos = await scanRoot(rootPath);
    } catch {
      continue;
    }

    for (const repo of repos) {
      for (const file of repo.files) {
        if (file.path.endsWith("/")) continue; // collapsed untracked dir
        const score = matchScore(file.path, repo.relPath, query ?? "");
        if (score < 0) continue;
        items.push({
          id: `${repo.absPath}::${file.path}`,
          identifier: `${repo.relPath}/${file.path}`,
          title: path.basename(file.path),
          subtitle: `${repo.relPath === "." ? rootBasename(rootPath) : repo.relPath} · ${file.status}`,
          url: `file://${path.join(repo.absPath, file.path)}`,
          text: "", // filled lazily below for the top matches only
          resourceType: "file",
        });
        void score;
      }
    }
  }

  // Sort by match quality, then cap before fetching diffs.
  items.sort((a, b) => {
    const scoreA = matchScore(a.identifier, a.subtitle ?? "", query ?? "");
    const scoreB = matchScore(b.identifier, b.subtitle ?? "", query ?? "");
    return scoreA - scoreB || a.identifier.localeCompare(b.identifier);
  });
  const top = items.slice(0, MAX_ITEMS);

  await Promise.all(
    top.map(async (item) => {
      const [repoPath, filePath] = item.id.split("::");
      const untracked = item.subtitle?.endsWith("untracked") ?? false;
      const result = await getFileDiffText(repoPath, filePath, untracked);
      const diffBody = result.binary
        ? "(binary file — no textual diff)"
        : result.truncated
          ? `${result.diff.slice(0, DIFF_CONTEXT_CAP)}\n…diff truncated…`
          : result.diff.length > DIFF_CONTEXT_CAP
            ? `${result.diff.slice(0, DIFF_CONTEXT_CAP)}\n…diff truncated…`
            : result.diff;
      item.text = [
        `Changed file: ${item.identifier}`,
        repoPath ? `Repository: ${repoPath}` : "",
        `Status: ${item.subtitle ?? "modified"}`,
        "",
        diffBody ? "```diff\n" + diffBody + "\n```" : "(empty diff; file may be untracked or unchanged)",
      ]
        .filter(Boolean)
        .join("\n");
    }),
  );

  return { items: top };
}

export function basenameRoot(rootPath: string): string {
  return rootBasename(rootPath);
}

function rootBasename(rootPath: string): string {
  const parts = rootPath.split(path.sep).filter(Boolean);
  return parts[parts.length - 1] ?? rootPath;
}
