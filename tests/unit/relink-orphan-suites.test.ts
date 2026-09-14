import { beforeEach, describe, expect, it, vi } from "vitest";

const testSuiteMock = vi.hoisted(() => ({ findMany: vi.fn(), update: vi.fn() }));

vi.mock("@/lib/prisma", () => ({ prisma: { testSuite: testSuiteMock } }));
vi.mock("@/lib/s3", () => ({ s3Client: {}, S3_BUCKET: "test" }));

import { relinkOrphanSuites } from "@/lib/qase/sync";

/** `ours` rows as Prisma would return them. */
const row = (externalId: string, parentId: string | null = null) => ({
  id: `db-${externalId}`,
  externalId,
  parentId,
});

describe("relinkOrphanSuites", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testSuiteMock.update.mockResolvedValue({});
  });

  it("places a suite that was created before its parent existed", async () => {
    // PKL's real shape: 53 and 54 were made before 56, so they sit at the root.
    testSuiteMock.findMany.mockResolvedValue([row("53"), row("54"), row("56")]);

    const fixed = await relinkOrphanSuites("proj", [
      { id: 53, parent_id: 56 },
      { id: 54, parent_id: 56 },
      { id: 56, parent_id: null },
    ]);

    expect(fixed).toBe(2);
    expect(testSuiteMock.update).toHaveBeenCalledWith({
      where: { id: "db-53" },
      data: { parentId: "db-56" },
    });
    expect(testSuiteMock.update).toHaveBeenCalledWith({
      where: { id: "db-54" },
      data: { parentId: "db-56" },
    });
  });

  it("leaves a suite that already has a parent alone", async () => {
    // Somebody may have moved it in QMaster, and a re-parent in Qase is an
    // update — which this sync deliberately does not do.
    testSuiteMock.findMany.mockResolvedValue([row("53", "db-99"), row("56")]);

    expect(await relinkOrphanSuites("proj", [{ id: 53, parent_id: 56 }])).toBe(0);
    expect(testSuiteMock.update).not.toHaveBeenCalled();
  });

  it("ignores a root suite in Qase", async () => {
    testSuiteMock.findMany.mockResolvedValue([row("56")]);
    expect(await relinkOrphanSuites("proj", [{ id: 56, parent_id: null }])).toBe(0);
    expect(testSuiteMock.update).not.toHaveBeenCalled();
  });

  it("waits when the parent is not in QMaster yet", async () => {
    testSuiteMock.findMany.mockResolvedValue([row("53")]);
    expect(await relinkOrphanSuites("proj", [{ id: 53, parent_id: 56 }])).toBe(0);
    expect(testSuiteMock.update).not.toHaveBeenCalled();
  });

  it("skips a suite Qase lists but QMaster does not have", async () => {
    testSuiteMock.findMany.mockResolvedValue([row("56")]);
    expect(await relinkOrphanSuites("proj", [{ id: 99, parent_id: 56 }])).toBe(0);
  });

  it("refuses to make a suite its own parent", async () => {
    testSuiteMock.findMany.mockResolvedValue([row("56")]);
    expect(await relinkOrphanSuites("proj", [{ id: 56, parent_id: 56 }])).toBe(0);
    expect(testSuiteMock.update).not.toHaveBeenCalled();
  });

  it("links a chain in one pass regardless of list order", async () => {
    // child → mid → root, listed child-first.
    testSuiteMock.findMany.mockResolvedValue([row("3"), row("2"), row("1")]);

    const fixed = await relinkOrphanSuites("proj", [
      { id: 3, parent_id: 2 },
      { id: 2, parent_id: 1 },
      { id: 1, parent_id: null },
    ]);

    expect(fixed).toBe(2);
  });
});
