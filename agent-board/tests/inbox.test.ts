import { describe, expect, it } from "vitest";
import { inboxCards, moveInboxToToday } from "../shared/inbox";
import type { BoardCard } from "../shared/settings";

function card(id: string, partial: Partial<BoardCard> = {}): BoardCard {
  return {
    id,
    source: "jira",
    title: id,
    body: "",
    day: null,
    createdAt: "2026-11-20T09:00:00.000Z",
    archivedAt: null,
    runs: [],
    ...partial,
  };
}

describe("inboxCards", () => {
  it("returns unarchived undated cards only", () => {
    const cards = [
      card("parked"),
      card("placed", { day: "2026-11-20" }),
      card("archived-inbox", { archivedAt: "2026-11-20T10:00:00.000Z" }),
    ];
    expect(inboxCards(cards).map((c) => c.id)).toEqual(["parked"]);
  });
});

describe("moveInboxToToday", () => {
  it("re-dates the selection onto today and joins tracker groups at their end", () => {
    const cards = [
      card("task-a", { jiraKey: "OPS-1", issueTitle: "Retry", title: "first" }),
      card("parked-task", { jiraKey: "OPS-1", issueTitle: "Retry", title: "parked" }),
      card("other", { day: "2026-11-20" }),
    ];
    const next = moveInboxToToday(cards, new Set(["parked-task"]), "2026-11-20");
    const moved = next.find((c) => c.id === "parked-task");
    expect(moved?.day).toBe("2026-11-20");
    // The group's end, after its live sibling — not the array's end.
    expect(next.map((c) => c.id)).toEqual(["task-a", "parked-task", "other"]);
  });

  it("appends prompt cards and leaves the unselected in the inbox", () => {
    const cards = [card("keep"), card("prompt", { source: "prompt" }), card("today", { day: "2026-11-20" })];
    const next = moveInboxToToday(cards, new Set(["prompt"]), "2026-11-20");
    expect(next.find((c) => c.id === "keep")?.day).toBeNull();
    expect(next.find((c) => c.id === "prompt")?.day).toBe("2026-11-20");
    expect(next.map((c) => c.id)).toEqual(["keep", "today", "prompt"]);
  });

  it("ignores ids that no longer name live inbox cards", () => {
    const cards = [card("dated", { day: "2026-11-19" }), card("gone"), card("today", { day: "2026-11-20" })];
    const next = moveInboxToToday(cards, new Set(["dated", "missing"]), "2026-11-20");
    // No inbox card was selected: the list is returned unchanged in content.
    expect(next.map((c) => c.id)).toEqual(["dated", "gone", "today"]);
    expect(next.every((c, i) => c === cards[i])).toBe(true);
  });
});
