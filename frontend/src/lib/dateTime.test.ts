import { describe, expect, it } from "vitest";
import { formatCampusDateTime, fromTimestamp, resolveDateTime } from "./dateTime";

describe("UCM campus date and time", () => {
  it.each([
    ["2026-10-04", "22:00", "2026-10-05T03:00:00.000Z"],
    ["2026-01-04", "22:00", "2026-01-05T04:00:00.000Z"],
    ["2026-07-04", "00:00", "2026-07-04T05:00:00.000Z"],
    ["2026-07-04", "12:00", "2026-07-04T17:00:00.000Z"],
  ])("converts %s at %s from campus time to %s", (date, time, timestamp) => {
    expect(resolveDateTime({ date, time })).toEqual({ timestamp, error: null, choices: [] });
    expect(fromTimestamp(timestamp)).toMatchObject({ date, time });
  });
  it("displays the local date and 12-hour time when a UTC timestamp falls on the next day", () => {
    expect(formatCampusDateTime("2026-10-05T03:00:00Z")).toMatch(/October 4, 2026.*10:00 PM CDT/);
    expect(fromTimestamp("2026-10-05T03:00:00Z")).toMatchObject({ date: "2026-10-04", time: "22:00" });
  });
  it("keeps absent values null and rejects incomplete or invalid dates", () => {
    expect(resolveDateTime({ date: "", time: "" }).timestamp).toBeNull();
    for (const draft of [{ date: "2026-10-04", time: "" }, { date: "", time: "22:00" },
      { date: "2026-02-30", time: "22:00" }, { date: "2026-10-04", time: "24:00" }]) {
      expect(resolveDateTime(draft)).toMatchObject({ timestamp: null, error: expect.any(String) });
    }
  });
  it("requires clarification for skipped and repeated daylight saving times", () => {
    expect(resolveDateTime({ date: "2026-03-08", time: "02:30" })).toMatchObject({ timestamp: null, error: expect.stringContaining("skipped") });
    const repeated = { date: "2026-11-01", time: "01:30" };
    const result = resolveDateTime(repeated);
    expect(result.timestamp).toBeNull();
    expect(result.choices).toEqual([
      { timestamp: "2026-11-01T06:30:00.000Z", label: "First 1:30 AM CDT" },
      { timestamp: "2026-11-01T07:30:00.000Z", label: "Second 1:30 AM CST" },
    ]);
    expect(resolveDateTime({ ...repeated, selectedTimestamp: result.choices[1].timestamp }).timestamp).toBe("2026-11-01T07:30:00.000Z");
  });
  it("preserves unchanged timestamps, including seconds and the repeated autumn hour", () => {
    for (const timestamp of ["2026-10-05T03:00:42.123Z", "2026-11-01T01:30:00-06:00"]) {
      expect(resolveDateTime(fromTimestamp(timestamp)).timestamp).toBe(timestamp);
    }
  });
});
