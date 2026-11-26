import { describe, expect, it } from "vitest";
import {
  addDays,
  beforeThisWeek,
  columnCards,
  dayLabel,
  doneOn,
  formatWeekRange,
  isWeekend,
  liveInWeek,
  moveCardsToDay,
  nudgeCards,
  nudgedDay,
  siblingDay,
  weekDays,
  weekStart,
  weekWidths,
  rollover,
  weekendOccupied,
} from "../shared/week";
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

/** A local-time archive stamp, so the test reads the same in any time zone. */
const archivedAt = (day: string, hour = 10) => {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(year, month - 1, date, hour).toISOString();
};

describe("addDays", () => {
  it("crosses month and year boundaries", () => {
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-11-01", -1)).toBe("2026-10-31");
  });

  it("stays a calendar step on daylight-saving days", () => {
    // US DST starts 2026-03-08: that day is 23 hours long.
    expect(addDays("2026-03-07", 1)).toBe("2026-03-08");
    expect(addDays("2026-03-08", 1)).toBe("2026-03-09");
  });
});

describe("weekStart", () => {
  it("snaps every day of the week to its Monday", () => {
    expect(weekStart("2026-11-26")).toBe("2026-11-23");
    expect(weekStart("2026-11-23")).toBe("2026-11-23");
    expect(weekStart("2026-11-29")).toBe("2026-11-23");
    expect(weekStart("2026-11-30")).toBe("2026-11-30");
  });
});

describe("weekDays", () => {
  it("runs Monday through Sunday", () => {
    expect(weekDays("2026-11-30")).toEqual(["2026-11-30", "2026-12-01", "2026-12-02", "2026-12-03", "2026-12-04", "2026-12-05", "2026-12-06"]);
  });
});

describe("isWeekend", () => {
  it("flags Saturday and Sunday only", () => {
    expect(isWeekend("2026-11-28")).toBe(true);
    expect(isWeekend("2026-11-29")).toBe(true);
    expect(isWeekend("2026-11-27")).toBe(false);
    expect(isWeekend("2026-11-23")).toBe(false);
  });
});

describe("labels", () => {
  it("names a day and a week range", () => {
    expect(dayLabel("2026-11-26")).toBe("Thu Nov 26");
    expect(formatWeekRange("2026-11-23")).toBe("Nov 23 – 29");
    expect(formatWeekRange("2026-11-30")).toBe("Nov 30 – Dec 6");
  });
});

describe("columnCards", () => {
  it("returns a day's live cards in board order", () => {
    const cards = [card("b", { day: "2026-11-24" }), card("a", { day: "2026-11-24" }), card("other", { day: "2026-11-23" }), card("done", { day: "2026-11-24", archivedAt: archivedAt("2026-11-24") })];
    expect(columnCards(cards, "2026-11-24").map((c) => c.id)).toEqual(["b", "a"]);
  });

  it("treats null as the backlog", () => {
    const cards = [card("parked"), card("placed", { day: "2026-11-24" }), card("archived-inbox", { archivedAt: archivedAt("2026-11-24") })];
    expect(columnCards(cards, null).map((c) => c.id)).toEqual(["parked"]);
  });
});

describe("doneOn", () => {
  it("collects what was finished that day, wherever it was planned, oldest first", () => {
    const cards = [
      card("later", { day: "2026-11-20", archivedAt: archivedAt("2026-11-26", 15) }),
      card("earlier", { day: "2026-11-23", archivedAt: archivedAt("2026-11-26", 9) }),
      card("other-day", { day: "2026-11-26", archivedAt: archivedAt("2026-11-25", 9) }),
      card("open", { day: "2026-11-26" }),
    ];
    expect(doneOn(cards, "2026-11-26").map((c) => c.id)).toEqual(["earlier", "later"]);
  });
});

describe("beforeThisWeek", () => {
  it("offers only unfinished cards dated before this week's Monday", () => {
    const cards = [
      card("last-week", { day: "2026-11-22" }),
      card("last-week-done", { day: "2026-11-20", archivedAt: archivedAt("2026-11-20") }),
      card("monday", { day: "2026-11-23" }),
      card("backlog"),
    ];
    expect(beforeThisWeek(cards, "2026-11-26").map((c) => c.id)).toEqual(["last-week"]);
  });
});

