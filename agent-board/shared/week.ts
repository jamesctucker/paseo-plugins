import { localDay } from "./day";
import { cardKey } from "./groups";
import type { BoardCard } from "./settings";

/**
 * The week model (amendment 2026-11-20): the board owns the week. A card's
 * `day` is its column — null is the backlog, a date is that day in any week.
 * Unfinished cards stay where they were planned (week-honest history, no
 * daily auto-carry), finished cards sit at the foot of the day they were
 * finished, and the only automatic move is the once-a-week rollover prompt.
 * Pure string dates (`YYYY-MM-DD`, local) so the logic stays testable
 * without a clock; callers pass `localDay(new Date())` in prod.
 */

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function dateOfDay(day: string): Date {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(year, month - 1, date);
}

/** Calendar arithmetic on local dates, so DST days stay one day long. */
export function addDays(day: string, delta: number): string {
  const date = dateOfDay(day);
  date.setDate(date.getDate() + delta);
  return localDay(date);
}

/** The Monday of the week `day` falls in. Doubles as a week's identity. */
export function weekStart(day: string): string {
  return addDays(day, -((dateOfDay(day).getDay() + 6) % 7));
}

/** Monday through Sunday of the week that starts on `start`. */
export function weekDays(start: string): string[] {
  return WEEKDAYS.map((_, index) => addDays(start, index));
}

export function isWeekend(day: string): boolean {
  const weekday = dateOfDay(day).getDay();
  return weekday === 0 || weekday === 6;
}

/** "Thu Nov 26" — the day label used by move confirmations and drop targets. */
export function dayLabel(day: string): string {
  const date = dateOfDay(day);
  return `${WEEKDAYS[(date.getDay() + 6) % 7]} ${MONTHS[date.getMonth()]} ${date.getDate()}`;
}

/** "Nov 23 – 29", or "Nov 30 – Dec 6" when the week crosses a month. */
export function formatWeekRange(start: string): string {
  const first = dateOfDay(start);
  const last = dateOfDay(addDays(start, 6));
  const through = first.getMonth() === last.getMonth() ? `${last.getDate()}` : `${MONTHS[last.getMonth()]} ${last.getDate()}`;
  return `${MONTHS[first.getMonth()]} ${first.getDate()} – ${through}`;
}

/** Live (unarchived) cards of one column in board order. Null is the backlog. */
export function columnCards(cards: readonly BoardCard[], day: string | null): BoardCard[] {
  return cards.filter((card) => !card.archivedAt && card.day === day);
}

/**
 * Cards finished on the given local day, wherever they were planned, oldest
 * first: the column's struck-through foot. Keyed on the finish date rather
 * than the planned day so the foot always agrees with the day's done tally.
 */
export function doneOn(cards: readonly BoardCard[], day: string): BoardCard[] {
  return cards
    .filter((card) => card.archivedAt !== null && localDay(new Date(card.archivedAt)) === day)
    .sort((a, b) => (a.archivedAt ?? "").localeCompare(b.archivedAt ?? ""));
}

/** Unfinished cards planned before this week: what the rollover prompt offers. */
export function beforeThisWeek(cards: readonly BoardCard[], today: string): BoardCard[] {
  const start = weekStart(today);
  return cards.filter((card) => !card.archivedAt && card.day !== null && card.day < start);
}

/** Live cards planned inside the week that starts on `start`. */
export function liveInWeek(cards: readonly BoardCard[], start: string): number {
  const end = addDays(start, 6);
  let count = 0;
  for (const card of cards) {
    if (!card.archivedAt && card.day !== null && card.day >= start && card.day <= end) count++;
  }
  return count;
}

/**
 * Move live cards onto a day (null = the backlog). Each lands at the end of
 * its group when the destination already holds a sibling, otherwise at the
 * end of the destination column — never somewhere unrelated in the array.
 * Ids that no longer name live cards are ignored: a selection can outlive
 * the card list it was made from.
 */
