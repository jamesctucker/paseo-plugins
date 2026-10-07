import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterAll, describe, expect, it } from "vitest";
import { getFileDiffText, listRepoSummaries } from "../server/git";

const execFileAsync = promisify(execFile);

// Commits need an identity; pass it per-invocation so the user's global git
// config is never touched.
async function git(repoPath: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", [
    "-C",
    repoPath,
    "-c",
    "user.email=test@example.com",
    "-c",
    "user.name=Test",
    ...args,
  ]);
  return stdout;
}

async function initRepo(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
  await git(dir, ["init"]);
}

const tmpRoots: string[] = [];

async function makeTmpRoot(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "nested-changes-test-"));
  tmpRoots.push(dir);
  return dir;
}

afterAll(async () => {
  await Promise.all(tmpRoots.map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe("listRepoSummaries", () => {
  it("summarizes modified and untracked files, filtering untracked junk", async () => {
    const root = await makeTmpRoot();
    await initRepo(root);
    await fs.writeFile(path.join(root, "file.txt"), "line1\n");
    await git(root, ["add", "file.txt"]);
    await git(root, ["commit", "-m", "init"]);
    await fs.appendFile(path.join(root, "file.txt"), "line2\n");
    await fs.writeFile(path.join(root, "new.txt"), "hello\n");
    await fs.writeFile(path.join(root, ".DS_Store"), "junk");

    const { repos, repoCount, error } = await listRepoSummaries(root);
    expect(error).toBeNull();
    expect(repoCount).toBe(1);
    const repo = repos[0];
    expect(repo.relPath).toBe(".");
    expect(repo.branch).not.toBe("");

    const modified = repo.files.find((f) => f.path === "file.txt");
    expect(modified).toMatchObject({ status: "modified", additions: 1, deletions: 0 });

    const untracked = repo.files.find((f) => f.path === "new.txt");
    expect(untracked).toMatchObject({ status: "untracked", untracked: true });

    expect(repo.files.some((f) => f.path === ".DS_Store")).toBe(false);
    expect(repo.additions).toBe(1);
    expect(repo.deletions).toBe(0);
  });

  it("discovers a nested repo and hides its untracked-dir entry from the parent", async () => {
    const root = await makeTmpRoot();
    await initRepo(root);
    await fs.writeFile(path.join(root, "root.txt"), "root\n");
    await git(root, ["add", "root.txt"]);
    await git(root, ["commit", "-m", "init root"]);

    const nested = path.join(root, "nested");
    await initRepo(nested);
    await fs.writeFile(path.join(nested, "inner.txt"), "inner\n");

    const { repos, repoCount, error } = await listRepoSummaries(root);
    expect(error).toBeNull();
    expect(repoCount).toBe(2);
    expect(repos[0].relPath).toBe(".");
    expect(repos[1].relPath).toBe("nested");

    // The parent would otherwise list the nested repo as an untracked dir.
    expect(repos[0].files.some((f) => f.path === "nested/")).toBe(false);
    expect(repos[1].files.some((f) => f.path === "inner.txt")).toBe(true);
  });

  it("summarizes a repo with no commits yet without crashing", async () => {
    const root = await makeTmpRoot();
    await initRepo(root);
    await fs.writeFile(path.join(root, "staged.txt"), "one\ntwo\n");
    await git(root, ["add", "staged.txt"]);
    await fs.writeFile(path.join(root, "loose.txt"), "loose\n");

    const { repos, error } = await listRepoSummaries(root);
    expect(error).toBeNull();
    expect(repos).toHaveLength(1);

    const staged = repos[0].files.find((f) => f.path === "staged.txt");
    expect(staged).toMatchObject({ status: "added", staged: true });
    expect(repos[0].files.some((f) => f.path === "loose.txt")).toBe(true);
  });
});

describe("getFileDiffText", () => {
  it("returns a unified diff for a modified tracked file", async () => {
    const root = await makeTmpRoot();
    await initRepo(root);
    await fs.writeFile(path.join(root, "file.txt"), "line1\n");
    await git(root, ["add", "file.txt"]);
    await git(root, ["commit", "-m", "init"]);
    await fs.appendFile(path.join(root, "file.txt"), "line2\n");

    const result = await getFileDiffText(root, "file.txt", false);
    expect(result.binary).toBe(false);
    expect(result.truncated).toBe(false);
    expect(result.diff).toContain("@@");
    expect(result.diff).toContain("+line2");
  });

  it("returns a /dev/null diff for an untracked text file", async () => {
    const root = await makeTmpRoot();
    await initRepo(root);
    await fs.writeFile(path.join(root, "fresh.txt"), "brand new\n");

    const result = await getFileDiffText(root, "fresh.txt", true);
    expect(result.binary).toBe(false);
    expect(result.diff).toContain("--- /dev/null");
    expect(result.diff).toContain("+brand new");
  });

  it("flags an untracked binary file", async () => {
    const root = await makeTmpRoot();
    await initRepo(root);
    // A NUL byte in the first 8KB marks the file as binary.
    await fs.writeFile(path.join(root, "blob.bin"), Buffer.from([0x41, 0x00, 0x42, 0xff]));

    const result = await getFileDiffText(root, "blob.bin", true);
    expect(result.binary).toBe(true);
    expect(result.diff).toBe("");
  });
});
