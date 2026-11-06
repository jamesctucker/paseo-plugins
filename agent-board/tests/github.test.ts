import { describe, expect, it, vi } from "vitest";
import { createGitHubAdapter, GitHubApiError } from "../server/github";

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
  } as unknown as Response;
}

const config = { token: "ghp_test" };

function prItem(overrides: Record<string, unknown> = {}) {
  return {
    number: 42,
    title: "Fix the pump",
    html_url: "https://github.com/acme/api/pull/42",
    state: "open",
    draft: false,
    repository_url: "https://api.github.com/repos/acme/api",
    ...overrides,
  };
}

describe("createGitHubAdapter", () => {
  it("requires a token up front", () => {
    expect(() => createGitHubAdapter({ token: "" })).toThrow(GitHubApiError);
  });

  it("lists assigned and authored open PRs, deduped and updated-first", async () => {
    const request = vi.fn(async (url: unknown) => {
      const q = decodeURIComponent(String(url));
      if (q.includes("assignee:@me")) {
        return jsonResponse({ items: [prItem({ number: 42, updated_at: "2026-11-04T10:00:00Z" })] });
      }
      return jsonResponse({
        items: [
          prItem({ number: 42, updated_at: "2026-11-04T10:00:00Z" }),
          prItem({ number: 7, title: "Authored", updated_at: "2026-11-05T10:00:00Z" }),
        ],
      });
    });
    const adapter = createGitHubAdapter(config, request as unknown as typeof fetch);
    const items = await adapter.listAssigned();
    const urls = request.mock.calls.map((call) => decodeURIComponent(String(call[0])));
    expect(urls.some((url) => url.includes("assignee:@me"))).toBe(true);
    expect(urls.some((url) => url.includes("author:@me"))).toBe(true);
    expect(urls.some((url) => url.includes("review-requested:@me"))).toBe(true);
    expect(items.map((item) => item.identifier)).toEqual(["acme/api#7", "acme/api#42"]);
    expect(items[1]).toMatchObject({
      title: "Fix the pump",
      status: "Open",
      url: "https://github.com/acme/api/pull/42",
      resourceType: "github-pr",
    });
  });

  it("marks drafts as Draft", async () => {
    const request = vi.fn(async () => jsonResponse({ items: [prItem({ draft: true })] }));
    const adapter = createGitHubAdapter(config, request as unknown as typeof fetch);
    const items = await adapter.listAssigned();
    expect(items[0].status).toBe("Draft");
  });

  it("resolves an exact owner/repo#n ref through the pulls endpoint", async () => {
    const request = vi.fn(async () =>
      jsonResponse({ ...prItem(), body: "The body." }),
    );
    const adapter = createGitHubAdapter(config, request as unknown as typeof fetch);
    const detail = await adapter.get("acme/api#42");
    const [url] = request.mock.calls[0] as unknown as [string];
    expect(String(url)).toContain("/repos/acme/api/pulls/42");
    expect(detail).toMatchObject({
      identifier: "acme/api#42",
      title: "Fix the pump",
      body: "The body.",
      status: "Open",
    });
  });

  it("scopes free-text search to pull requests", async () => {
    const request = vi.fn(async () => jsonResponse({ items: [prItem()] }));
    const adapter = createGitHubAdapter(config, request as unknown as typeof fetch);
    const items = await adapter.search("pump");
    const [url] = request.mock.calls[0] as unknown as [string];
    expect(decodeURIComponent(String(url))).toContain("pump type:pr");
    expect(items[0].identifier).toBe("acme/api#42");
  });

  it("rejects a get for a non-PR key", async () => {
    const adapter = createGitHubAdapter(config, vi.fn() as unknown as typeof fetch);
    await expect(adapter.get("PROJ-142")).rejects.toThrow(/not a pull request/i);
  });

  it("turns 401 into a token-config error", async () => {
    const adapter = createGitHubAdapter(config, vi.fn(async () => jsonResponse({}, 401)) as unknown as typeof fetch);
    await expect(adapter.listAssigned()).rejects.toThrow(/rejected the token/i);
  });

  it("reports unreachable hosts with the underlying cause", async () => {
    const request = vi.fn(async () => {
      throw new Error("getaddrinfo ENOTFOUND api.github.com");
    });
    const adapter = createGitHubAdapter(config, request as unknown as typeof fetch);
    await expect(adapter.listAssigned()).rejects.toThrow(
      "Could not reach GitHub: getaddrinfo ENOTFOUND api.github.com",
    );
  });

  it("turns an empty list from a public_repo-scoped token into a scope error", async () => {
    const request = vi.fn(async (url: unknown) =>
      String(url).includes("/user")
        ? jsonResponse({ login: "me" }, 200, { "x-oauth-scopes": "public_repo, user:email" })
        : jsonResponse({ items: [] }),
    );
    const adapter = createGitHubAdapter(config, request as unknown as typeof fetch);
    await expect(adapter.listAssigned()).rejects.toThrow(/repo scope/i);
  });

  it("keeps a genuine empty list empty for full-repo and fine-grained tokens", async () => {
    const headerSets: Record<string, string>[] = [{ "x-oauth-scopes": "repo, user:email" }, {}];
    for (const headers of headerSets) {
      const request = vi.fn(async () => jsonResponse({ items: [] }, 200, headers));
      const adapter = createGitHubAdapter(config, request as unknown as typeof fetch);
      expect(await adapter.listAssigned()).toEqual([]);
    }
  });
});

