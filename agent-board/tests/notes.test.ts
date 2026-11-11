import { describe, expect, it } from "vitest";
import { noteKey } from "../shared/notes";
import type { BoardCard } from "../shared/settings";

function card(id: string, partial: Partial<BoardCard> = {}): BoardCard {
  return {
    id,
    source: "prompt",
    title: id,
    body: "",
    day: "2026-11-11",
    createdAt: "2026-11-11T09:00:00.000Z",
    archivedAt: null,
    runs: [],
    ...partial,
  };
}

describe("noteKey", () => {
  it("keys tracker cards on their issue identity, so the note survives the card", () => {
    expect(noteKey(card("a", { source: "jira", jiraKey: "OPS-1" }))).toBe("OPS-1");
    expect(noteKey(card("b", { source: "linear", jiraKey: "ENG-5" }))).toBe("ENG-5");
    expect(noteKey(card("c", { source: "github", github: { repo: "o/r", number: 42 } }))).toBe("o/r#42");
  });

  it("shares one note across sibling task cards of an issue", () => {
    const whole = card("a", { source: "linear", jiraKey: "ENG-5", title: "Whole issue" });
    const task = card("b", { source: "linear", jiraKey: "ENG-5", title: "fix the retry logic", issueTitle: "Whole issue" });
    expect(noteKey(task)).toBe(noteKey(whole));
  });

  it("falls back to the card id for prompt cards, dying with the card", () => {
    expect(noteKey(card("card-abc"))).toBe("card-abc");
  });
});
