import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";

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

export async function listRequestedReviews() {
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

  const requestedUrls = new Set(requested.map((item) => item.url));
  const assignedUrls = new Set(assigned.map((item) => item.url));
  const byUrl = new Map<string, GhSearchItem>();
  for (const item of [...requested, ...assigned]) byUrl.set(item.url, item);

  const prs = [...byUrl.values()].map((item) => ({
    repo: item.repository.nameWithOwner,
    number: item.number,
    title: item.title,
    url: item.url,
    author: item.author?.login ?? "unknown",
    isDraft: item.isDraft ?? false,
    reviewRequested: requestedUrls.has(item.url),
    assigned: assignedUrls.has(item.url),
    updatedAt: item.updatedAt,
  }));
  // Review requests first, then most recently updated.
  prs.sort((a, b) =>
    a.reviewRequested !== b.reviewRequested
      ? Number(b.reviewRequested) - Number(a.reviewRequested)
      : Date.parse(b.updatedAt) - Date.parse(a.updatedAt),
  );
  return { prs, fetchedAt: new Date().toISOString() };
}
