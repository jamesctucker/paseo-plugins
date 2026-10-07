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

type AttachmentItem = RpcOutput<typeof searchChangedFiles>["items"][number];

// The picker item alone can't answer the diff fetch: its id would need string
// parsing to recover the repo/file, and "untracked" isn't in the item at all.
interface Candidate {
  item: AttachmentItem;
  repoPath: string;
  filePath: string;
  untracked: boolean;
  score: number;
}

/**
 * Build composer attachment items for changed files across every open workspace
 * root. `rootPaths` comes from the handler, which resolves the daemon's open
 * workspaces.
 */
export async function searchChangedFileAttachments(
  { query }: RpcInput<typeof searchChangedFiles>,
  rootPaths: string[],
) {
  const candidates: Candidate[] = [];
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
        candidates.push({
          repoPath: repo.absPath,
          filePath: file.path,
          untracked: file.untracked,
          score,
          item: {
            id: `${repo.absPath}::${file.path}`,
            identifier: `${repo.relPath}/${file.path}`,
            title: path.basename(file.path),
            subtitle: `${repo.relPath === "." ? rootBasename(rootPath) : repo.relPath} · ${file.status}`,
            url: `file://${path.join(repo.absPath, file.path)}`,
            text: "", // filled lazily below for the top matches only
            resourceType: "file",
          },
        });
      }
    }
  }

  // Sort by match quality, then cap before fetching diffs.
  candidates.sort(
    (a, b) => a.score - b.score || a.item.identifier.localeCompare(b.item.identifier),
  );
  const top = candidates.slice(0, MAX_ITEMS);

  await Promise.all(
    top.map(async (candidate) => {
      const result = await getFileDiffText(candidate.repoPath, candidate.filePath, candidate.untracked);
      const diffBody = result.binary
        ? "(binary file — no textual diff)"
        : result.truncated || result.diff.length > DIFF_CONTEXT_CAP
          ? `${result.diff.slice(0, DIFF_CONTEXT_CAP)}\n…diff truncated…`
          : result.diff;
      candidate.item.text = [
        `Changed file: ${candidate.item.identifier}`,
        `Repository: ${candidate.repoPath}`,
        `Status: ${candidate.item.subtitle ?? "modified"}`,
        "",
        diffBody ? "```diff\n" + diffBody + "\n```" : "(empty diff; file may be untracked or unchanged)",
      ].join("\n");
    }),
  );

  return { items: top.map((candidate) => candidate.item) };
}

function rootBasename(rootPath: string): string {
  const parts = rootPath.split(path.sep).filter(Boolean);
  return parts[parts.length - 1] ?? rootPath;
}
