import { describe, expect, it } from "vitest";
import { buildGroups, insertAtGroupEnd, isDuplicate, placeCard, showHeader, siblingTaskCard, taskDisplayTitle } from "../shared/groups";
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

describe("placeCard", () => {
  const visible = (cards: BoardCard[]) => buildGroups(cards.filter((c) => !c.archivedAt)).flatMap((g) => g.cards);

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
});
