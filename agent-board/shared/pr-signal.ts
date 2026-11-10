import type { BoardCard } from "./settings";

/**
 * Host-supplied PR signal (Workboard borrow, 2026-11-10). The daemon polls
 * `gh` for the open PR of each workspace's checked-out branch and publishes
 * it on the workspace descriptor (githubRuntime.pullRequest), so a GitHub
 * card with a linked run can show CI and review posture without spending the
 * PAT. The GitHub fetch stays the fallback for cards with no host signal.
 *
 * The match must be exact: the workspace's branch PR is this card's PR only
 * when the number and repo line up, and a merged or closed PR says nothing
 * about the work still on the board.
 */

export interface PullRequestLike {
  number?: number | null;
  state?: string | null;
  isDraft?: boolean | null;
  checksStatus?: string | null;
  checks?: readonly { status: string }[] | null;
  reviewDecision?: string | null;
  repoOwner?: string | null;
  repoName?: string | null;
}

export interface PrSignal {
  checksStatus: "success" | "failure" | "pending" | null;
  failedChecks: number;
  reviewDecision: "approved" | "changes_requested" | "pending" | null;
}

const REVIEW_DECISIONS = new Set(["approved", "changes_requested", "pending"]);

export function prSignalForCard(card: BoardCard, pr: PullRequestLike | null | undefined): PrSignal | null {
  if (!card.github || !pr) return null;
  if (pr.number !== card.github.number) return null;
  const [owner, name] = card.github.repo.split("/");
  if (pr.repoOwner && pr.repoName && (pr.repoOwner !== owner || pr.repoName !== name)) return null;
  if (pr.state && pr.state !== "open") return null;

  const failedChecks = (pr.checks ?? []).filter((check) => check.status === "failure").length;
  const checksStatus =
    pr.checksStatus === "success" || pr.checksStatus === "failure" || pr.checksStatus === "pending"
      ? pr.checksStatus
      : failedChecks > 0
        ? "failure"
        : null;
  const reviewDecision =
    pr.reviewDecision && REVIEW_DECISIONS.has(pr.reviewDecision)
      ? (pr.reviewDecision as PrSignal["reviewDecision"])
      : null;
  if (checksStatus === null && reviewDecision === null) return null;
  return { checksStatus, failedChecks, reviewDecision };
}
