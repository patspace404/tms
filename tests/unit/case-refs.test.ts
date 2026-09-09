import { beforeEach, describe, expect, it, vi } from "vitest";

const findMany = vi.hoisted(() => vi.fn());
vi.mock("@/lib/prisma", () => ({ prisma: { testCase: { findMany } } }));

import { resolveCaseRefs } from "@/lib/case-refs";

describe("resolveCaseRefs", () => {
  beforeEach(() => vi.clearAllMocks());

  it("resolves sequence numbers", async () => {
    findMany.mockResolvedValue([
      { id: "uuid-121", sequenceNumber: 121 },
      { id: "uuid-170", sequenceNumber: 170 },
    ]);

    await expect(resolveCaseRefs("p1", [121, 170])).resolves.toEqual({
      ids: ["uuid-121", "uuid-170"],
      unresolved: [],
    });
    expect(findMany.mock.calls[0][0].where.OR).toEqual([
      { sequenceNumber: { in: [121, 170] } },
    ]);
  });

  it("resolves uuids", async () => {
    findMany.mockResolvedValue([{ id: "uuid-a", sequenceNumber: 5 }]);

    await expect(resolveCaseRefs("p1", ["uuid-a"])).resolves.toEqual({
      ids: ["uuid-a"],
      unresolved: [],
    });
    expect(findMany.mock.calls[0][0].where.OR).toEqual([{ id: { in: ["uuid-a"] } }]);
  });

  it("accepts a sequence number sent as a numeric string", async () => {
    findMany.mockResolvedValue([{ id: "uuid-121", sequenceNumber: 121 }]);

    const out = await resolveCaseRefs("p1", ["121"]);

    // "121" is a sequence number, not a uuid — it must not be queried as an id
    expect(findMany.mock.calls[0][0].where.OR).toEqual([
      { sequenceNumber: { in: [121] } },
    ]);
    expect(out).toEqual({ ids: ["uuid-121"], unresolved: [] });
  });

  it("reports references that match nothing", async () => {
    findMany.mockResolvedValue([{ id: "uuid-121", sequenceNumber: 121 }]);

    await expect(resolveCaseRefs("p1", [121, 9999, "not-a-case"])).resolves.toEqual({
      ids: ["uuid-121"],
      unresolved: [9999, "not-a-case"],
    });
  });

  it("treats a non-string non-number reference as unresolved", async () => {
    findMany.mockResolvedValue([]);

    await expect(resolveCaseRefs("p1", [{ id: 1 } as unknown])).resolves.toMatchObject({
      ids: [],
      unresolved: [{ id: 1 }],
    });
  });
});
