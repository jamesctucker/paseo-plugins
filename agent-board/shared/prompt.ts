import type { BoardCard } from "./settings";
import type { IssueDetail } from "./tracker";

/**
 * First-message seeds for the Run flow. The spawn sheet pre-fills its prompt
 * field with these so the human layer starts from something true and edits
 * from there; whatever the field holds at spawn time is what runs.
 */

/** Sync seed from card fields alone; the issue body enriches it async. */
export function titleSeed(card: BoardCard): string {
  if (card.jiraKey) return `Work ${card.jiraKey}: ${card.title}`;
  if (card.github) return `Work on ${card.github.repo}#${card.github.number}: ${card.title}`;
  return card.body ? `Work on: ${card.title}\n\n${card.body}` : `Work on: ${card.title}`;
}

/**
 * Full seed once the issue body has been fetched. The headline is the task
 * (card title); when the task is narrower than the issue, the issue's own
 * title rides as context so the agent knows both the focused task and the
 * whole (brief amendment 2026-11-05, decision 3).
 */
export function fullSeed(card: BoardCard, issue: IssueDetail): string {
  const lines = [`Work ${issue.identifier}: ${card.title}`];
  if (card.title.trim() !== issue.title.trim()) {
    lines.push("", `Issue: ${issue.identifier} — ${issue.title}`);
  }
  lines.push("", issue.body, "", `Link: ${issue.url}`);
  return lines.join("\n");
}