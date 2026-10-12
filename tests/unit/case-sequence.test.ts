import { beforeEach, describe, expect, it, vi } from "vitest";

import { allocateSequenceNumber } from "@/lib/case-sequence";

const projectUpdate = vi.fn();
const queryRaw = vi.fn();
const tx = { project: { update: projectUpdate }, $queryRaw: queryRaw } as any;

const counterAt = (n: number) => projectUpdate.mockResolvedValue({ caseSequence: n });
// Raw, because the highest number has to include cases sitting in the trash:
// they keep their number, and the unique constraint still counts them.
const highestRow = (n: number | null) => queryRaw.mockResolvedValue([{ max: n }]);

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

describe("allocateSequenceNumber — cases in the trash", () => {
  beforeEach(() => vi.clearAllMocks());

  it("counts a trashed case, which still holds its number", async () => {
    // A soft-deleted case keeps its row and its number. Reading only live
    // cases would hand back 120 again the moment PKL-120 was deleted, and the
    // insert would die on @@unique([projectId, sequenceNumber]).
    counterAt(120);
    highestRow(120); // the highest row is in the trash

    await expect(allocateSequenceNumber(tx, "proj-1")).resolves.toBe(121);
  });

  it("asks the database directly rather than through the filtered client", async () => {
    counterAt(5);
    highestRow(4);

    await allocateSequenceNumber(tx, "proj-1");

    expect(queryRaw).toHaveBeenCalledTimes(1);
    const [strings, ...values] = queryRaw.mock.calls[0];
    expect(strings.join("?")).toContain('MAX("sequenceNumber")');
    // The project id is bound, not interpolated into the SQL.
    expect(values).toEqual(["proj-1"]);
  });

  it("handles the bigint a raw MAX() can come back as", async () => {
    counterAt(1);
    queryRaw.mockResolvedValue([{ max: 42 as any }]);

    await expect(allocateSequenceNumber(tx, "proj-1")).resolves.toBe(43);
  });
});
