/**
 * Local-day and elapsed-time helpers. Pure string dates so the logic stays
 * testable without a clock; callers pass `new Date()` in prod. Week
 * placement itself lives in shared/week.ts.
 */

export function localDay(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
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
