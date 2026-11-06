import { describe, expect, it } from "vitest";
import {
  chainCandidateKeys,
  computeGates,
  gateTrackerKeys,
  nextUp,
  parseRoute,
  type ChainInfo,
  type ComputeGatesInput,
} from "../shared/gates";
import type { BoardCard } from "../shared/settings";

function card(overrides: Partial<BoardCard>): BoardCard {
  return {
    id: overrides.id ?? "card-1",
    source: "jira",
    title: "Task",
    body: "",
    day: "2026-11-06",
    createdAt: "2026-11-06T08:00:00.000Z",
    archivedAt: null,
    runs: [],
    ...overrides,
  };
}

function input(overrides: Partial<ComputeGatesInput>): ComputeGatesInput {
  return {
    cards: [],
    manualGates: {},
    clearedDoneNags: {},
    freshStatuses: {},
    chains: [],
    reviewRequested: [],
    changesRequested: [],
    ...overrides,
  };
}

function chain(issues: Partial<ChainInfo["issues"][number]>[]): ChainInfo {
  return {
    projectId: "proj-1",
    projectName: "Rolodex",
    issues: issues.map((issue, index) => ({
      key: issue.key ?? `ENG-${index + 1}`,
      title: issue.title ?? `Issue ${index + 1}`,
      url: issue.url ?? "https://linear.app/x",
      status: issue.status ?? "Todo",
      done: issue.done ?? false,
      route: issue.route ?? null,
      blockedBy: issue.blockedBy ?? [],
    })),
  };
}

describe("parseRoute", () => {
  it("reads the doctrine line case-insensitively", () => {
    expect(parseRoute("Route: rote")).toBe("rote");
    expect(parseRoute("Some intro\nRoute: Creative\nmore")).toBe("creative");
    expect(parseRoute("route:creative")).toBe("creative");
  });

  it("returns null without a route line", () => {
    expect(parseRoute("")).toBeNull();
    expect(parseRoute(null)).toBeNull();
    expect(parseRoute("Routing: rote")).toBeNull();
    expect(parseRoute("Route: rote-ish")).toBeNull();
  });
});

describe("nextUp", () => {
  it("picks the first unblocked open issue", () => {
    const c = chain([
      { key: "ENG-1", done: true },
      { key: "ENG-2", blockedBy: ["ENG-1"], route: "rote" },
      { key: "ENG-3", blockedBy: ["ENG-2"] },
    ]);
    expect(nextUp(c)?.key).toBe("ENG-2");
  });

  it("returns null when every open issue is blocked (a blocking cycle)", () => {
    const c = chain([
      { key: "ENG-1", blockedBy: ["ENG-2"] },
      { key: "ENG-2", blockedBy: ["ENG-1"] },
    ]);
    expect(nextUp(c)).toBeNull();
  });

  it("returns null when the chain is finished", () => {
    expect(nextUp(chain([{ key: "ENG-1", done: true }]))).toBeNull();
  });

  it("treats blockers outside the project as satisfied", () => {
    const c = chain([{ key: "ENG-5", blockedBy: ["OTHER-99"] }]);
    expect(nextUp(c)?.key).toBe("ENG-5");
  });

  it("breaks ties by issue number, not array order", () => {
    const c = chain([{ key: "ENG-9" }, { key: "ENG-3" }]);
    expect(nextUp(c)?.key).toBe("ENG-3");
  });
});