export function moveCardsToDay(cards: readonly BoardCard[], ids: ReadonlySet<string>, day: string | null): BoardCard[] {
  const moving = cards.filter((card) => ids.has(card.id) && !card.archivedAt);
  if (moving.length === 0) return [...cards];
  const movingIds = new Set(moving.map((card) => card.id));
  const next = cards.filter((card) => !movingIds.has(card.id));
  for (const card of moving) {
    const key = cardKey(card);
    let columnEnd = -1;
    let siblingEnd = -1;
    for (let i = 0; i < next.length; i++) {
      if (next[i].day !== day) continue;
      columnEnd = i;
      if (key !== null && cardKey(next[i]) === key) siblingEnd = i;
    }
    next.splice(siblingEnd >= 0 ? siblingEnd + 1 : columnEnd < 0 ? next.length : columnEnd + 1, 0, { ...card, day });
  }
  return next;
}

/**
 * The weekly rollover's answer: everything unfinished from before this week
 * moves onto this Monday or back into the backlog, or stays where it is.
 */
export function rollover(cards: readonly BoardCard[], choice: "monday" | "backlog" | "leave", today: string): BoardCard[] {
  if (choice === "leave") return [...cards];
  const ids = new Set(beforeThisWeek(cards, today).map((card) => card.id));
  return moveCardsToDay(cards, ids, choice === "monday" ? weekStart(today) : null);
}

/**
 * Where a nudge lands. The backlog has no weekday of its own, so an undated
 * card nudges from today — and never backwards, since "yesterday" is not a
 * place you plan something.
 */
export function nudgedDay(day: string | null, deltaDays: number, today: string): string | null {
  if (day === null) return deltaDays < 0 ? null : addDays(today, deltaDays);
  return addDays(day, deltaDays);
}

/** Slide live cards a fixed number of days: +1 is the following day, +7 the following week. */
export function nudgeCards(
  cards: readonly BoardCard[],
  ids: ReadonlySet<string>,
  deltaDays: number,
  today: string,
): BoardCard[] {
  return cards.map((card) => {
    if (!ids.has(card.id) || card.archivedAt) return card;
    const day = nudgedDay(card.day, deltaDays, today);
    return day === null ? card : { ...card, day };
  });
}

/**
 * The day a new sibling task inherits. A task joins its issue where the
 * issue is parked (backlog, or a day still ahead); a day that has passed
 * would birth an instantly-stale card, so those become today's.
 */
export function siblingDay(source: BoardCard, today: string): string | null {
  if (!source.archivedAt && (source.day === null || source.day >= today)) return source.day;
  return today;
}

/**
 * Column widths for the week grid. Weekend columns stay slim until they
 * hold a card, then size up to a weekday; the result may exceed the
 * available width, which is the horizontal scroll's cue.
 */
export interface WeekWidths {
  backlog: number;
  day: number;
  slim: number;
  total: number;
}

const BACKLOG_WIDTH = { min: 140, max: 232, share: 0.18 };
const DAY_WIDTH = { min: 112, max: 260 };
export const SLIM_WEEKEND_WIDTH = 30;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function weekWidths(available: number, weekend: readonly [boolean, boolean]): WeekWidths {
  const backlog = clamp(Math.round(available * BACKLOG_WIDTH.share), BACKLOG_WIDTH.min, BACKLOG_WIDTH.max);
  const fullDays = 5 + weekend.filter(Boolean).length;
  const slimDays = 7 - fullDays;
  const day = clamp(Math.floor((available - backlog - slimDays * SLIM_WEEKEND_WIDTH) / fullDays), DAY_WIDTH.min, DAY_WIDTH.max);
  return { backlog, day, slim: SLIM_WEEKEND_WIDTH, total: backlog + fullDays * day + slimDays * SLIM_WEEKEND_WIDTH };
}

/**
 * Which weekend columns of the week starting on `start` hold anything: a
 * card planned there, or one finished there (which renders at its foot).
 */
export function weekendOccupied(cards: readonly BoardCard[], start: string): [boolean, boolean] {
  const holds = (day: string) =>
    cards.some((card) => card.day === day || (card.archivedAt !== null && localDay(new Date(card.archivedAt)) === day));
  return [holds(addDays(start, 5)), holds(addDays(start, 6))];
}
