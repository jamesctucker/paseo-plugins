import { describe, expect, it } from "vitest";
import { prSignalForCard } from "../shared/pr-signal";
import type { BoardCard } from "../shared/settings";

function prCard(partial: Partial<BoardCard> = {}): BoardCard {
  return {
    id: "card-1",
    source: "github",
    title: "Fix retry",
    body: "",
    day: "2026-11-10",
    createdAt: "2026-11-10T09:00:00.000Z",
    archivedAt: null,
    runs: [],
    github: { repo: "jamesctucker/grove", number: 42 },
    ...partial,
  };
}

describe("prSignalForCard", () => {
  it("returns null for non-GitHub cards and missing PR data", () => {
    expect(prSignalForCard({ ...prCard(), source: "jira", github: undefined }, { number: 42 })).toBeNull();
    expect(prSignalForCard(prCard(), null)).toBeNull();
    expect(prSignalForCard(prCard(), undefined)).toBeNull();
  });

  it("matches on PR number, and on repo when the host names one", () => {
    const pr = { number: 42, state: "open", checksStatus: "success" };
    expect(prSignalForCard(prCard(), pr)?.checksStatus).toBe("success");
    expect(prSignalForCard(prCard(), { ...pr, repoOwner: "jamesctucker", repoName: "grove" })?.checksStatus).toBe("success");
    expect(prSignalForCard(prCard(), { ...pr, repoOwner: "other", repoName: "grove" })).toBeNull();
  });

  it("rejects a different PR number or a closed/merged PR", () => {
    const pr = { number: 43, state: "open", checksStatus: "success" };
    expect(prSignalForCard(prCard(), pr)).toBeNull();
    expect(prSignalForCard(prCard(), { ...pr, number: 42, state: "merged" })).toBeNull();
    expect(prSignalForCard(prCard(), { ...pr, number: 42, state: "closed" })).toBeNull();
  });

  it("counts failed checks and derives failure from checks when the aggregate is missing", () => {
    const checks = [
      { status: "success" },
      { status: "failure" },
      { status: "failure" },
      { status: "pending" },
      { status: "skipped" },
    ];
    const signal = prSignalForCard(prCard(), { number: 42, state: "open", checks });
    expect(signal?.checksStatus).toBe("failure");
    expect(signal?.failedChecks).toBe(2);
  });

  it("keeps only recognized review decisions, and stays null when nothing is known", () => {
    expect(prSignalForCard(prCard(), { number: 42, state: "open", reviewDecision: "approved" })?.reviewDecision).toBe("approved");
    expect(prSignalForCard(prCard(), { number: 42, state: "open", reviewDecision: "changes_requested" })?.reviewDecision).toBe(
      "changes_requested",
    );
    expect(prSignalForCard(prCard(), { number: 42, state: "open", reviewDecision: "COMMENTED" })).toBeNull();
    expect(prSignalForCard(prCard(), { number: 42, state: "open", checksStatus: "none" })).toBeNull();
  });
});
