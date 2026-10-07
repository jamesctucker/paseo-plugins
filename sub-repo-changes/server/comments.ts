import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { DiffComment } from "../shared/diff";

const STORE_PATH = path.join(os.homedir(), ".paseo", "sub-repo-changes-comments.json");

type Store = Record<string, DiffComment[]>;

let cache: Store | null = null;
let writeQueue: Promise<void> = Promise.resolve();

function fileKey(repoPath: string, filePath: string): string {
  return `${repoPath}::${filePath}`;
}

async function loadStore(): Promise<Store> {
  if (cache) return cache;
  try {
    const raw = await fs.readFile(STORE_PATH, "utf8");
    cache = JSON.parse(raw) as Store;
  } catch {
    cache = {};
  }
  return cache;
}

function persist(store: Store): void {
  writeQueue = writeQueue.then(async () => {
    const tmp = `${STORE_PATH}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(store, null, 2), "utf8");
    await fs.rename(tmp, STORE_PATH);
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
