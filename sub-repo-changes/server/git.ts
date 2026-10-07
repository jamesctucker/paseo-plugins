import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import type { ChangedFile, RepoSummary } from "../shared/diff";

const execFileAsync = promisify(execFile);

const MAX_DEPTH = 4;
const STATUS_BUFFER = 16 * 1024 * 1024;
const DIFF_CAP = 512 * 1024;
const UNTRACKED_CAP = 512 * 1024;

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  ".turbo",
  ".cache",
  ".venv",
  "venv",
  "__pycache__",
  "dist",
  "build",
  "coverage",
  "Pods",
  "DerivedData",
  ".expo",
  ".gradle",
  "target",
  "vendor",
]);

interface GitRun {
  stdout: string;
  failed: boolean;
}

async function git(repoPath: string, args: string[], maxBuffer = STATUS_BUFFER): Promise<GitRun> {
  try {
    const result = await execFileAsync("git", ["-C", repoPath, ...args], {
      maxBuffer,
      encoding: "utf8",
    });
    return { stdout: result.stdout, failed: false };
  } catch (error) {
    const stdout = (error as { stdout?: string }).stdout ?? "";
    return { stdout: typeof stdout === "string" ? stdout : "", failed: true };
  }
}

async function hasGitMetadata(dir: string): Promise<boolean> {
  try {
    // Covers regular repos (.git directory), submodules, and worktrees (.git file).
    await fs.access(path.join(dir, ".git"));
    return true;
  } catch {
    return false;
  }
}

/** Find the root repo and every nested repo under it, depth-limited. */
export async function discoverRepos(rootPath: string): Promise<string[]> {
  const repos: string[] = [];

  async function walk(dir: string, depth: number): Promise<void> {
    if (await hasGitMetadata(dir)) {
      repos.push(dir);
      // Do not return: nested repos inside a repo (e.g. work/<repo>) are the
      // whole point — keep walking, minus the skip list below.
    }
    if (depth >= MAX_DEPTH) return;
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    const pending: Promise<void>[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith(".") || SKIP_DIRS.has(entry.name)) continue;
      pending.push(walk(path.join(dir, entry.name), depth + 1));
    }
    await Promise.all(pending);
  }

  await walk(rootPath, 0);
  return repos;
}

// Untracked OS/tool droppings carry no review value and otherwise dominate the
// list in large workspaces, so they never reach the panel. Tracked entries
// (even junk someone committed) always show, and user-authored tool config
// (e.g. .claude/) is never junk, no matter how cache-like it looks.
const JUNK_UNTRACKED_BASENAMES = new Set([".DS_Store", "Thumbs.db"]);
const JUNK_UNTRACKED_PREFIXES = [".playwright-mcp/"];

function isJunkUntracked(file: ChangedFile): boolean {
  if (!file.untracked) return false;
  const base = file.path.split("/").pop() ?? file.path;
  if (JUNK_UNTRACKED_BASENAMES.has(base)) return true;
  return JUNK_UNTRACKED_PREFIXES.some((prefix) => file.path.startsWith(prefix));
}

function classify(xy: string): ChangedFile["status"] | null {
  if (xy === "!!") return null; // ignored
  if (xy === "??") return "untracked";
  if (xy.includes("U")) return "unmerged";
  if (xy.includes("R")) return "renamed";
  if (xy.includes("C")) return "copied";
  if (xy.includes("D")) return "deleted";
  if (xy.includes("A")) return "added";
  return "modified";
}

function parsePorcelainZ(stdout: string): ChangedFile[] {
  const records = stdout.split("\0");
  const files: ChangedFile[] = [];
  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    if (!record || record.length < 4) continue;
    const xy = record.slice(0, 2);
    const status = classify(xy);
    const filePath = record.slice(3);
    if (!status || !filePath) continue;
    let oldPath: string | null = null;
    if (status === "renamed" || status === "copied") {
      oldPath = records[i + 1] || null;
      i += 1;
    }
    files.push({
      path: filePath,
      status,
      staged: xy[0] !== " " && xy[0] !== "?",
      untracked: status === "untracked",
      oldPath,
      additions: null,
      deletions: null,
    });
  }
  return files;
}

function parseNumstatZ(stdout: string): Map<string, { additions: number; deletions: number }> {
  const stats = new Map<string, { additions: number; deletions: number }>();
  const records = stdout.split("\0");
  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    if (!record) continue;
    const [add, del, ...rest] = record.split("\t");
    if (add === undefined || del === undefined) continue;
    // Rename entries have an empty path segment followed by old\0new.
    let filePath = rest.join("\t");
    if (!filePath) {
      filePath = records[i + 2] ?? records[i + 1] ?? "";
      i += 2;
      if (!filePath) continue;
    }
    const additions = add === "-" ? 0 : Number.parseInt(add, 10);
    const deletions = del === "-" ? 0 : Number.parseInt(del, 10);
    if (Number.isNaN(additions) || Number.isNaN(deletions)) continue;
    stats.set(filePath, { additions, deletions });
  }
  return stats;
}

async function headExists(repoPath: string): Promise<boolean> {
  const result = await git(repoPath, ["rev-parse", "--verify", "HEAD"]);
  return !result.failed;
}

