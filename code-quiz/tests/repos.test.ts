import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPrompt } from "../server/launch";
import { discoverRepos, isValidRepoPath, lessonDirFor } from "../server/repos";

/**
 * Build a throwaway workspace: each entry is a file path (posix separators)
 * relative to the root; ".git" entries are created as directories so the
 * walker sees repos where intended.
 */
let workspace: string;

async function makeWorkspace(entries: string[]): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "code-quiz-"));
  for (const entry of entries) {
    const target = path.join(root, ...entry.split("/"));
    if (entry.endsWith("/.git") || entry === ".git") {
      await fs.mkdir(target, { recursive: true });
    } else {
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, "x");
    }
  }
  return root;
}

describe("discoverRepos", () => {
  let root: string;
  const roots: string[] = [];

  beforeAll(async () => {
    root = await makeWorkspace([
      ".git", // root is a repo
      "work/.git", // nested repo under work/
      "work/api/.git", // repo inside the repo
      "src/.git", // repo at another path
      "work/node_modules/.git", // inside a skipped dir
      "docs/notes.txt", // not a repo
    ]);
    roots.push(root);
  });

  afterAll(async () => {
    await Promise.all(roots.map((dir) => fs.rm(dir, { recursive: true, force: true })));
  });

  it("finds the workspace root itself when it is a repo, plus nested repos", async () => {
    const repos = await discoverRepos([{ id: "ws-1", workspaceDirectory: root }]);
    const paths = repos.map((repo) => repo.path);
    expect(paths).toContain(".");
    expect(paths).toContain("work");
    expect(paths).toContain("work/api");
    expect(paths).toContain("src");
    expect(paths.some((p) => p.includes("node_modules"))).toBe(false);
    expect(repos.every((repo) => repo.workspaceId === "ws-1")).toBe(true);
  });

  it("walks at most three levels deep", async () => {
    const deep = await makeWorkspace(["a/b/c/.git", "a/b/c/d/.git"]);
    roots.push(deep);
    const repos = await discoverRepos([{ id: "ws-1", workspaceDirectory: deep }]);
    expect(repos.map((repo) => repo.path)).toEqual(["a/b/c"]);
  });

  it("lists the same physical repo once across overlapping workspaces", async () => {
    const repos = await discoverRepos([
      { id: "ws-1", workspaceDirectory: root },
      { id: "ws-2", workspaceDirectory: root },
    ]);
    expect(repos.filter((repo) => repo.path === "work/api")).toHaveLength(1);
  });

  it("skips roots that do not exist", async () => {
    const repos = await discoverRepos([{ id: "ws-1", workspaceDirectory: "/does/not/exist" }]);
    expect(repos).toEqual([]);
  });
});

describe("isValidRepoPath", () => {
  it("accepts plain and nested repo paths", () => {
    expect(isValidRepoPath("api")).toBe(true);
    expect(isValidRepoPath("work/api")).toBe(true);
    expect(isValidRepoPath("work/my-repo.v2")).toBe(true);
  });

  it("rejects traversal, absolute paths, and empty segments", () => {
    expect(isValidRepoPath("../secrets")).toBe(false);
    expect(isValidRepoPath("work/../secrets")).toBe(false);
    expect(isValidRepoPath("/etc/passwd")).toBe(false);
    expect(isValidRepoPath("work//api")).toBe(false);
    expect(isValidRepoPath("work/")).toBe(false);
    expect(isValidRepoPath(".git")).toBe(false);
  });

  it("allows the workspace root repo as .", () => {
    expect(isValidRepoPath(".")).toBe(true);
  });
});

describe("lessonDirFor", () => {
  it("drops a conventional work/ prefix", () => {
    expect(lessonDirFor("work/api")).toBe(path.join("learning", "api"));
    expect(lessonDirFor("api")).toBe(path.join("learning", "api"));
  });

  it("keeps other nesting and maps the root repo to learning itself", () => {
    expect(lessonDirFor("src/api")).toBe(path.join("learning", "src", "api"));
    expect(lessonDirFor(".")).toBe("learning");
  });
});

describe("buildPrompt", () => {
  it("mentions the repo path, the lesson dir, and a calibrating quiz", () => {
    const prompt = buildPrompt("work/api", "api");
    expect(prompt).toContain("`work/api/`");
    expect(prompt).toContain("`learning/api/`");
    expect(prompt).toContain("quizzing me");
  });

  it("uses the custom topic when given", () => {
    const prompt = buildPrompt("work/api", "api", "the payment flow");
    expect(prompt).toContain('"the payment flow"');
  });

  it("describes the workspace root repo without a bare dot", () => {
    const prompt = buildPrompt(".", "my-app");
    expect(prompt).toContain("this workspace's root repo");
    expect(prompt).not.toContain("`./`");
  });
});
