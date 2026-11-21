import { promises as fs } from "node:fs";
import path from "node:path";

/** A git repo found under an open workspace root. */
export interface DiscoveredRepo {
  /** Path relative to the workspace root, posix separators (e.g. "work/api"). */
  path: string;
  /** The repo directory's basename. */
  name: string;
  workspaceId: string;
  /** Absolute path of the workspace root the repo was found under. */
  workspaceDirectory: string;
}

export interface WorkspaceListEntry {
  id?: string;
  title?: string | null;
  workspaceDirectory?: string | null;
  projectRootPath?: string | null;
}

const MAX_DEPTH = 3;

// Vendored checkouts and build output are not quiz material, and skipping them
// keeps the walk fast on big monorepo workspaces.
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

async function isRepo(dir: string): Promise<boolean> {
  try {
    // Covers regular repos (.git directory), submodules, and worktrees (.git file).
    await fs.access(path.join(dir, ".git"));
    return true;
  } catch {
    return false;
  }
}

/**
 * Find every git repo under the given open workspace roots, depth-limited.
 * The root itself counts when it is a repo, so a single-repo workspace (the
 * common case) offers itself; a monorepo-style workspace additionally offers
 * every nested checkout. The same physical directory reached through two
 * workspace roots is listed once.
 */
export async function discoverRepos(entries: WorkspaceListEntry[]): Promise<DiscoveredRepo[]> {
  const found = new Map<string, DiscoveredRepo>();

  async function walk(workspaceId: string, root: string, dir: string, depth: number): Promise<void> {
    let stat;
    try {
      stat = await fs.stat(dir);
    } catch {
      return;
    }
    if (!stat.isDirectory()) return;
    if (await isRepo(dir)) {
      const relative = path.relative(root, dir).split(path.sep).join("/");
      // The root itself is a legitimate target (a single-repo workspace offers
      // its one repo), so it lists as "." rather than being skipped.
      const repoPath = relative === "" ? "." : relative;
      if (!found.has(dir)) {
        found.set(dir, {
          path: repoPath,
          name: path.basename(dir),
          workspaceId,
          workspaceDirectory: root,
        });
      }
    }
    if (depth >= MAX_DEPTH) return;
    let entriesIn;
    try {
      entriesIn = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    const pending: Promise<void>[] = [];
    for (const entry of entriesIn) {
      // withFileTypes isdir is false for symlinks, which keeps the walk from
      // escaping through a link planted inside the workspace.
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith(".") || SKIP_DIRS.has(entry.name)) continue;
      pending.push(walk(workspaceId, root, path.join(dir, entry.name), depth + 1));
    }
    await Promise.all(pending);
  }

  const pending: Promise<void>[] = [];
  for (const entry of entries) {
    const root = entry.workspaceDirectory ?? entry.projectRootPath;
    if (!root || !entry.id) continue;
    pending.push(walk(entry.id, root, root, 0));
  }
  await Promise.all(pending);
  return [...found.values()].sort((a, b) => a.path.localeCompare(b.path));
}

/** True when every path segment is a plain repo name (no traversal, no empty). */
export function isValidRepoPath(repoPath: string): boolean {
  if (repoPath === ".") return true;
  if (repoPath.includes("//") || repoPath.endsWith("/")) return false;
  return repoPath.split("/").every((segment) => /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(segment));
}

/**
 * Where the teacher writes lessons, relative to the workspace root. A leading
 * work/ segment is conventional (repos checked out under work/) but carries no
 * meaning in a lessons path, so it drops off — which also keeps lessons where
 * they already were for workspaces that have always used that layout.
 */
export function lessonDirFor(repoPath: string): string {
  const stripped = repoPath.startsWith("work/") ? repoPath.slice("work/".length) : repoPath;
  return path.join("learning", stripped);
}
