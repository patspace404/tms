import { describe, expect, it } from "vitest";
import { relativeDate } from "@/lib/relative-date";

const now = new Date("2026-10-22T14:00:00");
const at = (iso: string) => relativeDate(new Date(iso), now);

describe("relativeDate", () => {
  it("names the recent days", () => {
    expect(at("2026-10-22T09:00:00")).toBe("Today");
    expect(at("2026-10-21T09:00:00")).toBe("Yesterday");
    expect(at("2026-10-19T09:00:00")).toBe("3 days ago");
  });

  it("counts calendar days, not elapsed hours", () => {
    // 11pm yesterday is 15 hours ago, which is under a day — but it is still
    // yesterday to the person reading it.
    expect(at("2026-10-21T23:00:00")).toBe("Yesterday");
    // And 1am today is today, however few hours have passed.
    expect(at("2026-10-22T01:00:00")).toBe("Today");
  });

  it("switches to a date once the day count stops helping", () => {
    expect(at("2026-10-15T09:00:00")).toBe("15 Oct");
    expect(at("2026-09-09T09:00:00")).toBe("9 Sept");
  });

  it("adds the year only when it is not this one", () => {
    expect(at("2026-01-05T09:00:00")).toBe("5 Jan");
    expect(at("2025-11-20T09:00:00")).toBe("20 Nov 2025");
  });

  it("accepts the ISO strings the API serialises", () => {
    expect(relativeDate("2026-10-22T03:00:00.000Z", now)).toBe("Today");
  });

  it("says nothing useful rather than 'Invalid Date'", () => {
    expect(relativeDate("not a date", now)).toBe("—");
  });

  it("does not call a future timestamp a number of days ago", () => {
    // Clock skew between a server and a browser should not produce "-1 days ago".
    expect(at("2026-10-23T09:00:00")).toBe("23 Oct");
  });
});