describe("computeGates", () => {
  it("gates a creative next-up as Yours, a rote one as Resumable", () => {
    const creative = computeGates(input({ chains: [chain([{ key: "ENG-2", route: "creative" }])] }));
    expect(creative[0]).toMatchObject({ kind: "chain-yours", issueKey: "ENG-2", route: "creative" });
    const rote = computeGates(input({ chains: [chain([{ key: "ENG-2", route: "rote" }])] }));
    expect(rote[0]).toMatchObject({ kind: "chain-resumable", issueKey: "ENG-2" });
  });

  it("treats an unrouted next-up as creative (ties-go-creative)", () => {
    const gates = computeGates(input({ chains: [chain([{ key: "ENG-2", route: null }])] }));
    expect(gates[0]).toMatchObject({ kind: "chain-yours", route: "unrouted" });
  });

  it("nags once per key about archived cards whose issue is not Done", () => {
    const gates = computeGates(
      input({
        cards: [
          card({ id: "a", jiraKey: "OPS-1", issueTitle: "Checkout", archivedAt: "2026-11-06T09:00:00Z" }),
          card({ id: "b", jiraKey: "OPS-1", title: "second task", archivedAt: "2026-11-06T10:00:00Z" }),
        ],
        freshStatuses: { "jira:OPS-1": { status: "In Progress", done: false } },
      }),
    );
    const nags = gates.filter((gate) => gate.kind === "done-nag");
    expect(nags).toHaveLength(1);
    expect(nags[0]).toMatchObject({ key: "OPS-1", status: "In Progress" });
  });

  it("self-clears when the issue is Done, stays silent without fresh status", () => {
    const done = computeGates(
      input({
        cards: [card({ jiraKey: "OPS-1", archivedAt: "2026-11-06T09:00:00Z" })],
        freshStatuses: { "jira:OPS-1": { status: "Done", done: true } },
      }),
    );
    expect(done.filter((gate) => gate.kind === "done-nag")).toHaveLength(0);
    const noFresh = computeGates(
      input({ cards: [card({ jiraKey: "OPS-1", archivedAt: "2026-11-06T09:00:00Z" })] }),
    );
    expect(noFresh.filter((gate) => gate.kind === "done-nag")).toHaveLength(0);
  });

  it("honors the Done-nag opt-out", () => {
    const gates = computeGates(
      input({
        cards: [card({ jiraKey: "OPS-1", archivedAt: "2026-11-06T09:00:00Z" })],
        freshStatuses: { "jira:OPS-1": { status: "In Progress", done: false } },
        clearedDoneNags: { "OPS-1": "2026-11-06T11:00:00Z" },
      }),
    );
    expect(gates.filter((gate) => gate.kind === "done-nag")).toHaveLength(0);
  });

  it("ignores live cards and non-tracker cards for Done-nags", () => {
    const gates = computeGates(
      input({
        cards: [
          card({ jiraKey: "OPS-1" }), // live
          card({ source: "prompt", archivedAt: "2026-11-06T09:00:00Z" }),
          card({ source: "github", github: { repo: "a/b", number: 1 }, archivedAt: "2026-11-06T09:00:00Z" }),
        ],
        freshStatuses: { "jira:OPS-1": { status: "In Progress", done: false } },
      }),
    );
    expect(gates.filter((gate) => gate.kind === "done-nag")).toHaveLength(0);
  });

  it("suppresses a chain gate whose next-up already has a live card", () => {
    const gates = computeGates(
      input({
        chains: [chain([{ key: "ENG-2", route: "rote" }])],
        cards: [card({ source: "linear", jiraKey: "ENG-2" })],
      }),
    );
    expect(gates.filter((gate) => gate.kind.startsWith("chain-"))).toHaveLength(0);
  });

  it("passes manual and PR gates through, ordered by kind", () => {
    const gates = computeGates(
      input({
        manualGates: { "gate-1": { text: "run the probe", createdAt: "2026-11-06T08:00:00Z" } },
        reviewRequested: [{ repo: "a/b", number: 7, title: "fix", url: "https://x" }],
        changesRequested: [{ repo: "a/b", number: 3, title: "wip", url: "https://y" }],
        chains: [chain([{ key: "ENG-2", route: "creative" }])],
      }),
    );
    expect(gates.map((gate) => gate.kind)).toEqual(["chain-yours", "manual", "review-requested", "changes-requested"]);
  });
});

describe("gateTrackerKeys", () => {
  it("collects archived tracker keys per source", () => {
    const keys = gateTrackerKeys([
      card({ source: "jira", jiraKey: "OPS-1", archivedAt: "2026-11-06T09:00:00Z" }),
      card({ source: "linear", jiraKey: "ENG-2", archivedAt: "2026-11-06T09:00:00Z" }),
      card({ source: "jira", jiraKey: "OPS-2" }), // live — no nag
    ]);
    expect(keys.jira).toEqual(["OPS-1"]);
    expect(keys.linear).toEqual(["ENG-2"]);
  });
});

describe("chainCandidateKeys", () => {
  it("includes live Linear cards and this week's archives", () => {
    const now = Date.parse("2026-11-06T12:00:00Z");
    const keys = chainCandidateKeys(
      [
        card({ source: "linear", jiraKey: "ENG-1" }),
        card({ source: "linear", jiraKey: "ENG-2", archivedAt: "2026-11-05T09:00:00Z" }),
        card({ source: "linear", jiraKey: "ENG-3", archivedAt: "2026-10-20T09:00:00Z" }),
        card({ source: "jira", jiraKey: "OPS-1" }),
      ],
      now,
    );
    expect(keys.sort()).toEqual(["ENG-1", "ENG-2"]);
  });
});
