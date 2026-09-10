import { describe, expect, it } from "vitest";
import { formatDuration } from "@/lib/format-duration";

describe("formatDuration", () => {
  it("rolls a run past an hour up into hours", () => {
    // 127m 10s — the shape a 49-case API run produces
    expect(formatDuration(7_630_000)).toBe("2h 7m 10s");
  });

  it("keeps hours visible even when the remainder is empty", () => {
    expect(formatDuration(3_600_000)).toBe("1h 0m 0s");
  });

  it("drops the hour segment under 60 minutes", () => {
    expect(formatDuration(725_000)).toBe("12m 5s");
  });

  it("drops the minute segment under a minute", () => {
    expect(formatDuration(39_000)).toBe("39s");
  });

  it("truncates sub-second remainders rather than rounding up", () => {
    expect(formatDuration(59_999)).toBe("59s");
  });

  it("renders the caller's placeholder for nothing recorded", () => {
    expect(formatDuration(0)).toBe("—");
    expect(formatDuration(0, "0s")).toBe("0s");
    expect(formatDuration(undefined as unknown as number)).toBe("—");
    expect(formatDuration(-1)).toBe("—");
  });
});
