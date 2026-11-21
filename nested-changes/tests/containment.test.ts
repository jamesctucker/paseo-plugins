import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { containedPath, PathOutsideWorkspaceError } from "../server/containment";
import type { PluginHandlerContext } from "@getpaseo/plugin/server";

function contextFor(roots: string[]): PluginHandlerContext {
  return {
    paseo: {
      workspaces: {
        list: async () => ({
          entries: roots.map((directory) => ({ workspaceDirectory: directory })),
        }),
      },
    },
  } as unknown as PluginHandlerContext;
}

describe("containedPath", () => {
  let workspace: string;
  let outside: string;

  beforeAll(async () => {
    workspace = await fs.mkdtemp(path.join(os.tmpdir(), "nc-workspace-"));
    outside = await fs.mkdtemp(path.join(os.tmpdir(), "nc-outside-"));
    await fs.mkdir(path.join(workspace, "repo"));
    await fs.writeFile(path.join(workspace, "repo", "file.txt"), "hello");
    await fs.writeFile(path.join(outside, "secret.txt"), "private");
    // A symlink inside the workspace that points outside it.
    await fs.symlink(path.join(outside, "secret.txt"), path.join(workspace, "escape.txt"));
  });

  afterAll(async () => {
    await fs.rm(workspace, { recursive: true, force: true });
    await fs.rm(outside, { recursive: true, force: true });
  });

  it("accepts a path inside a workspace root", async () => {
    const resolved = await containedPath(path.join(workspace, "repo"), contextFor([workspace]));
    expect(resolved).toBe(await fs.realpath(path.join(workspace, "repo")));
  });

  it("accepts a path under any open workspace, not just the first", async () => {
    const other = await fs.mkdtemp(path.join(os.tmpdir(), "nc-other-"));
    await fs.mkdir(path.join(other, "nested"));
    try {
      const resolved = await containedPath(
        path.join(other, "nested"),
        contextFor([workspace, other]),
      );
      expect(resolved).toBe(await fs.realpath(path.join(other, "nested")));
    } finally {
      await fs.rm(other, { recursive: true, force: true });
    }
  });

  it("rejects a path outside every workspace", async () => {
    await expect(
      containedPath(path.join(outside, "secret.txt"), contextFor([workspace])),
    ).rejects.toBeInstanceOf(PathOutsideWorkspaceError);
  });

  it("rejects traversal that escapes the workspace", async () => {
    await expect(
      containedPath(path.join(workspace, "..", path.basename(outside), "secret.txt"), contextFor([workspace])),
    ).rejects.toBeInstanceOf(PathOutsideWorkspaceError);
  });

  it("rejects a symlink inside the workspace pointing outside", async () => {
    await expect(
      containedPath(path.join(workspace, "escape.txt"), contextFor([workspace])),
    ).rejects.toBeInstanceOf(PathOutsideWorkspaceError);
  });

  it("returns null for a path that does not exist", async () => {
    const resolved = await containedPath(
      path.join(workspace, "repo", "missing.txt"),
      contextFor([workspace]),
    );
    expect(resolved).toBeNull();
  });

  it("rejects everything when no workspaces are open", async () => {
    await expect(containedPath(workspace, contextFor([]))).rejects.toBeInstanceOf(
      PathOutsideWorkspaceError,
    );
  });
});