async function summarizeRepo(repoPath: string, rootPath: string): Promise<RepoSummary> {
  const hasHead = await headExists(repoPath);
  const [branchResult, statusResult, worktreeStat, stagedStat, headStat] = await Promise.all([
    git(repoPath, ["rev-parse", "--abbrev-ref", "HEAD"]),
    git(repoPath, ["status", "--porcelain=v1", "-z", "--untracked-files=all", "--ignore-submodules=dirty"]),
    git(repoPath, ["diff", "--numstat", "-z", "--no-color"]),
    git(repoPath, ["diff", "--cached", "--numstat", "-z", "--no-color"]),
    hasHead
      ? git(repoPath, ["diff", "HEAD", "--numstat", "-z", "--no-color"])
      : Promise.resolve({ stdout: "", failed: false }),
  ]);

  const files = parsePorcelainZ(statusResult.stdout).filter((file) => !isJunkUntracked(file));
  // Merge worktree + index stats (or stats vs HEAD when available).
  const merged = new Map<string, { additions: number; deletions: number }>();
  const sources = hasHead ? [parseNumstatZ(headStat.stdout)] : [
    parseNumstatZ(worktreeStat.stdout),
    parseNumstatZ(stagedStat.stdout),
  ];
  for (const source of sources) {
    for (const [filePath, stat] of source) {
      const existing = merged.get(filePath);
      if (existing) {
        existing.additions += stat.additions;
        existing.deletions += stat.deletions;
      } else {
        merged.set(filePath, { ...stat });
      }
    }
  }
  for (const file of files) {
    if (file.untracked) continue;
    const stat = merged.get(file.path);
    if (stat) {
      file.additions = stat.additions;
      file.deletions = stat.deletions;
    }
  }

  let additions = 0;
  let deletions = 0;
  for (const file of files) {
    additions += file.additions ?? 0;
    deletions += file.deletions ?? 0;
  }

  return {
    absPath: repoPath,
    relPath: repoPath === rootPath ? "." : path.relative(rootPath, repoPath),
    branch: branchResult.failed ? "" : branchResult.stdout.trim(),
    files: files.sort((a, b) => a.path.localeCompare(b.path)),
    additions,
    deletions,
  };
}

export type RepoSummaryList = RepoSummary[];

export async function listRepoSummaries(rootPath: string): Promise<{
  repos: RepoSummary[];
  repoCount: number;
  error: string | null;
}> {
  try {
    const repoPaths = await discoverRepos(rootPath);
    const summaries = await Promise.all(
      repoPaths.map((repoPath) => summarizeRepo(repoPath, rootPath)),
    );
    // Nested repos show up in their parent as untracked directories; hide them.
    for (const summary of summaries) {
      summary.files = summary.files.filter((file) => {
        if (!file.untracked || !file.path.endsWith("/")) return true;
        const candidate = path.join(summary.absPath, file.path.slice(0, -1));
        return !summaries.some((other) => other.absPath !== summary.absPath && other.absPath === candidate);
      });
    }
    summaries.sort((a, b) => {
      if (a.relPath === ".") return -1;
      if (b.relPath === ".") return 1;
      return a.relPath.localeCompare(b.relPath);
    });
    return { repos: summaries, repoCount: summaries.length, error: null };
  } catch (error) {
    return { repos: [], repoCount: 0, error: error instanceof Error ? error.message : String(error) };
  }
}

function sliceDiff(diff: string): { diff: string; truncated: boolean } {
  if (diff.length <= DIFF_CAP) return { diff, truncated: false };
  return { diff: diff.slice(0, DIFF_CAP), truncated: true };
}

export async function getFileDiffText(
  repoPath: string,
  filePath: string,
  untracked: boolean,
): Promise<{ diff: string; truncated: boolean; binary: boolean }> {
  if (untracked) {
    // `git diff --no-index /dev/null <file>` renders a new-file diff; exit code 1
    // means "files differ", which is the success case here.
    const absPath = path.join(repoPath, filePath);
    let size = 0;
    try {
      size = (await fs.stat(absPath)).size;
    } catch {
      return { diff: "", truncated: false, binary: false };
    }
    if (size > UNTRACKED_CAP) {
      return { diff: "", truncated: true, binary: false };
    }
    const fd = await fs.open(absPath, "r");
    const head = Buffer.alloc(Math.min(size, 8192));
    await fd.read(head, 0, head.length, 0);
    await fd.close();
    if (head.includes(0)) {
      return { diff: "", truncated: false, binary: true };
    }
    const result = await git(repoPath, ["diff", "--no-index", "--no-color", "--", "/dev/null", filePath], DIFF_CAP * 2);
    if (!result.stdout) {
      return { diff: "", truncated: false, binary: false };
    }
    return { ...sliceDiff(result.stdout), binary: false };
  }

  const hasHead = await headExists(repoPath);
  let diff = "";
  if (hasHead) {
    const result = await git(repoPath, ["diff", "--no-color", "-U3", "HEAD", "--", filePath], DIFF_CAP * 2);
    diff = result.stdout;
  } else {
    const [worktree, staged] = await Promise.all([
      git(repoPath, ["diff", "--no-color", "-U3", "--", filePath], DIFF_CAP * 2),
      git(repoPath, ["diff", "--cached", "--no-color", "-U3", "--", filePath], DIFF_CAP * 2),
    ]);
    diff = [staged.stdout, worktree.stdout].filter(Boolean).join("\n");
  }
  if (!diff) {
    return { diff: "", truncated: false, binary: false };
  }
  const binary = diff.includes("Binary files") && !diff.includes("\n+");
  return { ...sliceDiff(diff), binary };
}
