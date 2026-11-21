import { promises as fs } from "node:fs";
import path from "node:path";
import type { PluginHandlerContext } from "@getpaseo/plugin/server";

// RPC inputs are untrusted: anything that can invoke a plugin RPC could craft
// a payload pointing the diff viewer at files outside the workspace. Every
// path that reaches git or the filesystem must resolve inside a root the host
// itself knows about. realpath also follows symlinks, so a link planted inside
// a workspace cannot escape it.
export class PathOutsideWorkspaceError extends Error {
  constructor() {
    super("Path is outside every open workspace");
    this.name = "PathOutsideWorkspaceError";
  }
}

async function workspaceRoots(context: PluginHandlerContext): Promise<string[]> {
  try {
    const result = await context.paseo.workspaces.list({});
    return result.entries
      .map((entry) => entry.workspaceDirectory ?? entry.projectRootPath)
      .filter((root: string | undefined | null): root is string => Boolean(root));
  } catch {
    return [];
  }
}

/**
 * Resolve a raw RPC path against the host's workspace roots. Returns the
 * realpath when it sits inside (or equals) one of them, or null when the path
 * does not exist — callers already treat missing files as "no diff". Throws
 * PathOutsideWorkspaceError when the path exists but sits outside every
 * workspace, including via symlink.
 */
export async function containedPath(
  rawPath: string,
  context: PluginHandlerContext,
): Promise<string | null> {
  let real: string;
  try {
    real = await fs.realpath(rawPath);
  } catch {
    return null;
  }
  for (const root of await workspaceRoots(context)) {
    const realRoot = await fs.realpath(root).catch(() => null);
    if (realRoot && (real === realRoot || real.startsWith(realRoot + path.sep))) {
      return real;
    }
  }
  throw new PathOutsideWorkspaceError();
}
