import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

// Last-used repo/focus lives in a homedir dotfile: per-daemon, not synced via
// the garage git repo, and readable before any workspace lookup.
const PREFS_PATH = path.join(os.homedir(), ".code-quiz-prefs.json");

export interface CodeQuizPrefs {
  repo: string;
  focusId?: string;
  topic?: string;
}

export async function readPrefs(): Promise<CodeQuizPrefs | null> {
  try {
    return JSON.parse(await fs.readFile(PREFS_PATH, "utf8")) as CodeQuizPrefs;
  } catch {
    return null;
  }
}

export async function writePrefs(prefs: CodeQuizPrefs): Promise<void> {
  await fs.writeFile(PREFS_PATH, JSON.stringify(prefs, null, 2));
}
