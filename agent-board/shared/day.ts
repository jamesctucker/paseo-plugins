/**
 * Local-day helpers and the morning carry-over ritual. Pure string dates so the
 * logic stays testable without a clock; callers pass `new Date()` in prod.
 */

export function localDay(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export const DONE_WINDOW_DAYS = 7;

export interface DatedCard {
  day: string;
  archivedAt: string | null;
}

/** Unarchived cards from before today: the set the migration prompt offers. */
export function staleCards<T extends DatedCard>(cards: readonly T[], today: string): T[] {
  return cards.filter((card) => !card.archivedAt && card.day < today);
}

/** Re-date carried cards onto today so they stay in the working set. */
export function carryOver<T extends DatedCard>(cards: readonly T[], today: string): T[] {
  return cards.map((card) => !card.archivedAt && card.day < today ? { ...card, day: today } : card);
}

/** Drop the stale unfinished cards instead of carrying them. */
export function dropStale<T extends DatedCard>(cards: readonly T[], today: string): T[] {
  return cards.filter((card) => card.archivedAt || card.day >= today);
}

/** Archived cards younger than the done window; older ones age to nothing. */
export function doneThisWeek<T extends DatedCard>(
  cards: readonly T[],
  now: Date,
  windowDays = DONE_WINDOW_DAYS,
): T[] {
  const cutoff = now.getTime() - windowDays * 86_400_000;
  return cards.filter((card) => {
    if (!card.archivedAt) return false;
    // A card archived exactly windowDays ago has aged out; "after 7 days".
    return Date.parse(card.archivedAt) > cutoff;
  });
}

export function formatElapsed(startedAtMs: number, nowMs: number): string {
  const delta = Math.max(0, nowMs - startedAtMs);
  const minutes = Math.floor(delta / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${String(minutes % 60).padStart(2, "0")}m`;
}