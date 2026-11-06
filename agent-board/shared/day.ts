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

/**
 * Cards archived on the local `today`, whatever day they were born on: a
 * carried-over card finished this morning is today's win. Feeds the header
 * tally and the cleared-day state, so wins stay visible as the list shrinks.
 */
export function doneTodayCount(cards: readonly DatedCard[], today: string): number {
  let count = 0;
  for (const card of cards) {
    if (card.archivedAt && localDay(new Date(card.archivedAt)) === today) count++;
  }
  return count;
}

export function formatElapsed(startedAtMs: number, nowMs: number): string {
  const delta = Math.max(0, nowMs - startedAtMs);
  const minutes = Math.floor(delta / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${String(minutes % 60).padStart(2, "0")}m`;
}

/**
 * Past-tense relative time for history rows ("when did that happen"):
 * minutes under an hour, hours under a day, days under a week, then a short
 * date. formatElapsed stays for live chips; absolute locale strings with
 * second precision are machine dumps, not UI copy.
 */
export function formatRelative(startedAtMs: number, nowMs: number): string {
  const delta = Math.max(0, nowMs - startedAtMs);
  const minutes = Math.floor(delta / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(startedAtMs).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * True when today's list is empty because the day's cards were all archived,
 * not because nothing was ever added. Drives the board's "Day's clear." state.
 * A dropped migration leaves no archived card dated today, so it still reads
 * as a first-run morning rather than a finished day.
 */
export function clearedToday<T extends DatedCard>(cards: readonly T[], today: string): boolean {
  let archivedToday = false;
  for (const card of cards) {
    if (card.day < today) continue;
    if (!card.archivedAt) return false;
    if (card.day === today) archivedToday = true;
  }
  return archivedToday;
}