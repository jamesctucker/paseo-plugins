import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

interface WorkspaceListEntry {
  id?: string;
  workspaceDirectory?: string | null;
  projectRootPath?: string | null;
}

// Everything keys off the garage checkout because the teach skill writes
// learning/ at its root and quizzes code under its work/ directory. Prefer the
// workspace the daemon already knows about so the teacher agent lands in the
// existing workspace instead of a duplicate; fall back to the conventional
// home-directory path so the plugin still works on a fresh host.
export async function resolveGarageRoot(entries: WorkspaceListEntry[]): Promise<string> {
  for (const entry of entries) {
    const dir = entry.workspaceDirectory ?? entry.projectRootPath;
    if (dir && path.basename(dir) === "the-garage") return dir;
  }
  return path.join(os.homedir(), "the-garage");
}

export async function listWorkRepos(garageRoot: string) {
  const workDir = path.join(garageRoot, "work");
  const entries = await fs.readdir(workDir, { withFileTypes: true });
  return entries
    .filter(
      (entry) =>
        entry.isDirectory() && !entry.name.startsWith(".") && !entry.name.endsWith(".git"),
    )
    .map((entry) => ({ name: entry.name, path: path.join(workDir, entry.name) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
