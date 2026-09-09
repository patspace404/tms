import { describe, expect, it } from "vitest";

import { runStats } from "@/lib/run-stats";

const make = (counts: Record<string, number>) =>
  Object.entries(counts).flatMap(([status, n]) =>
    Array.from({ length: n }, () => ({ status })),
  );

describe("runStats", () => {
  it("treats an empty run as 0% rather than dividing by zero", () => {
    const s = runStats([]);
    expect(s.completionPercent).toBe(0);
    expect(s.passRate).toBe(0);
    expect(s.isFullyDecided).toBe(false);
  });

  it("counts skipped as decided, so a finished run reaches 100%", () => {
    // Real numbers from STSD "[BO] Test Sprint 1", which sat at 98% forever
    // because its three skipped cases were treated as untested.
    const s = runStats(make({ PASSED: 170, FAILED: 3, BLOCKED: 15, SKIPPED: 3 }));

    expect(s.total).toBe(191);
    expect(s.decided).toBe(191);
    expect(s.completionPercent).toBe(100);
    expect(s.isFullyDecided).toBe(true);
    expect(s.passRate).toBe(89); // 170 / 191
  });

  it("counts invalid as decided too", () => {
    const s = runStats(make({ PASSED: 8, INVALID: 2 }));
    expect(s.completionPercent).toBe(100);
    expect(s.passRate).toBe(80);
  });

  it("leaves IN_PROGRESS out — those really are untested", () => {
    // STSD "Master Data": 528 cases, 15 decided.
    const s = runStats(make({ PASSED: 12, FAILED: 2, BLOCKED: 1, IN_PROGRESS: 513 }));

    expect(s.untested).toBe(513);
    expect(s.completionPercent).toBe(3);
    expect(s.isFullyDecided).toBe(false);
    expect(s.passRate).toBe(80); // 12 / 15 decided
  });

  it("reports every bucket so a card's counts can add up to the total", () => {
    const s = runStats(make({ PASSED: 1, FAILED: 2, BLOCKED: 3, SKIPPED: 4, INVALID: 5, IN_PROGRESS: 6 }));
    expect(s.passed + s.failed + s.blocked + s.skipped + s.invalid + s.untested).toBe(s.total);
    expect(s.total).toBe(21);
  });

  it("survives a missing results list", () => {
    expect(runStats(undefined).total).toBe(0);
    expect(runStats(null).isFullyDecided).toBe(false);
  });
});
