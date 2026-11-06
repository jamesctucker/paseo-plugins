import { describe, expect, it } from "vitest";
import { carryOver, doneThisWeek, doneTodayCount, dropStale, formatElapsed, formatRelative, localDay, staleCards } from "../shared/day";

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

describe("doneTodayCount", () => {
  it("counts cards archived on the local today, including carried-over ones", () => {
    const today = localDay(new Date(2026, 10, 6, 15));
    const cards = [
      { day: "2026-11-06", archivedAt: new Date(2026, 10, 6, 9).toISOString() },
      { day: "2026-11-04", archivedAt: new Date(2026, 10, 6, 10).toISOString() },
      { day: "2026-11-05", archivedAt: new Date(2026, 10, 5, 17).toISOString() },
      { day: "2026-11-06", archivedAt: null },
    ];
    expect(doneTodayCount(cards, today)).toBe(2);
  });
});

describe("formatElapsed", () => {
  it("renders minutes under an hour and h/m past it", () => {
    expect(formatElapsed(Date.parse("2026-11-04T09:00:00Z"), Date.parse("2026-11-04T09:04:00Z"))).toBe("4m");
    expect(formatElapsed(Date.parse("2026-11-04T07:00:00Z"), Date.parse("2026-11-04T09:05:00Z"))).toBe("2h 05m");
  });
  it("never goes negative", () => {
    expect(formatElapsed(Date.parse("2026-11-04T09:01:00Z"), Date.parse("2026-11-04T09:00:00Z"))).toBe("just now");
  });
});
describe("formatRelative", () => {
  const t = Date.parse("2026-11-06T12:00:00.000Z");
  it("scales from just now to a short date", () => {
    expect(formatRelative(t - 30_000, t)).toBe("just now");
    expect(formatRelative(t - 5 * 60_000, t)).toBe("5m ago");
    expect(formatRelative(t - 3 * 3_600_000, t)).toBe("3h ago");
    expect(formatRelative(t - 2 * 86_400_000, t)).toBe("2d ago");
    expect(formatRelative(t - 14 * 86_400_000, t)).not.toContain("ago");
  });
});
