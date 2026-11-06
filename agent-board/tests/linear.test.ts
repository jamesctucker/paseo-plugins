import { describe, expect, it, vi } from "vitest";
import { createLinearAdapter, LinearApiError } from "../server/linear";

function gqlResponse(data: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => ({ data }) } as unknown as Response;
}

function gqlError(message: string) {
  return { ok: true, status: 200, json: async () => ({ errors: [{ message }] }) } as unknown as Response;
}

const config = { apiKey: "lin_api_test" };

function issueNode(overrides: Record<string, unknown> = {}) {
  return {
    identifier: "ENG-5",
    title: "Ship the board",
    url: "https://linear.app/acme/issue/ENG-5",
    state: { name: "In Progress" },
    team: { key: "ENG" },
    ...overrides,
  };
}

describe("createLinearAdapter", () => {
  it("requires an API key up front", () => {
    expect(() => createLinearAdapter({ apiKey: "" })).toThrow(LinearApiError);
  });

  it("lists assigned issues minus completed and canceled", async () => {
    const request = vi.fn(async () =>
      gqlResponse({ viewer: { assignedIssues: { nodes: [issueNode()] } } }),
    );
    const adapter = createLinearAdapter(config, request as unknown as typeof fetch);
    const items = await adapter.listAssigned();
    const body = JSON.parse(String((request.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(body.query).toContain("assignedIssues");
    expect(body.query).toContain("nin: [\"completed\", \"canceled\"]");
    expect(items[0]).toMatchObject({
      identifier: "ENG-5",
      title: "Ship the board",
      status: "In Progress",
      resourceType: "linear-issue",
    });
  });

  it("resolves an exact key through issue(id:)", async () => {
    const request = vi.fn(async () => gqlResponse({ issue: issueNode({ description: "Details." }) }));
    const adapter = createLinearAdapter(config, request as unknown as typeof fetch);
    const detail = await adapter.get("eng-5");
    const body = JSON.parse(String((request.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(body.query).toContain('issue(id: "ENG-5")');
    expect(detail).toMatchObject({ identifier: "ENG-5", title: "Ship the board", body: "Details." });
  });

  it("searches free text through searchIssues", async () => {
    const request = vi.fn(async () => gqlResponse({ searchIssues: { nodes: [issueNode()] } }));
    const adapter = createLinearAdapter(config, request as unknown as typeof fetch);
    const items = await adapter.search("board");
    const body = JSON.parse(String((request.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(body.query).toContain("searchIssues");
    expect(items[0].identifier).toBe("ENG-5");
  });

  it("turns a 401 into a key-config error", async () => {
    const request = vi.fn(async () => ({ ok: false, status: 401, json: async () => ({}) }) as unknown as Response);
    const adapter = createLinearAdapter(config, request as unknown as typeof fetch);
    await expect(adapter.listAssigned()).rejects.toThrow(/rejected the API key/i);
  });

  it("turns auth-flavored GraphQL errors into a key-config error", async () => {
    const request = vi.fn(async () => gqlError("Authentication required, not authenticated"));
    const adapter = createLinearAdapter(config, request as unknown as typeof fetch);
    await expect(adapter.listAssigned()).rejects.toThrow(/rejected the API key/i);
  });

  it("surfaces other GraphQL errors with their message", async () => {
    const request = vi.fn(async () => gqlError("Rate limit exceeded"));
    const adapter = createLinearAdapter(config, request as unknown as typeof fetch);
    await expect(adapter.listAssigned()).rejects.toThrow("Linear error: Rate limit exceeded");
  });

  it("throws when get finds no issue", async () => {
    const request = vi.fn(async () => gqlResponse({ issue: null }));
    const adapter = createLinearAdapter(config, request as unknown as typeof fetch);
    await expect(adapter.get("ENG-99")).rejects.toThrow(/No Linear issue found/);
  });
});

describe("statuses", () => {
  it("maps state types to done flags", async () => {
    const request = vi.fn(async () =>
      gqlResponse({
        issues: {
          nodes: [
            { identifier: "ENG-1", state: { name: "Done", type: "completed" } },
            { identifier: "ENG-2", state: { name: "In Progress", type: "started" } },
            { identifier: "ENG-3", state: { name: "Canceled", type: "canceled" } },
          ],
        },
      }),
    );
    const adapter = createLinearAdapter(config, request as unknown as typeof fetch);
    const statuses = await adapter.statuses(["ENG-1", "ENG-2", "ENG-3"]);
    expect(statuses["ENG-1"].done).toBe(true);
    expect(statuses["ENG-2"]).toEqual({ status: "In Progress", done: false });
    expect(statuses["ENG-3"].done).toBe(true);
  });

  it("short-circuits on an empty key list", async () => {
    const request = vi.fn();
    const adapter = createLinearAdapter(config, request as unknown as typeof fetch);
    expect(await adapter.statuses([])).toEqual({});
    expect(request).not.toHaveBeenCalled();
  });
});

describe("chain", () => {
  it("reads the project and computes blocked-by from outgoing relations", async () => {
    const projectIssue = {
      identifier: "ENG-1",
      title: "Scaffold",
      url: "https://linear.app/x/ENG-1",
      description: "Route: rote",
      state: { name: "Done", type: "completed" },
      relations: { nodes: [{ type: "blocks", relatedIssue: { identifier: "ENG-2" } }] },
    };
    const blockedIssue = {
      identifier: "ENG-2",
      title: "Build",
      url: "https://linear.app/x/ENG-2",
      description: "Route: creative",
      state: { name: "Todo", type: "unstarted" },
      relations: { nodes: [] },
    };
    const request = vi
      .fn()
      .mockImplementationOnce(async () => gqlResponse({ issue: { project: { id: "p1", name: "Rolodex" } } }))
      .mockImplementationOnce(async () =>
        gqlResponse({ project: { issues: { nodes: [projectIssue, blockedIssue] } } }),
      );
    const adapter = createLinearAdapter(config, request as unknown as typeof fetch);
    const result = await adapter.chain("eng-2");
    expect(result.projectName).toBe("Rolodex");
    const eng2 = result.issues.find((issue) => issue.key === "ENG-2");
    expect(eng2).toMatchObject({ blockedBy: ["ENG-1"], route: "creative", done: false });
    const eng1 = result.issues.find((issue) => issue.key === "ENG-1");
    expect(eng1).toMatchObject({ blockedBy: [], done: true });
  });

  it("handles the blocked_by spelling too", async () => {
    const node = {
      identifier: "ENG-2",
      title: "Build",
      url: "https://linear.app/x/ENG-2",
      description: null,
      state: { name: "Todo", type: "unstarted" },
      relations: { nodes: [{ type: "blocked_by", relatedIssue: { identifier: "ENG-1" } }] },
    };
    const request = vi
      .fn()
      .mockImplementationOnce(async () => gqlResponse({ issue: { project: { id: "p1", name: "P" } } }))
      .mockImplementationOnce(async () => gqlResponse({ project: { issues: { nodes: [node] } } }));
    const adapter = createLinearAdapter(config, request as unknown as typeof fetch);
    const result = await adapter.chain("ENG-2");
    expect(result.issues[0].blockedBy).toEqual(["ENG-1"]);
  });

  it("throws when the issue is in no project", async () => {
    const request = vi.fn(async () => gqlResponse({ issue: { project: null } }));
    const adapter = createLinearAdapter(config, request as unknown as typeof fetch);
    await expect(adapter.chain("ENG-9")).rejects.toThrow(/not in a Linear project/);
  });
});

describe("route on summaries", () => {
  it("parses the Route line into the summary, omitting it when absent", async () => {
    const request = vi.fn(async () =>
      gqlResponse({ issue: { ...issueNode(), description: "Route: creative" } }),
    );
    const adapter = createLinearAdapter(config, request as unknown as typeof fetch);
    const items = await adapter.search("ENG-5");
    expect(items[0].route).toBe("creative");
  });

  it("omits route when the description has no Route line", async () => {
    const request = vi.fn(async () => gqlResponse({ issue: { ...issueNode(), description: "just a body" } }));
    const adapter = createLinearAdapter(config, request as unknown as typeof fetch);
    const items = await adapter.search("ENG-5");
    expect(items[0]).not.toHaveProperty("route");
  });
});
