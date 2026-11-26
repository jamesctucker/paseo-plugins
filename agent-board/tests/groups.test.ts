import { describe, expect, it } from "vitest";
import { buildGroups, insertAtGroupEnd, isDuplicate, neighborIndex, placeCard, showHeader, siblingTaskCard, taskDisplayTitle } from "../shared/groups";
import type { BoardCard } from "../shared/settings";

function card(id: string, partial: Partial<BoardCard> = {}): BoardCard {
  return {
    id,
    source: "jira",
    title: id,
    body: "",
    day: "2026-11-05",
    createdAt: "2026-11-05T09:00:00.000Z",
    archivedAt: null,
    runs: [],
    ...partial,
  };
}

const projCard = (id: string, title: string, issueTitle = "Add retry logic") =>
  card(id, { title, jiraKey: "OPS-1", issueTitle, jiraStatus: "In Progress" });

describe("buildGroups", () => {
  it("pulls same-key cards together even when not adjacent", () => {
    const cards = [projCard("a", "Add retry logic"), card("p", { source: "prompt" }), projCard("b", "backfill")];
    const groups = buildGroups(cards);
    expect(groups).toHaveLength(2);
    expect(groups[0].key).toBe("OPS-1");
    expect(groups[0].cards.map((c) => c.id)).toEqual(["a", "b"]);
    expect(groups[1].key).toBeNull();
  });

  it("groups GitHub cards by pull reference", () => {
    const cards = [
      card("g1", { source: "github", github: { repo: "m/r", number: 7 }, issueTitle: "The PR", title: "review" }),
      card("g2", { source: "github", github: { repo: "m/r", number: 7 }, title: "merge" }),
    ];
    const groups = buildGroups(cards);
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe("m/r#7");
    expect(groups[0].issueTitle).toBe("The PR");
  });

  it("falls back to the key when no sibling carries an issueTitle", () => {
    const groups = buildGroups([card("x", { jiraKey: "ENG-9", title: "lone task" })]);
    expect(groups[0].issueTitle).toBe("ENG-9");
  });
});

describe("showHeader", () => {
  it("hides the header for a lone whole-issue task", () => {
    expect(showHeader(buildGroups([projCard("a", "Add retry logic")])[0])).toBe(false);
  });

  it("shows the header for multi-task groups and lone named tasks", () => {
    expect(showHeader(buildGroups([projCard("a", "Add retry logic"), projCard("b", "backfill")])[0])).toBe(true);
    expect(showHeader(buildGroups([projCard("b", "backfill")])[0])).toBe(true);
  });

  it("never shows a header for prompt cards", () => {
    expect(showHeader(buildGroups([card("p", { source: "prompt" })])[0])).toBe(false);
  });
});

describe("isDuplicate", () => {
  it("matches same key and title, case-insensitively, live cards only", () => {
    const cards = [projCard("a", "Backfill")];
    expect(isDuplicate(cards, "OPS-1", "backfill")).toBe(true);
    expect(isDuplicate(cards, "OPS-1", "other task")).toBe(false);
    expect(isDuplicate(cards, "ENG-9", "Backfill")).toBe(false);
    const archived = [projCard("a", "Backfill", "x")].map((c) => ({ ...c, archivedAt: "2026-11-05T10:00:00.000Z" }));
    expect(isDuplicate(archived, "OPS-1", "backfill")).toBe(false);
  });
});

describe("taskDisplayTitle", () => {
  it("strips a redundant key prefix, case-insensitively", () => {
    expect(taskDisplayTitle(projCard("a", "OPS-1: write the backfill"), "OPS-1")).toBe("write the backfill");
    expect(taskDisplayTitle(projCard("a", "ops-1: write the backfill"), "OPS-1")).toBe("write the backfill");
  });

  it("leaves other titles and prefix-only titles alone", () => {
    expect(taskDisplayTitle(projCard("a", "write the backfill"), "OPS-1")).toBe("write the backfill");
    expect(taskDisplayTitle(projCard("a", "OPS-1:"), "OPS-1")).toBe("OPS-1:");
  });
});

describe("siblingTaskCard", () => {
  it("copies the tracker identity without undefined-valued keys", () => {
    // The board doc is written across an RPC boundary validated as z.json();
    // an own property with an undefined value rejects the entire write
    // (hit live 2026-11-06 with github: undefined on a Jira sibling).
    const sibling = siblingTaskCard(projCard("a", "Add retry logic"), "backfill", "c2", "2026-11-05T10:00:00.000Z");
    expect(sibling).toMatchObject({
      id: "c2",
      title: "backfill",
      jiraKey: "OPS-1",
      issueTitle: "Add retry logic",
      jiraStatus: "In Progress",
    });
    expect(Object.prototype.hasOwnProperty.call(sibling, "github")).toBe(false);
    expect(Object.values(sibling).every((value) => value !== undefined)).toBe(true);
  });

  it("copies the github identity for pull-request cards", () => {
    const pr = card("g", {
      source: "github",
      github: { repo: "m/r", number: 7 },
      issueTitle: "The PR",
      title: "The PR",
    });
    const sibling = siblingTaskCard(pr, "merge it", "c3", "2026-11-05T10:00:00.000Z");
    expect(sibling.github).toEqual({ repo: "m/r", number: 7 });
    expect(Object.prototype.hasOwnProperty.call(sibling, "jiraKey")).toBe(false);
  });
});

describe("insertAtGroupEnd", () => {
  it("lands a new sibling after the last live one, not at the list end", () => {
    const cards = [projCard("a", "Add retry logic"), card("p", { source: "prompt" })];
    const next = insertAtGroupEnd(cards, projCard("b", "backfill"));
    expect(next.map((c) => c.id)).toEqual(["a", "b", "p"]);
  });

  it("appends when the group has no live members or the card is ungrouped", () => {
    const cards = [card("p", { source: "prompt" })];
    expect(insertAtGroupEnd(cards, projCard("a", "x")).map((c) => c.id)).toEqual(["p", "a"]);
    expect(insertAtGroupEnd(cards, card("q", { source: "prompt" })).map((c) => c.id)).toEqual(["p", "q"]);
  });
});

