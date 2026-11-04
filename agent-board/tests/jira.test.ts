import { describe, expect, it, vi } from "vitest";
import { createJiraAdapter, JiraApiError } from "../server/jira";

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
});

function paragraphText() {
  return { type: "paragraph", content: [{ type: "text", text: "Body text." }] };
}