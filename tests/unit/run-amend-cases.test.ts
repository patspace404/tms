import { beforeEach, describe, expect, it, vi } from "vitest";

const runFindFirst = vi.hoisted(() => vi.fn());
const runUpdate = vi.hoisted(() => vi.fn());
const resultFindMany = vi.hoisted(() => vi.fn());
const resultDeleteMany = vi.hoisted(() => vi.fn());
const resultCreateMany = vi.hoisted(() => vi.fn());
const transaction = vi.hoisted(() => vi.fn());
const requireProject = vi.hoisted(() => vi.fn());
const resolveCaseRefs = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    testRun: { findFirst: runFindFirst, update: runUpdate },
    testRunResult: {
      findMany: resultFindMany,
      deleteMany: resultDeleteMany,
      createMany: resultCreateMany,
    },
    $transaction: transaction,
  },
}));
vi.mock("@/lib/case-refs", () => ({ resolveCaseRefs }));
vi.mock("@/lib/api-v1", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api-v1")>("@/lib/api-v1");
  return { ...actual, requireProject };
});

import { PATCH } from "@/app/api/v1/run/[code]/[id]/route";

const params = { params: Promise.resolve({ code: "BCP", id: "run-1" }) };
const patch = (body: unknown) =>
  PATCH(
    new Request("http://localhost/api/v1/run/BCP/run-1", {
      method: "PATCH",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    }),
    params,
  );

/** cases currently in the run, and what has been recorded against them */
const inRun = (...caseIds: string[]) =>
  resultFindMany.mockResolvedValue(caseIds.map((caseId) => ({ caseId })));

describe("PATCH /api/v1/run/{code}/{id} — amending the case list", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireProject.mockResolvedValue({ projectId: "proj-1", actor: { userId: "u1" } });
    runFindFirst.mockResolvedValue({ id: "run-1", status: "ACTIVE" });
    runUpdate.mockResolvedValue({ id: "run-1", title: "run", status: "ACTIVE", _count: { results: 3 } });
    transaction.mockImplementation(async (cb: any) =>
      cb({
        testRunResult: { deleteMany: resultDeleteMany, createMany: resultCreateMany },
      }),
    );
    resolveCaseRefs.mockResolvedValue({ ids: [], unresolved: [] });
    inRun("case-a", "case-b");
  });

  it("leaves the case list alone when neither field is sent", async () => {
    const res = await patch({ title: "renamed" });

    expect(res.status).toBe(200);
    expect(resultCreateMany).not.toHaveBeenCalled();
    expect(resultDeleteMany).not.toHaveBeenCalled();
    expect((await res.json()).result.cases).toBeUndefined();
  });

  it("adds cases as IN_PROGRESS", async () => {
    resolveCaseRefs.mockResolvedValueOnce({ ids: ["case-c"], unresolved: [] });

    const res = await patch({ add_cases: [170] });

    expect(res.status).toBe(200);
    expect(resultCreateMany).toHaveBeenCalledWith({
      data: [{ runId: "run-1", caseId: "case-c", status: "IN_PROGRESS" }],
      skipDuplicates: true,
    });
    expect((await res.json()).result.cases.added).toEqual(["case-c"]);
  });

  it("treats adding a case already in the run as a no-op", async () => {
    resolveCaseRefs.mockResolvedValueOnce({ ids: ["case-a"], unresolved: [] });

    const res = await patch({ add_cases: ["case-a"] });

    expect(resultCreateMany).not.toHaveBeenCalled();
    const body = await res.json();
    expect(body.result.cases.added).toEqual([]);
    expect(body.result.cases.already_present).toEqual(["case-a"]);
  });

  it("removes a case that has no recorded result", async () => {
    resolveCaseRefs
      .mockResolvedValueOnce({ ids: [], unresolved: [] })
      .mockResolvedValueOnce({ ids: ["case-b"], unresolved: [] });
    resultFindMany
      .mockResolvedValueOnce([{ caseId: "case-a" }, { caseId: "case-b" }]) // membership
      .mockResolvedValueOnce([]); // nothing recorded

    const res = await patch({ remove_cases: ["case-b"] });

    expect(res.status).toBe(200);
    expect(resultDeleteMany).toHaveBeenCalledWith({
      where: { runId: "run-1", caseId: { in: ["case-b"] } },
    });
  });

  it("refuses to discard a recorded result without force, and names the cases", async () => {
    resolveCaseRefs
      .mockResolvedValueOnce({ ids: [], unresolved: [] })
      .mockResolvedValueOnce({ ids: ["case-b"], unresolved: [] });
    resultFindMany
      .mockResolvedValueOnce([{ caseId: "case-a" }, { caseId: "case-b" }])
      .mockResolvedValueOnce([{ testCase: { sequenceNumber: 148 }, status: "FAILED" }]);

    const res = await patch({ remove_cases: ["case-b"] });

    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain("BCP-148 (FAILED)");
    expect(resultDeleteMany).not.toHaveBeenCalled();
  });

  it("discards a recorded result when force is set", async () => {
    resolveCaseRefs
      .mockResolvedValueOnce({ ids: [], unresolved: [] })
      .mockResolvedValueOnce({ ids: ["case-b"], unresolved: [] });
    inRun("case-a", "case-b");

    const res = await patch({ remove_cases: ["case-b"], force: true });

    expect(res.status).toBe(200);
    expect(resultDeleteMany).toHaveBeenCalled();
  });

  it("rejects references that name no case in the project", async () => {
    resolveCaseRefs.mockResolvedValueOnce({ ids: [], unresolved: [9999] });

    const res = await patch({ add_cases: [9999] });

    expect(res.status).toBe(422);
    expect((await res.json()).error).toContain("9999");
  });

  it("refuses to empty the run", async () => {
    resolveCaseRefs
      .mockResolvedValueOnce({ ids: [], unresolved: [] })
      .mockResolvedValueOnce({ ids: ["case-a", "case-b"], unresolved: [] });
    inRun("case-a", "case-b");

    const res = await patch({ remove_cases: ["case-a", "case-b"], force: true });

    expect(res.status).toBe(422);
    expect((await res.json()).error).toContain("at least one case");
  });

  it("refuses to amend a run that is not active", async () => {
    runFindFirst.mockResolvedValue({ id: "run-1", status: "COMPLETED" });
    resolveCaseRefs.mockResolvedValueOnce({ ids: ["case-c"], unresolved: [] });

    const res = await patch({ add_cases: ["case-c"] });

    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain("not active");
  });

  it("still allows renaming a completed run", async () => {
    runFindFirst.mockResolvedValue({ id: "run-1", status: "COMPLETED" });

    const res = await patch({ title: "renamed after the fact" });

    expect(res.status).toBe(200);
  });

  it("rejects a non-array add_cases", async () => {
    const res = await patch({ add_cases: "170" });

    expect(res.status).toBe(422);
    expect((await res.json()).error).toContain("must be an array");
  });
});