describe("rollover", () => {
  const today = "2026-11-26"; // Thursday; this week's Monday is the 23rd

  it("carries everything from before this week onto Monday", () => {
    const cards = [card("last-week", { day: "2026-11-20" }), card("older", { day: "2026-11-10" }), card("monday", { day: "2026-11-23" }), card("backlog")];
    const next = rollover(cards, "monday", today);
    expect(next.map((c) => c.day)).toEqual(["2026-11-23", "2026-11-23", "2026-11-23", null]);
  });

  it("parks them in the backlog instead", () => {
    const cards = [card("last-week", { day: "2026-11-20" }), card("tuesday", { day: "2026-11-24" })];
    const next = rollover(cards, "backlog", today);
    // Parked cards land at the end of the backlog column.
    expect(next.map((c) => [c.id, c.day])).toEqual([["tuesday", "2026-11-24"], ["last-week", null]]);
  });

  it("leaves the board untouched when declined", () => {
    const cards = [card("last-week", { day: "2026-11-20" })];
    expect(rollover(cards, "leave", today)[0]).toBe(cards[0]);
  });
});

describe("liveInWeek", () => {
  it("counts live cards inside the week and nothing from the backlog or beyond", () => {
    const cards = [card("in", { day: "2026-11-29" }), card("before", { day: "2026-11-22" }), card("after", { day: "2026-11-30" }), card("backlog"), card("done", { day: "2026-11-24", archivedAt: archivedAt("2026-11-24") })];
    expect(liveInWeek(cards, "2026-11-23")).toBe(1);
  });
});

describe("moveCardsToDay", () => {
  it("joins a tracker group at its end in the destination column", () => {
    const cards = [
      card("task-a", { jiraKey: "OPS-1", issueTitle: "Retry", title: "first", day: "2026-11-24" }),
      card("parked-task", { jiraKey: "OPS-1", issueTitle: "Retry", title: "parked" }),
      card("other", { day: "2026-11-24" }),
    ];
    const next = moveCardsToDay(cards, new Set(["parked-task"]), "2026-11-24");
    expect(next.find((c) => c.id === "parked-task")?.day).toBe("2026-11-24");
    // After its live sibling, not at the column's end.
    expect(next.map((c) => c.id)).toEqual(["task-a", "parked-task", "other"]);
  });

  it("lands ungrouped cards at the end of the destination column", () => {
    const cards = [card("keep"), card("prompt", { source: "prompt" }), card("tuesday", { day: "2026-11-24" })];
    const next = moveCardsToDay(cards, new Set(["prompt"]), "2026-11-24");
    expect(next.find((c) => c.id === "keep")?.day).toBeNull();
    expect(next.map((c) => c.id)).toEqual(["keep", "tuesday", "prompt"]);
  });

  it("appends when the destination column is empty", () => {
    const cards = [card("monday", { day: "2026-11-23" }), card("prompt", { source: "prompt" })];
    const next = moveCardsToDay(cards, new Set(["prompt"]), "2026-11-27");
    expect(next.map((c) => c.id)).toEqual(["monday", "prompt"]);
  });

  it("moves a whole selection in board order and can send it back to the backlog", () => {
    const cards = [card("b", { day: "2026-11-24" }), card("keep", { day: "2026-11-24" }), card("a", { day: "2026-11-23" })];
    const next = moveCardsToDay(cards, new Set(["a", "b"]), "2026-11-25");
    expect(next.map((c) => c.id)).toEqual(["keep", "b", "a"]);
    expect(next.filter((c) => c.id !== "keep").every((c) => c.day === "2026-11-25")).toBe(true);
    const back = moveCardsToDay(next, new Set(["a", "b"]), null);
    expect(back.filter((c) => c.id !== "keep").every((c) => c.day === null)).toBe(true);
  });

  it("ignores ids that no longer name live cards", () => {
    const cards = [card("dated", { day: "2026-11-23" }), card("archived", { archivedAt: archivedAt("2026-11-23") }), card("today", { day: "2026-11-24" })];
    const next = moveCardsToDay(cards, new Set(["archived", "missing"]), "2026-11-24");
    expect(next.map((c) => c.id)).toEqual(["dated", "archived", "today"]);
    expect(next.every((c, i) => c === cards[i])).toBe(true);
  });
});

