import { describe, expect, it } from "vitest";
import { compareCases, typeLabelOf } from "@/lib/case-sort";

const c = (tc: any) => ({ sequenceNumber: 0, title: "", ...tc });
const sortBy = (rows: any[], key: any, dir: any = "asc") =>
  [...rows].sort((a, b) => compareCases(a, b, key, dir));

describe("compareCases", () => {
  it("orders case numbers numerically, not as text", () => {
    const rows = [c({ sequenceNumber: 10 }), c({ sequenceNumber: 9 }), c({ sequenceNumber: 2 })];
    expect(sortBy(rows, "id").map((r) => r.sequenceNumber)).toEqual([2, 9, 10]);
  });

  it("reverses on desc", () => {
    const rows = [c({ sequenceNumber: 1 }), c({ sequenceNumber: 3 })];
    expect(sortBy(rows, "id", "desc").map((r) => r.sequenceNumber)).toEqual([3, 1]);
  });

  it("sorts titles without regard to case", () => {
    const rows = [c({ title: "beta" }), c({ title: "Alpha" })];
    expect(sortBy(rows, "title").map((r) => r.title)).toEqual(["Alpha", "beta"]);
  });

  it("ranks priority by severity rather than alphabetically", () => {
    // Alphabetically this would be HIGH, LOW, MEDIUM.
    const rows = [
      c({ priority: "MEDIUM", sequenceNumber: 1 }),
      c({ priority: "HIGH", sequenceNumber: 2 }),
      c({ priority: "LOW", sequenceNumber: 3 }),
    ];
    expect(sortBy(rows, "priority").map((r) => r.priority)).toEqual([
      "LOW",
      "MEDIUM",
      "HIGH",
    ]);
  });

  it("treats a case with no priority as the lowest", () => {
    const rows = [c({ priority: "LOW", sequenceNumber: 1 }), c({ sequenceNumber: 2 })];
    expect(sortBy(rows, "priority").map((r) => r.sequenceNumber)).toEqual([2, 1]);
  });

  it("falls back to the assignee, then the author, for owner", () => {
    const rows = [
      c({ author: { name: "Zoe" }, sequenceNumber: 1 }),
      c({ assignee: { name: "Adam" }, sequenceNumber: 2 }),
    ];
    expect(sortBy(rows, "owner").map((r) => r.sequenceNumber)).toEqual([2, 1]);
  });

  it("breaks ties on case number, so equal rows never reshuffle", () => {
    const rows = [
      c({ title: "same", sequenceNumber: 7 }),
      c({ title: "same", sequenceNumber: 3 }),
      c({ title: "same", sequenceNumber: 5 }),
    ];
    expect(sortBy(rows, "title").map((r) => r.sequenceNumber)).toEqual([3, 5, 7]);
    // And the same order comes back on a re-sort of an already-sorted list.
    expect(sortBy(sortBy(rows, "title"), "title").map((r) => r.sequenceNumber)).toEqual([
      3, 5, 7,
    ]);
  });

  it("orders by the label shown in the Type column", () => {
    const rows = [
      c({ type: "FUNCTIONAL", sequenceNumber: 1 }),
      c({ automationStatus: "AUTOMATED", sequenceNumber: 2 }),
    ];
    expect(sortBy(rows, "type").map((r) => typeLabelOf(r))).toEqual([
      "Automated",
      "Functional",
    ]);
  });
});

describe("typeLabelOf", () => {
  it("calls an untyped case Manual", () => {
    expect(typeLabelOf({})).toBe("Manual");
  });

  it("lets an explicit type win over automation status", () => {
    expect(typeLabelOf({ type: "NEGATIVE", automationStatus: "AUTOMATED" })).toBe(
      "Negative",
    );
  });
});
