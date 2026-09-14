import { beforeEach, describe, expect, it, vi } from "vitest";

const caseMock = vi.hoisted(() => ({
  findMany: vi.fn(),
  updateMany: vi.fn(),
}));
const rawCaseMock = vi.hoisted(() => ({
  findMany: vi.fn(),
  updateMany: vi.fn(),
  deleteMany: vi.fn(),
}));
const logAuditMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: { testCase: caseMock },
  prismaRaw: { testCase: rawCaseMock },
}));
vi.mock("@/lib/audit-logger", () => ({ logAudit: logAuditMock }));

import {
  purgeCases,
  restoreCases,
  softDeleteCases,
} from "@/lib/case-delete";

const actor = { userId: "user-1" };

describe("softDeleteCases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    logAuditMock.mockResolvedValue(undefined);
  });

  it("stamps deletedAt and who did it, rather than removing the row", async () => {
    caseMock.findMany.mockResolvedValue([{ id: "c1", title: "Login test" }]);
    caseMock.updateMany.mockResolvedValue({ count: 1 });

    expect(await softDeleteCases("proj-1", ["c1"], actor)).toBe(1);

    const [args] = caseMock.updateMany.mock.calls[0];
    expect(args.where).toMatchObject({ projectId: "proj-1" });
    expect(args.data.deletedById).toBe("user-1");
    expect(args.data.deletedAt).toBeInstanceOf(Date);
  });

  it("names the case in the audit entry", async () => {
    caseMock.findMany.mockResolvedValue([{ id: "c1", title: "Login test" }]);
    caseMock.updateMany.mockResolvedValue({ count: 1 });

    await softDeleteCases("proj-1", ["c1"], actor);

    expect(logAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "proj-1",
        userId: "user-1",
        action: "DELETED",
        entity: "TEST_CASE",
        entityId: "c1",
        details: "Moved test case to trash: Login test",
      }),
    );
  });

  it("summarises a large batch instead of listing every title", async () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ id: `c${i}`, title: `Case ${i}` }));
    caseMock.findMany.mockResolvedValue(many);
    caseMock.updateMany.mockResolvedValue({ count: 8 });

    await softDeleteCases("proj-1", many.map((c) => c.id), actor);

    const { details, entityId } = logAuditMock.mock.calls[0][0];
    expect(details).toContain("Moved 8 test cases to trash");
    expect(details).toContain("+3 more");
    expect(entityId).toBeUndefined(); // no single case to point at
  });

  it("only touches cases in the given project", async () => {
    // A case id from elsewhere simply is not found, so nothing is written.
    caseMock.findMany.mockResolvedValue([]);

    expect(await softDeleteCases("proj-1", ["someone-elses-case"], actor)).toBe(0);
    expect(caseMock.updateMany).not.toHaveBeenCalled();
    expect(logAuditMock).not.toHaveBeenCalled();
  });

  it("does nothing when given no ids", async () => {
    expect(await softDeleteCases("proj-1", [], actor)).toBe(0);
    expect(caseMock.findMany).not.toHaveBeenCalled();
  });
});

describe("restoreCases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    logAuditMock.mockResolvedValue(undefined);
  });

  it("clears the delete stamp, reading through the raw client", async () => {
    rawCaseMock.findMany.mockResolvedValue([{ id: "c1", title: "Login test" }]);
    rawCaseMock.updateMany.mockResolvedValue({ count: 1 });

    expect(await restoreCases("proj-1", ["c1"], actor)).toBe(1);

    // The default client hides these rows, so the lookup must bypass it.
    expect(caseMock.findMany).not.toHaveBeenCalled();
    expect(rawCaseMock.findMany.mock.calls[0][0].where).toMatchObject({
      deletedAt: { not: null },
    });
    expect(rawCaseMock.updateMany.mock.calls[0][0].data).toEqual({
      deletedAt: null,
      deletedById: null,
    });
  });

  it("ignores a case that is not in the trash", async () => {
    rawCaseMock.findMany.mockResolvedValue([]);
    expect(await restoreCases("proj-1", ["c1"], actor)).toBe(0);
    expect(rawCaseMock.updateMany).not.toHaveBeenCalled();
  });
});

describe("purgeCases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    logAuditMock.mockResolvedValue(undefined);
  });

  it("can only reach rows already in the trash", async () => {
    rawCaseMock.findMany.mockResolvedValue([{ id: "c1", title: "Login test" }]);
    rawCaseMock.deleteMany.mockResolvedValue({ count: 1 });

    expect(await purgeCases("proj-1", ["c1"], actor)).toBe(1);

    // Both the lookup and the delete carry the guard, so a live case cannot be
    // destroyed even if its id is passed here.
    expect(rawCaseMock.deleteMany.mock.calls[0][0].where).toMatchObject({
      projectId: "proj-1",
      deletedAt: { not: null },
    });
  });

  it("refuses a live case", async () => {
    rawCaseMock.findMany.mockResolvedValue([]); // not in the trash
    expect(await purgeCases("proj-1", ["live-case"], actor)).toBe(0);
    expect(rawCaseMock.deleteMany).not.toHaveBeenCalled();
    expect(logAuditMock).not.toHaveBeenCalled();
  });

  it("records the permanent deletion", async () => {
    rawCaseMock.findMany.mockResolvedValue([{ id: "c1", title: "Login test" }]);
    rawCaseMock.deleteMany.mockResolvedValue({ count: 1 });

    await purgeCases("proj-1", ["c1"], actor);

    expect(logAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "DELETED",
        details: "Permanently deleted test case: Login test",
      }),
    );
  });
});
