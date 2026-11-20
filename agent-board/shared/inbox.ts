import type { BoardCard } from "./settings";
import { insertAtGroupEnd } from "./groups";

/**
 * The inbox (amendment 2026-11-20, probe slice). Quick-add lands here
 * undated; placing onto Today is the morning ritual. The week view replaces
 * this with the leftmost column, so this module stays deliberately small.
 */

/** Unarchived, undated cards: captured, not yet placed. */
export function inboxCards(cards: readonly BoardCard[]): BoardCard[] {
  return cards.filter((card) => card.day === null && !card.archivedAt);
}

/**
 * Place selected inbox cards onto today. Each lands by the same rule as any
 * new card: a tracker task joins its group's end, a prompt appends. Ids that
 * no longer name inbox cards are ignored — a selection can outlive the card
 * list it was made from.
 */
export function moveInboxToToday(cards: readonly BoardCard[], ids: ReadonlySet<string>, today: string): BoardCard[] {
  const movingIds = new Set<string>();
  for (const card of cards) {
    if (ids.has(card.id) && card.day === null && !card.archivedAt) movingIds.add(card.id);
  }
  if (movingIds.size === 0) return [...cards];
  let next = cards.filter((card) => !movingIds.has(card.id));
  for (const id of movingIds) {
    const card = cards.find((candidate) => candidate.id === id);
    if (card) next = insertAtGroupEnd(next, { ...card, day: today });
  }
  return next;
}