describe("reviewGates", () => {
  it("lists review-requested PRs and authored PRs with changes requested", async () => {
    const request = vi.fn(async (url: string) => {
      if ((url.includes("review-requested") || url.includes("review-requested%3A%40me"))) {
        return jsonResponse({ items: [prItem({ number: 7, title: "Please review" })] });
      }
      if (url.includes("author%3A%40me")) {
        return jsonResponse({ items: [prItem({ number: 3, title: "My wip" })] });
      }
      if (url.includes("/pulls/3/reviews")) {
        return jsonResponse([
          { user: { login: "sam" }, state: "CHANGES_REQUESTED", submitted_at: "2026-11-05T10:00:00Z" },
          { user: { login: "sam" }, state: "COMMENTED", submitted_at: "2026-11-04T10:00:00Z" },
        ]);
      }
      throw new Error(`unexpected url: ${url}`);
    });
    const adapter = createGitHubAdapter(config, request as unknown as typeof fetch);
    const gates = await adapter.reviewGates();
    expect(gates.reviewRequested).toEqual([
      { repo: "acme/api", number: 7, title: "Please review", url: "https://github.com/acme/api/pull/42" },
    ]);
    expect(gates.changesRequested).toEqual([
      { repo: "acme/api", number: 3, title: "My wip", url: "https://github.com/acme/api/pull/42" },
    ]);
  });

  it("an approval after changes clears the changes-requested gate", async () => {
    const request = vi.fn(async (url: string) => {
      if ((url.includes("review-requested") || url.includes("review-requested%3A%40me"))) return jsonResponse({ items: [] });
      if (url.includes("author%3A%40me")) return jsonResponse({ items: [prItem({ number: 3 })] });
      if (url.includes("/pulls/3/reviews")) {
        return jsonResponse([
          { user: { login: "sam" }, state: "CHANGES_REQUESTED", submitted_at: "2026-11-04T10:00:00Z" },
          { user: { login: "sam" }, state: "APPROVED", submitted_at: "2026-11-05T10:00:00Z" },
        ]);
      }
      throw new Error(`unexpected url: ${url}`);
    });
    const adapter = createGitHubAdapter(config, request as unknown as typeof fetch);
    const gates = await adapter.reviewGates();
    expect(gates.changesRequested).toEqual([]);
  });

  it("includes review-requested PRs in the sheet listing", async () => {
    const request = vi.fn(async (url: string) => {
      if (url.includes("assignee")) return jsonResponse({ items: [prItem({ number: 1 })] });
      if (url.includes("author")) return jsonResponse({ items: [] });
      if ((url.includes("review-requested") || url.includes("review-requested%3A%40me"))) return jsonResponse({ items: [prItem({ number: 2, title: "Review me" })] });
      throw new Error(`unexpected url: ${url}`);
    });
    const adapter = createGitHubAdapter(config, request as unknown as typeof fetch);
    const items = await adapter.listAssigned();
    expect(items.map((item) => item.identifier)).toContain("acme/api#2");
  });
});
