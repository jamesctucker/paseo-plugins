import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { z } from "zod";
import type { PluginHandlerContext } from "@getpaseo/plugin/server";

const execFileAsync = promisify(execFile);

// gh emits a raw JSON array; validate the fields we rely on instead of trusting the CLI shape.
const ghSearchItem = z.object({
  repository: z.object({ nameWithOwner: z.string() }),
  number: z.number(),
  title: z.string(),
  url: z.string(),
  author: z.object({ login: z.string() }).nullable(),
  isDraft: z.boolean().optional(),
  updatedAt: z.string(),
});

type GhSearchItem = z.infer<typeof ghSearchItem>;

// Draft PRs cannot have review requests on GitHub, so a draft that needs the user's
// eyes only ever matches the assignee search; both searches run every refresh.
async function search(scopeFlag: string): Promise<GhSearchItem[]> {
  const { stdout } = await execFileAsync(
    "gh",
    [
      "search",
      "prs",
      scopeFlag,
      "--state=open",
      "--json",
      "repository,number,title,url,author,isDraft,updatedAt",
      "--limit",
      "50",
    ],
    {
      timeout: 20_000,
      maxBuffer: 8 * 1024 * 1024,
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    },
  );
  return z.array(ghSearchItem).parse(JSON.parse(stdout));
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

/** Pull "owner/name" out of a git remote URL, any of the common GitHub shapes. */
export function parseOriginRepo(remoteUrl: string): string | null {
  const match = /[:/]([^/:]+)\/([^/]+?)(?:\.git)?\s*$/.exec(remoteUrl.trim());
  return match ? `${match[1]}/${match[2]}` : null;
}

async function originRepo(checkoutPath: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("git", ["-C", checkoutPath, "remote", "get-url", "origin"], {
      timeout: 5_000,
    });
    return parseOriginRepo(stdout);
  } catch {
    return null;
  }
}

/**
 * Find a local checkout of the PR's repo among the host's open workspaces.
 * Candidates are the repo-named sibling under each workspace's work/ directory
 * (plus a workspace that itself is the checkout). The checkout's origin must
 * actually point at the PR's repo: two repos can share a name under different
 * owners, and reviewing a worktree built from the wrong one looks identical to
 * a successful review. GitHub compares owner/name case-insensitively.
 */
async function localCheckoutFor(repo: string, roots: string[]): Promise<string | null> {
  const name = repo.split("/")[1] ?? "";
  if (!name) return null;
  const seen = new Set<string>();
  for (const root of roots) {
    for (const candidate of [path.join(root, "work", name), root]) {
      if (candidate !== root && path.basename(candidate) !== name) continue;
      if (seen.has(candidate) || !existsSync(candidate)) continue;
      seen.add(candidate);
      const origin = await originRepo(candidate);
      if (origin && origin.toLowerCase() === repo.toLowerCase()) return candidate;
    }
  }
  return null;
}

export async function listRequestedReviews(context: PluginHandlerContext) {
  let requested: GhSearchItem[];
  let assigned: GhSearchItem[];
  try {
    [requested, assigned] = await Promise.all([
      search("--review-requested=@me"),
      search("--assignee=@me"),
    ]);
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    throw new Error(
      `gh search failed: ${reason}. Is gh installed and authenticated on this host (gh auth login)?`,
    );
  }

  const roots = await workspaceRoots(context);
  const requestedUrls = new Set(requested.map((item) => item.url));
  const assignedUrls = new Set(assigned.map((item) => item.url));
  const byUrl = new Map<string, GhSearchItem>();
  for (const item of [...requested, ...assigned]) byUrl.set(item.url, item);

  const prs = await Promise.all(
    [...byUrl.values()].map(async (item) => ({
      repo: item.repository.nameWithOwner,
      number: item.number,
      title: item.title,
      url: item.url,
      author: item.author?.login ?? "unknown",
      isDraft: item.isDraft ?? false,
      reviewRequested: requestedUrls.has(item.url),
      assigned: assignedUrls.has(item.url),
      localCheckoutPath: await localCheckoutFor(item.repository.nameWithOwner, roots),
      updatedAt: item.updatedAt,
    })),
  );
  // Review requests first, then most recently updated.
  prs.sort((a, b) =>
    a.reviewRequested !== b.reviewRequested
      ? Number(b.reviewRequested) - Number(a.reviewRequested)
      : Date.parse(b.updatedAt) - Date.parse(a.updatedAt),
  );
  return { prs, fetchedAt: new Date().toISOString() };
}
