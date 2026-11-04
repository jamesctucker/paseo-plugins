import { describe, expect, it } from "vitest";
import { carryOver, doneThisWeek, dropStale, formatElapsed, localDay, staleCards } from "../shared/day";

describe("localDay", () => {
  it("formats a local date as YYYY-MM-DD", () => {
    expect(localDay(new Date(2026, 10, 4))).toBe("2026-11-04");
    expect(localDay(new Date(2026, 0, 9))).toBe("2026-01-09");
  });
});

describe("staleCards", () => {
  it("flags only unarchived cards from before today", () => {
    const cards = [
      { id: "a", day: "2026-11-03", archivedAt: null },
      { id: "b", day: "2026-11-04", archivedAt: null },
      { id: "c", day: "2026-11-03", archivedAt: "2026-11-03T10:00:00Z" },
    ];
    const stale = staleCards(cards, "2026-11-04");
    expect(stale.map((card) => card.id)).toEqual(["a"]);
  });
});

describe("carryOver", () => {
  it("re-dates stale unfinished cards to today and leaves the rest alone", () => {
    const cards = [
      { id: "a", day: "2026-11-03", archivedAt: null },
      { id: "b", day: "2026-11-04", archivedAt: null },
      { id: "c", day: "2026-11-02", archivedAt: "2026-11-03T10:00:00Z" },
    ];
    const next = carryOver(cards, "2026-11-04");
    expect(next[0].day).toBe("2026-11-04");
    expect(next[1].day).toBe("2026-11-04");
    expect(next[2].day).toBe("2026-11-02");
  });
});

describe("dropStale", () => {
  it("removes stale unfinished cards, keeps archived and current", () => {
    const cards = [
      { id: "a", day: "2026-11-03", archivedAt: null },
      { id: "b", day: "2026-11-04", archivedAt: null },
      { id: "c", day: "2026-11-01", archivedAt: "2026-11-03T10:00:00Z" },
    ];
    const next = dropStale(cards, "2026-11-04");
    expect(next.map((card) => card.id)).toEqual(["b", "c"]);
  });
});

describe("doneThisWeek", () => {
  const now = new Date("2026-11-04T09:00:00Z");
  it("keeps archived cards younger than the window", () => {
    const cards = [
      { id: "fresh", day: "2026-11-02", archivedAt: "2026-11-03T09:00:00Z" },
      { id: "old", day: "2026-10-01", archivedAt: "2026-10-20T09:00:00Z" },
      { id: "open", day: "2026-11-03", archivedAt: null },
    ];
    expect(doneThisWeek(cards, now).map((card) => card.id)).toEqual(["fresh"]);
  });
  it("ages boundary cards out at seven days", () => {
    const cards = [{ id: "edge", day: "2026-10-01", archivedAt: "2026-10-28T09:00:00Z" }];
    expect(doneThisWeek(cards, now)).toEqual([]);
  });
});

describe("formatElapsed", () => {
  it("renders minutes under an hour and h/m past it", () => {
    expect(formatElapsed(Date.parse("2026-11-04T09:00:00Z"), Date.parse("2026-11-04T09:04:00Z"))).toBe("4m");
    expect(formatElapsed(Date.parse("2026-11-04T07:00:00Z"), Date.parse("2026-11-04T09:05:00Z"))).toBe("2h 05m");
  });
  it("never goes negative", () => {
    expect(formatElapsed(Date.parse("2026-11-04T09:01:00Z"), Date.parse("2026-11-04T09:00:00Z"))).toBe("0m");
  });
});