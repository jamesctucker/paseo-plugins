import { cardKey } from "./groups";
import type { BoardCard } from "./settings";

/**
 * The identity a note attaches to. A tracker card's note belongs to the issue
 * or PR (`cardKey`), so archiving today's card and re-adding the issue next
 * week brings the memo back — and sibling task cards under one issue share
 * the issue's single note. A prompt card has no durable identity, so its note
 * keys on the card id and dies with the card.
 */
export function noteKey(card: BoardCard): string {
  return cardKey(card) ?? card.id;
}
