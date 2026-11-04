import { describe, expect, it } from "vitest";
import { fullSeed, titleSeed } from "../shared/prompt";
import type { BoardCard } from "../shared/settings";

function card(partial: Partial<BoardCard> = {}): BoardCard {
  return {
    id: "c1",
    source: "prompt",
    title: "Fix the pump",
    body: "",
    day: "2026-11-04",
    createdAt: "2026-11-04T09:00:00.000Z",
    archivedAt: null,
    runs: [],
    ...partial,
  };
}

describe("titleSeed", () => {
  it("seeds Jira cards with the key", () => {
    expect(titleSeed(card({ source: "jira", jiraKey: "PROJ-142" }))).toBe("Work PROJ-142: Fix the pump");
  });

  it("seeds GitHub cards with the pull reference", () => {
    expect(titleSeed(card({ source: "github", github: { repo: "acme/web", number: 88 } }))).toBe(
      "Work on acme/web#88: Fix the pump",
    );
  });

  it("seeds prompt cards with title and body, and title alone without body", () => {
    expect(titleSeed(card({ body: "Only the diff." }))).toBe("Work on: Fix the pump\n\nOnly the diff.");
    expect(titleSeed(card())).toBe("Work on: Fix the pump");
  });
});

describe("fullSeed", () => {
  it("seeds the fetched issue context end to end", () => {
    expect(
      fullSeed(card({ source: "jira", jiraKey: "PROJ-142" }), {
        identifier: "PROJ-142",
        title: "Fix the pump",
        body: "The pump sticks on cold starts.",
        url: "https://acme.atlassian.net/browse/PROJ-142",
        status: "In Progress",
      }),
    ).toBe(
      [
        "Work PROJ-142: Fix the pump",
        "",
        "The pump sticks on cold starts.",
        "",
        "Issue: https://acme.atlassian.net/browse/PROJ-142",
      ].join("\n"),
    );
  });
});