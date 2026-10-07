import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { DiffComment } from "../shared/diff";

const STORE_PATH = path.join(os.homedir(), ".paseo", "nested-changes-comments.json");
// Written by the plugin's previous identity; read once so existing comments survive the rename.
const LEGACY_STORE_PATH = path.join(os.homedir(), ".paseo", "sub-repo-changes-comments.json");

type Store = Record<string, DiffComment[]>;

let cache: Store | null = null;
let writeQueue: Promise<void> = Promise.resolve();

function fileKey(repoPath: string, filePath: string): string {
  return `${repoPath}::${filePath}`;
}

async function loadStore(): Promise<Store> {
  if (cache) return cache;
  for (const candidate of [STORE_PATH, LEGACY_STORE_PATH]) {
    try {
      const raw = await fs.readFile(candidate, "utf8");
      cache = JSON.parse(raw) as Store;
      return cache;
    } catch {
      // Try the next location; a missing file just means no comments yet.
    }
  }
  cache = {};
  return cache;
}

function persist(store: Store): void {
  // The trailing catch keeps the queue resolved: without it, one failed write
  // would reject the chain and every later comment would silently never save.
  writeQueue = writeQueue
    .catch(() => {})
    .then(async () => {
      const tmp = `${STORE_PATH}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(store, null, 2), "utf8");
      await fs.rename(tmp, STORE_PATH);
    })
    .catch((error) => {
      console.error("nested-changes: failed to persist comments", error);
    });
}

export async function listFileComments(repoPath: string, filePath: string) {
  const store = await loadStore();
  return { comments: store[fileKey(repoPath, filePath)] ?? [] };
}

export async function addFileComment(
  repoPath: string,
  filePath: string,
  side: "old" | "new",
  line: number,
  body: string,
) {
  const store = await loadStore();
  const key = fileKey(repoPath, filePath);
  const comment: DiffComment = {
    id: randomUUID(),
    side,
    line,
    body,
    createdAt: new Date().toISOString(),
  };
  store[key] = [...(store[key] ?? []), comment];
  persist(store);
  return { comments: store[key] };
}

export async function removeFileComment(repoPath: string, filePath: string, commentId: string) {
  const store = await loadStore();
  const key = fileKey(repoPath, filePath);
  store[key] = (store[key] ?? []).filter((comment) => comment.id !== commentId);
  persist(store);
  return { comments: store[key] };
}
