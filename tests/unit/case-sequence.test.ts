import { beforeEach, describe, expect, it, vi } from "vitest";

import { allocateSequenceNumber } from "@/lib/case-sequence";

const projectUpdate = vi.fn();
const testCaseAggregate = vi.fn();
const tx = { project: { update: projectUpdate }, testCase: { aggregate: testCaseAggregate } } as any;

const counterAt = (n: number) => projectUpdate.mockResolvedValue({ caseSequence: n });
const highestRow = (n: number | null) =>
  testCaseAggregate.mockResolvedValue({ _max: { sequenceNumber: n } });

describe("allocateSequenceNumber", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the incremented counter when it is already ahead of the rows", async () => {
    counterAt(120);
    highestRow(119);

    await expect(allocateSequenceNumber(tx, "proj-1")).resolves.toBe(120);
    // one atomic increment, no catch-up write
    expect(projectUpdate).toHaveBeenCalledTimes(1);
    expect(projectUpdate).toHaveBeenCalledWith({
      where: { id: "proj-1" },
      data: { caseSequence: { increment: 1 } },
      select: { caseSequence: true },
    });
  });

  it("starts at 1 for a project with no cases", async () => {
    counterAt(1);
    highestRow(null);

    await expect(allocateSequenceNumber(tx, "proj-1")).resolves.toBe(1);
    expect(projectUpdate).toHaveBeenCalledTimes(1);
  });

  it("skips past existing rows when the counter has fallen behind", async () => {
    // BCP: 119 cases imported directly, counter left at 8 by the loader script.
    counterAt(9);
    highestRow(119);

    await expect(allocateSequenceNumber(tx, "proj-1")).resolves.toBe(120);
  });

  it("persists the catch-up so the next create does not collide either", async () => {
    counterAt(9);
    highestRow(119);

    await allocateSequenceNumber(tx, "proj-1");

    expect(projectUpdate).toHaveBeenNthCalledWith(2, {
      where: { id: "proj-1" },
      data: { caseSequence: 120 },
    });
  });

  it("does not rewind the counter when rows were deleted from the end", async () => {
    // 119 cases created, the last 20 deleted: the counter must keep climbing so
    // freed numbers are never handed out twice.
    counterAt(120);
    highestRow(99);

    await expect(allocateSequenceNumber(tx, "proj-1")).resolves.toBe(120);
    expect(projectUpdate).toHaveBeenCalledTimes(1);
  });
});
