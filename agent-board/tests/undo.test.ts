import { describe, expect, it } from "vitest";
import {
  applyArchiveUndo,
  isUndoLive,
  recordArchive,
  UNDO_WINDOW_MS,
  undoLabel,
  undoStillValid,
} from "../shared/undo";
import type { BoardCard } from "../shared/settings";

function card(id: string, partial: Partial<BoardCard> = {}): BoardCard {
  return {
    id,
    source: "prompt",
    title: id,
    body: "",
    day: "2026-11-10",
    createdAt: "2026-11-10T09:00:00.000Z",
    archivedAt: null,
    runs: [],
    ...partial,
  };
}

const STAMP = "2026-11-10T12:00:00.000Z";
const NOW = Date.parse(STAMP);

describe("recordArchive", () => {
  it("archives only the targeted live cards and captures their pre-archive indexes", () => {
    const cards = [card("a"), card("b"), card("c")];
    const { next, undo } = recordArchive(cards, new Set(["a", "c"]), STAMP, NOW);
    expect(next.map((c) => c.archivedAt)).toEqual([STAMP, null, STAMP]);
    expect(undo?.cards.map((c) => c.id)).toEqual(["a", "c"]);
    expect(undo?.indexes).toEqual([0, 2]);
    expect(undo?.expiresAt).toBe(NOW + UNDO_WINDOW_MS);
  });

  it("leaves an already-archived card's stamp alone and out of the snapshot", () => {
    const old = "2026-11-09T08:00:00.000Z";
    const cards = [card("a", { archivedAt: old }), card("b")];
    const { next, undo } = recordArchive(cards, new Set(["a", "b"]), STAMP, NOW);
    expect(next[0].archivedAt).toBe(old);
    expect(undo?.cards.map((c) => c.id)).toEqual(["b"]);
  });

  it("returns undo: null when nothing live matched", () => {
    const { undo } = recordArchive([card("a")], new Set(["zzz"]), STAMP, NOW);
    expect(undo).toBeNull();
  });
});

describe("applyArchiveUndo", () => {
  it("un-archives in place, preserving order and intervening edits", () => {
    const cards = [card("a"), card("b"), card("c")];
    const { next, undo } = recordArchive(cards, new Set(["a", "c"]), STAMP, NOW);
    const edited = next.map((c) => (c.id === "c" ? { ...c, title: "renamed" } : c));
    const restored = applyArchiveUndo(edited, undo!);
    expect(restored.map((c) => [c.id, c.archivedAt, c.title])).toEqual([
      ["a", null, "a"],
      ["b", null, "b"],
      ["c", null, "renamed"],
    ]);
  });

  it("re-inserts a card deleted mid-window at its original index", () => {
    const cards = [card("a"), card("b"), card("c")];
    const { next, undo } = recordArchive(cards, new Set(["a", "b"]), STAMP, NOW);
    const deleted = next.filter((c) => c.id !== "a");
    const restored = applyArchiveUndo(deleted, undo!);
    expect(restored.map((c) => c.id)).toEqual(["a", "b", "c"]);
    expect(restored.every((c) => c.archivedAt === null)).toBe(true);
  });

  it("clamps the insert index when the list shrank past it", () => {
    const cards = [card("a"), card("b"), card("c")];
    const { next, undo } = recordArchive(cards, new Set(["c"]), STAMP, NOW);
    const shrunk = next.filter((c) => c.id !== "c" && c.id !== "b");
    const restored = applyArchiveUndo(shrunk, undo!);
    expect(restored.map((c) => c.id)).toEqual(["a", "c"]);
  });
});

describe("undoStillValid", () => {
  it("holds while the snapshots stand, dies on restore, delete, or re-archive", () => {
    const { next, undo } = recordArchive([card("a"), card("b")], new Set(["a"]), STAMP, NOW);
    expect(undoStillValid(next, undo!)).toBe(true);
    // Manual restore.
    expect(undoStillValid(next.map((c) => ({ ...c, archivedAt: null })), undo!)).toBe(false);
    // Delete.
    expect(undoStillValid(next.filter((c) => c.id !== "a"), undo!)).toBe(false);
    // Re-archived at a different stamp (the old offer must not un-archive it).
    const later = "2026-11-10T12:00:05.000Z";
    expect(undoStillValid(next.map((c) => ({ ...c, archivedAt: c.archivedAt ? later : null })), undo!)).toBe(false);
  });
});

describe("isUndoLive / undoLabel", () => {
  it("expires at the window edge", () => {
    const { undo } = recordArchive([card("a")], new Set(["a"]), STAMP, NOW);
    expect(isUndoLive(undo!, NOW + UNDO_WINDOW_MS - 1)).toBe(true);
    expect(isUndoLive(undo!, NOW + UNDO_WINDOW_MS)).toBe(false);
  });

  it("names a single card, counts a group", () => {
    const single = recordArchive([card("a", { title: "fix retry" })], new Set(["a"]), STAMP, NOW).undo!;
    expect(undoLabel(single)).toBe("Archived “fix retry”");
    const group = recordArchive([card("a"), card("b")], new Set(["a", "b"]), STAMP, NOW).undo!;
    expect(undoLabel(group)).toBe("Archived 2 cards");
  });
});