describe("nudges", () => {
  const today = "2026-11-26";

  it("slides a card one day, or seven for the following week", () => {
    const cards = [card("thu", { day: today }), card("untouched", { day: today })];
    expect(nudgeCards(cards, new Set(["thu"]), 1, today)[0].day).toBe("2026-11-27");
    expect(nudgeCards(cards, new Set(["thu"]), 7, today)[0].day).toBe("2026-12-03");
    expect(nudgeCards(cards, new Set(["thu"]), -1, today)[0].day).toBe("2026-11-25");
  });

  it("crosses the week boundary day by day", () => {
    expect(addDays("2026-11-29", 1)).toBe("2026-11-30");
    expect(nudgedDay("2026-11-29", 1, today)).toBe("2026-11-30");
  });

  it("nudges a backlog card from today, and never backwards", () => {
    expect(nudgedDay(null, 1, today)).toBe("2026-11-27");
    expect(nudgedDay(null, 7, today)).toBe("2026-12-03");
    expect(nudgedDay(null, -1, today)).toBeNull();
    const cards = [card("parked")];
    expect(nudgeCards(cards, new Set(["parked"]), -1, today)[0].day).toBeNull();
  });

  it("leaves archived and unknown ids alone", () => {
    const cards = [card("done", { day: today, archivedAt: archivedAt(today) }), card("live", { day: today })];
    const next = nudgeCards(cards, new Set(["done", "missing"]), 1, today);
    expect(next[0]).toBe(cards[0]);
    expect(next[1].day).toBe(today);
  });
});

describe("siblingDay", () => {
  const today = "2026-11-26";

  it("joins its issue where the issue is parked", () => {
    expect(siblingDay(card("s", { day: "2026-11-30" }), today)).toBe("2026-11-30");
    expect(siblingDay(card("s"), today)).toBeNull();
    expect(siblingDay(card("s", { day: today }), today)).toBe(today);
  });

  it("falls back to today once the issue's day has passed or it is archived", () => {
    expect(siblingDay(card("s", { day: "2026-11-24" }), today)).toBe(today);
    expect(siblingDay(card("s", { day: "2026-11-30", archivedAt: archivedAt("2026-11-25") }), today)).toBe(today);
  });
});

describe("weekWidths", () => {
  it("sizes five weekdays, the backlog, and two slim weekend columns to fit", () => {
    const widths = weekWidths(1051, [false, false]);
    expect(widths).toMatchObject({ backlog: 189, day: 160, slim: 30 });
    expect(widths.total).toBeLessThanOrEqual(1051);
  });

  it("gives an occupied weekend column a weekday's width", () => {
    const widths = weekWidths(1051, [true, false]);
    expect(widths.day).toBe(138);
    expect(widths.total).toBe(189 + 6 * 138 + 30);
  });

  it("refuses to squeeze weekdays below the readable minimum and lets the grid scroll", () => {
    const widths = weekWidths(891, [true, true]);
    expect(widths.day).toBe(112);
    expect(widths.total).toBeGreaterThan(891);
  });

  it("stops growing on very wide screens", () => {
    const widths = weekWidths(2400, [false, false]);
    expect(widths.day).toBe(260);
    expect(widths.backlog).toBe(232);
    expect(widths.total).toBeLessThan(2400);
  });

  it("keeps a usable shape before the board has been measured", () => {
    const widths = weekWidths(0, [false, false]);
    expect(widths.backlog).toBe(140);
    expect(widths.day).toBe(112);
  });
});

describe("weekendOccupied", () => {
  it("notices a card on Saturday or Sunday of the given week, live or archived", () => {
    expect(weekendOccupied([card("sat", { day: "2026-11-28" })], "2026-11-23")).toEqual([true, false]);
    expect(weekendOccupied([card("sun", { day: "2026-11-29", archivedAt: archivedAt("2026-11-29") })], "2026-11-23")).toEqual([false, true]);
    expect(weekendOccupied([card("sat", { day: "2026-12-05" })], "2026-11-23")).toEqual([false, false]);
  });

  it("counts a card finished there even when it was planned for another day", () => {
    const cards = [card("friday-plan", { day: "2026-11-27", archivedAt: archivedAt("2026-11-28") })];
    expect(weekendOccupied(cards, "2026-11-23")).toEqual([true, false]);
  });
});
