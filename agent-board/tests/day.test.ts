import { describe, expect, it } from "vitest";
import { formatElapsed, formatRelative, localDay } from "../shared/day";

describe("localDay", () => {
  it("formats a local date as YYYY-MM-DD", () => {
    expect(localDay(new Date(2026, 10, 4))).toBe("2026-11-04");
    expect(localDay(new Date(2026, 0, 9))).toBe("2026-01-09");
  });
});

describe("formatElapsed", () => {
  it("renders minutes under an hour and h/m past it", () => {
    expect(formatElapsed(Date.parse("2026-11-04T09:00:00Z"), Date.parse("2026-11-04T09:04:00Z"))).toBe("4m");
    expect(formatElapsed(Date.parse("2026-11-04T07:00:00Z"), Date.parse("2026-11-04T09:05:00Z"))).toBe("2h 05m");
  });
  it("never goes negative", () => {
    expect(formatElapsed(Date.parse("2026-11-04T09:01:00Z"), Date.parse("2026-11-04T09:00:00Z"))).toBe("just now");
  });
});

describe("formatRelative", () => {
  const t = Date.parse("2026-11-06T12:00:00.000Z");
  it("scales from just now to a short date", () => {
    expect(formatRelative(t - 30_000, t)).toBe("just now");
    expect(formatRelative(t - 5 * 60_000, t)).toBe("5m ago");
    expect(formatRelative(t - 3 * 3_600_000, t)).toBe("3h ago");
    expect(formatRelative(t - 2 * 86_400_000, t)).toBe("2d ago");
    expect(formatRelative(t - 14 * 86_400_000, t)).not.toContain("ago");
  });
});
