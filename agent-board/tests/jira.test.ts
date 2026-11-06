import { describe, expect, it, vi } from "vitest";
import { createJiraAdapter, JiraApiError } from "../server/jira";
import { DEFAULT_ASSIGNED_JQL } from "../shared/settings";

function jsonResponse(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
}

const config = { domain: "acme", email: "me@example.com", token: "tok" };

describe("createJiraAdapter", () => {
  it("requires a token up front", () => {
    expect(() => createJiraAdapter({ ...config, token: "" })).toThrow(JiraApiError);
  });

  it("maps issues to summaries with browse URLs", async () => {
    const request = vi.fn(async () =>
      jsonResponse({
        issues: [
          {
            id: "1",
            key: "PROJ-142",
            fields: {
              summary: "Fix the pump",
              status: { name: "In Progress" },
              assignee: { displayName: "Alex" },
              description: { type: "doc", content: [paragraphText()] },
            },
          },
        ],
      }),
    );
    const adapter = createJiraAdapter(config, request as unknown as typeof fetch);
    const items = await adapter.listAssigned();
    expect(items[0]).toMatchObject({
      identifier: "PROJ-142",
      title: "Fix the pump",
      status: "In Progress",
      subtitle: "In Progress · Alex",
      url: "https://acme.atlassian.net/browse/PROJ-142",
    });
    expect(request).toHaveBeenCalledOnce();
  });

  it("turns 401 into a token-config error", async () => {
    const adapter = createJiraAdapter(config, vi.fn(async () => jsonResponse({}, 401)) as unknown as typeof fetch);
    await expect(adapter.listAssigned()).rejects.toThrow(/token/i);
  });

  it("uses the assigned JQL from config and posts search/jql", async () => {
    const request = vi.fn(async () => jsonResponse({ issues: [] }));
    const adapter = createJiraAdapter(
      { ...config, jql: "project = CC ORDER BY rank" },
      request as unknown as typeof fetch,
    );
    await adapter.listAssigned();
    const call = request.mock.calls[0] as unknown as [string, RequestInit];
    expect(call[0]).toContain("/rest/api/3/search/jql");
    expect(JSON.parse(String(call[1].body)).jql).toBe("project = CC ORDER BY rank");
  });

  it("keeps finished work out of the default list", async () => {
    const request = vi.fn(async () => jsonResponse({ issues: [] }));
    const adapter = createJiraAdapter(
      { ...config, defaultJql: DEFAULT_ASSIGNED_JQL },
      request as unknown as typeof fetch,
    );
    await adapter.listAssigned();
    const call = request.mock.calls[0] as unknown as [string, RequestInit];
    // Done issues keep their assignee and sort to the top by `updated`, so the
    // picker filled up with unpickable archive rows whenever resolution was unset.
    expect(JSON.parse(String(call[1].body)).jql).toContain("statusCategory != Done");
  });

  it("resolves exact keys via the issue endpoint through search", async () => {
    const request = vi.fn(async (url: string) => {
      if (String(url).includes("search/jql")) {
        return jsonResponse({
          issues: [
            {
              id: "9",
              key: "PROJ-142",
              fields: { summary: "Found", status: { name: "To Do" }, description: null },
            },
          ],
        });
      }
      return jsonResponse({
        id: "9",
        key: "PROJ-142",
        fields: {
          summary: "Found",
          status: { name: "To Do" },
          description: { type: "doc", content: [paragraphText()] },
        },
      });
    });
    const adapter = createJiraAdapter(config, request as unknown as typeof fetch);
    const detail = await adapter.get("PROJ-142");
    expect(detail).toMatchObject({ identifier: "PROJ-142", title: "Found", status: "To Do" });
    const items = await adapter.search("PROJ-142");
    expect(items[0].identifier).toBe("PROJ-142");
  });

  it("posts the exact-key JQL in the request body, not the query string", async () => {
    // Live-verified 2026-11-06: /search/jql with the JQL in the query string
    // and no body is a 400, and text ~ does not match keys — so a body-less
    // exact lookup silently loses the issue and quick-add falls through.
    const request = vi.fn(async () => jsonResponse({ issues: [] }));
    const adapter = createJiraAdapter(config, request as unknown as typeof fetch);
    await adapter.search("OPS-28506");
    const call = request.mock.calls[0] as unknown as [string, RequestInit];
    expect(call[0]).not.toContain("jql=");
    expect(JSON.parse(String(call[1].body)).jql).toBe('key = "OPS-28506"');
  });

  it("accepts a bare site name, a bare host, or a pasted URL as the domain", async () => {
    for (const domain of [
      "acme",
      "acme.atlassian.net",
      "https://acme.atlassian.net",
      "https://acme.atlassian.net/browse",
    ]) {
      const request = vi.fn(async () => jsonResponse({ issues: [] }));
      const adapter = createJiraAdapter({ ...config, domain }, request as unknown as typeof fetch);
      await adapter.listAssigned();
      const [url] = request.mock.calls[0] as unknown as [string, RequestInit];
      expect(String(url).startsWith("https://acme.atlassian.net/rest/api/3/")).toBe(true);
    }
  });

  it("reports unreachable hosts with the host and underlying cause", async () => {
    const failure = Object.assign(new Error("fetch failed"), {
      cause: new Error("getaddrinfo ENOTFOUND nope.atlassian.net"),
    });
    const request = vi.fn(async () => {
      throw failure;
    });
    const adapter = createJiraAdapter(config, request as unknown as typeof fetch);
    await expect(adapter.listAssigned()).rejects.toThrow(
      "Could not reach Jira at https://acme.atlassian.net: getaddrinfo ENOTFOUND nope.atlassian.net",
    );
  });

  it("surfaces a rejected token instead of a silent empty list", async () => {
    const request = vi.fn(async (url: unknown) =>
      String(url).includes("/myself") ? jsonResponse({ error: "auth" }, 401) : jsonResponse({ issues: [] }),
    );
    const adapter = createJiraAdapter(config, request as unknown as typeof fetch);
    await expect(adapter.listAssigned()).rejects.toThrow(/rejected the token/i);
  });

  it("keeps a genuine empty list empty when the token is valid", async () => {
    const request = vi.fn(async (url: unknown) =>
      String(url).includes("/myself") ? jsonResponse({ accountId: "u1" }) : jsonResponse({ issues: [] }),
    );
    const adapter = createJiraAdapter(config, request as unknown as typeof fetch);
    const items = await adapter.listAssigned();
    expect(items).toEqual([]);
  });
});

function paragraphText() {
  return { type: "paragraph", content: [{ type: "text", text: "Body text." }] };
}
describe("statuses", () => {
  it("maps status categories to done flags, JQL in the body", async () => {
    const request = vi.fn(async () =>
      jsonResponse({
        issues: [
          { id: "1", key: "OPS-1", fields: { status: { name: "Done", statusCategory: { key: "done" } } } },
          { id: "2", key: "OPS-2", fields: { status: { name: "Developer Review", statusCategory: { key: "indeterminate" } } } },
        ],
      }),
    );
    const adapter = createJiraAdapter(config, request as unknown as typeof fetch);
    const statuses = await adapter.statuses(["OPS-1", "OPS-2"]);
    const init = (request.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(JSON.parse(String(init.body)).jql).toBe('key in ("OPS-1", "OPS-2")');
    expect(statuses["OPS-1"].done).toBe(true);
    expect(statuses["OPS-2"]).toEqual({ status: "Developer Review", done: false });
  });

  it("short-circuits on an empty key list", async () => {
    const request = vi.fn();
    const adapter = createJiraAdapter(config, request as unknown as typeof fetch);
    expect(await adapter.statuses([])).toEqual({});
    expect(request).not.toHaveBeenCalled();
  });
});
