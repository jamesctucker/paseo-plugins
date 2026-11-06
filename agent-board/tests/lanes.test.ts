import { describe, expect, it } from "vitest";
import { isDismissed, laneCounts, laneOf, linkedAgentIds, type LaneAgent } from "../shared/lanes";

function agent(overrides: Partial<LaneAgent> & { id: string }): LaneAgent {
  return {
    status: "idle",
    requiresAttention: false,
    attentionReason: null,
    updatedAt: "2026-11-05T10:00:00.000Z",
    ...overrides,
  };
}

const cardWithRun = (agentId: string) => ({ runs: [{ agentId, workspaceId: "w", startedAt: "2026-11-05T09:00:00.000Z" }] });

describe("laneOf", () => {
  it("puts a permission wait in needsYou even while running", () => {
    expect(laneOf(agent({ id: "a", status: "running", requiresAttention: true, attentionReason: "permission" }))).toBe(
      "needsYou",
    );
  });

  it("puts running and initializing agents in running", () => {
    expect(laneOf(agent({ id: "a", status: "running" }))).toBe("running");
    expect(laneOf(agent({ id: "a", status: "initializing" }))).toBe("running");
  });

  it("puts remaining attention flags in review", () => {
    expect(laneOf(agent({ id: "a", requiresAttention: true, attentionReason: "finished" }))).toBe("review");
    expect(laneOf(agent({ id: "a", requiresAttention: true, attentionReason: "error" }))).toBe("review");
  });

  it("ignores quiet agents", () => {
    expect(laneOf(agent({ id: "a", status: "idle" }))).toBeNull();
    expect(laneOf(agent({ id: "a", status: "closed" }))).toBeNull();
  });
});

describe("linkedAgentIds", () => {
  it("links only each card's latest run", () => {
    const cards = [
      { runs: [{ agentId: "old", workspaceId: "w", startedAt: "s" }, { agentId: "new", workspaceId: "w", startedAt: "s2" }] },
      { runs: [] },
    ];
    expect([...linkedAgentIds(cards)]).toEqual(["new"]);
  });
});

describe("laneCounts", () => {
  it("counts board-linked agents per lane and skips everything else", () => {
    const agents = new Map([
      ["a", agent({ id: "a", status: "running", requiresAttention: true, attentionReason: "permission" })],
      ["b", agent({ id: "b", status: "running" })],
      ["c", agent({ id: "c", requiresAttention: true, attentionReason: "finished" })],
      ["unlinked", agent({ id: "unlinked", status: "running" })],
    ]);
    const cards = [cardWithRun("a"), cardWithRun("b"), cardWithRun("c")];
    expect(laneCounts(cards, agents)).toEqual({ needsYou: 1, running: 1, review: 1 });
  });

  it("returns zeros when nothing is linked or live", () => {
    expect(laneCounts([], new Map())).toEqual({ needsYou: 0, running: 0, review: 0 });
  });
});

describe("isDismissed", () => {
  it("hides the attention state that was dismissed, no other", () => {
    const a = agent({ id: "a", updatedAt: "t1" });
    expect(isDismissed(a, { a: "t1" })).toBe(true);
    expect(isDismissed(a, { a: "t0" })).toBe(false);
    expect(isDismissed(agent({ id: "b" }), { a: "t1" })).toBe(false);
  });

  it("treats a missing stamp as not dismissed", () => {
    expect(isDismissed(agent({ id: "a" }), {})).toBe(false);
  });
});
