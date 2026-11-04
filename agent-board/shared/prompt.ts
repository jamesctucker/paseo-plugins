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

/** Full seed once the issue body has been fetched. */
export function fullSeed(card: BoardCard, issue: IssueDetail): string {
  return [`Work ${issue.identifier}: ${issue.title}`, "", issue.body, "", `Issue: ${issue.url}`].join(
    "\n",
  );
}