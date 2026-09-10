import { beforeEach, describe, expect, it, vi } from "vitest";

const testCaseFindFirst = vi.hoisted(() => vi.fn());
const resultFindUnique = vi.hoisted(() => vi.fn());
const resultUpdate = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    testCase: { findFirst: testCaseFindFirst },
    testRunResult: { findUnique: resultFindUnique, update: resultUpdate },
  },
}));

import { applyResult } from "@/app/api/v1/result/[code]/[runId]/apply";

// A case whose two live steps have ids s1, s2
const twoStepCase = {
  id: "case-1",
  steps: [{ id: "s1" }, { id: "s2" }],
};

const lastUpdateData = () => resultUpdate.mock.calls.at(-1)![0].data;

describe("applyResult — step result pruning", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testCaseFindFirst.mockResolvedValue(twoStepCase);
    resultUpdate.mockResolvedValue({});
  });

  it("stamps actual_result onto the current step ids", async () => {
    resultFindUnique.mockResolvedValue({ id: "res-1", stepResults: {} });

    await applyResult("proj-1", "run-1", {
      case_id: "case-1",
      status: "PASSED",
      steps: [
        { status: "PASSED", actual_result: "HTTP 200" },
        { status: "PASSED", actual_result: "มี result.sections" },
      ],
    });

    expect(lastUpdateData().stepResults).toEqual({
      s1: { status: "PASSED", actualResult: "HTTP 200" },
      s2: { status: "PASSED", actualResult: "มี result.sections" },
    });
  });

  it("drops step results left over from steps that were edited away", async () => {
    // "old-step" is orphaned: it is not among the case's current step ids.
    resultFindUnique.mockResolvedValue({
      id: "res-1",
      stepResults: {
        "old-step": { status: "PASSED", actualResult: "ผลเก่าจาก step ที่ถูกแก้ทิ้ง" },
        s1: { status: "FAILED", actualResult: "ค่าเดิม" },
      },
    });

    await applyResult("proj-1", "run-1", {
      case_id: "case-1",
      status: "PASSED",
      steps: [
        { status: "PASSED", actual_result: "HTTP 200" },
        { status: "PASSED", actual_result: "มี result.sections" },
      ],
    });

    const { stepResults } = lastUpdateData();
    expect(Object.keys(stepResults).sort()).toEqual(["s1", "s2"]);
    expect(stepResults["old-step"]).toBeUndefined();
    expect(stepResults.s1.actualResult).toBe("HTTP 200");
  });

  it("keeps an existing live-step outcome when a submit omits that step's fields", async () => {
    resultFindUnique.mockResolvedValue({
      id: "res-1",
      stepResults: { s2: { status: "PASSED", actualResult: "เดิม" } },
    });

    await applyResult("proj-1", "run-1", {
      case_id: "case-1",
      status: "PASSED",
      steps: [
        { status: "PASSED", actual_result: "HTTP 200" },
        {}, // no fields for step 2 — its prior outcome should survive
      ],
    });

    const { stepResults } = lastUpdateData();
    expect(stepResults.s2.actualResult).toBe("เดิม");
    expect(stepResults.s1.actualResult).toBe("HTTP 200");
  });
});