/** The rows a column shows: live cards, grouped, flattened back to one list. */
const visible = (cards: BoardCard[]) => buildGroups(cards.filter((c) => !c.archivedAt)).flatMap((g) => g.cards);

describe("placeCard", () => {
  it("reorders a task within its own group without moving siblings out", () => {
    const cards = [projCard("a", "one"), projCard("b", "two"), projCard("c", "three"), card("p", { source: "prompt" })];
    const rows = visible(cards);
    // Place "a" onto "c"'s row: within the group, it anchors before "c".
    const next = placeCard(cards, rows, "a", rows.findIndex((r) => r.id === "c"));
    expect(next.map((c) => c.id)).toEqual(["b", "a", "c", "p"]);
  });

  it("moves the whole group when placed onto another group", () => {
    const cards = [projCard("a", "one"), card("p", { source: "prompt" }), projCard("b", "two")];
    const rows = visible(cards); // grouped view: a, b, p
    // Place task "a" onto the prompt card's row: the whole OPS-1 group
    // jumps, landing where the target group starts (before the anchor).
    const next = placeCard(cards, rows, "a", rows.findIndex((r) => r.id === "p"));
    expect(next.map((c) => c.id)).toEqual(["a", "b", "p"]);
  });

  it("moves a picked-up card to the end when placed past the last row", () => {
    const cards = [projCard("a", "one"), card("p", { source: "prompt" })];
    const rows = visible(cards);
    const next = placeCard(cards, rows, "p", rows.length);
    expect(next.map((c) => c.id)).toEqual(["a", "p"]);
  });

  it("treats tapping the picked-up row as a no-op", () => {
    const cards = [projCard("a", "one"), card("p", { source: "prompt" })];
    const rows = visible(cards);
    const next = placeCard(cards, rows, "a", rows.findIndex((r) => r.id === "a"));
    expect(next.map((c) => c.id)).toEqual(["a", "p"]);
  });

  it("moves only the rows the list shows when a group also holds cards elsewhere", () => {
    // Tuesday's "two" is the same issue but not part of Monday's list.
    const cards = [projCard("a", "one"), card("z"), { ...projCard("b", "two"), day: "2026-11-06" }];
    const rows = visible(cards.filter((c) => c.day === "2026-11-05"));
    const next = placeCard(cards, rows, "a", rows.findIndex((r) => r.id === "z"));
    expect(next.map((c) => c.id)).toEqual(["a", "z", "b"]);
  });

  it("anchors on the target group's rows in this list, not where the group starts", () => {
    // The target's issue starts in the backlog; Monday holds a later task
    // of it. Anchoring globally would drop the unit before the backlog row,
    // leaving the visible column unchanged.
    const monday = "2026-11-09";
    const ops = (id: string, key: string, day: string | null) =>
      card(id, { title: id, jiraKey: key, issueTitle: `Issue ${key}`, jiraStatus: "In Progress", day });
    const cards = [ops("b", "OPS-1", null), ops("m", "OPS-2", monday), ops("c", "OPS-1", monday)];
    const rows = visible(cards.filter((card) => card.day === monday)); // m, c
    const next = placeCard(cards, rows, "m", rows.findIndex((r) => r.id === "c"));
    expect(next.map((card) => card.id)).toEqual(["b", "m", "c"]);
    expect(next[1].day).toBe(monday);
  });
});

describe("neighborIndex", () => {
  const rows = (cards: BoardCard[]) => visible(cards);

  it("steps a card up by anchoring on the row above", () => {
    const cards = [card("p"), card("q"), card("r")];
    expect(neighborIndex(rows(cards), "q", -1)).toBe(0);
  });

  it("steps down by skipping the next row, since placement anchors before its target", () => {
    const cards = [card("p"), card("q"), card("r")];
    expect(neighborIndex(rows(cards), "p", 1)).toBe(2);
    const next = placeCard(cards, rows(cards), "p", 2);
    expect(next.map((c) => c.id)).toEqual(["q", "p", "r"]);
  });

  it("reads the list's end as the last step down", () => {
    const cards = [card("p"), card("q")];
    expect(neighborIndex(rows(cards), "p", 1)).toBe(2);
    const next = placeCard(cards, rows(cards), "p", 2);
    expect(next.map((c) => c.id)).toEqual(["q", "p"]);
  });

  it("refuses to walk past either edge", () => {
    const cards = [card("p"), card("q")];
    expect(neighborIndex(rows(cards), "p", -1)).toBe(-1);
    expect(neighborIndex(rows(cards), "q", 1)).toBe(3);
    expect(neighborIndex(rows(cards), "missing", 1)).toBe(-1);
  });

  it("steps a whole group over the next card as a unit", () => {
    const cards = [projCard("a", "one"), projCard("b", "two"), card("p")];
    expect(neighborIndex(rows(cards), "a", 1)).toBe(3);
    expect(neighborIndex(rows(cards), "a", -1)).toBe(-1);
    expect(neighborIndex(rows(cards), "b", -1)).toBe(0);
  });

  it("reorders inside a group without dragging siblings", () => {
    const cards = [projCard("a", "one"), projCard("b", "two"), projCard("c", "three")];
    expect(neighborIndex(rows(cards), "b", -1)).toBe(0);
    const next = placeCard(cards, rows(cards), "b", 0);
    expect(next.map((c) => c.id)).toEqual(["b", "a", "c"]);
  });
});
