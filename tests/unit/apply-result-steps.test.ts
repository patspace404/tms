import { beforeEach, describe, expect, it, vi } from "vitest";

const testCaseFindFirst = vi.hoisted(() => vi.fn());
const resultFindUnique = vi.hoisted(() => vi.fn());
const resultUpdate = vi.hoisted(() => vi.fn());

const memberFindFirst = vi.hoisted(() => vi.fn());
const userFindUnique = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    testCase: { findFirst: testCaseFindFirst },
    testRunResult: { findUnique: resultFindUnique, update: resultUpdate },
    projectMember: { findFirst: memberFindFirst },
    user: { findUnique: userFindUnique },
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

describe("applyResult — who ran it", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testCaseFindFirst.mockResolvedValue(twoStepCase);
    resultUpdate.mockResolvedValue({});
  });

  it("assigns an unassigned result to the token owner", async () => {
    resultFindUnique.mockResolvedValue({ id: "res-1", stepResults: {}, assigneeId: null });

    await applyResult("proj-1", "run-1", { case_id: "case-1", status: "PASSED" }, { executedById: "user-7" });

    expect(lastUpdateData()).toMatchObject({ executedById: "user-7", assigneeId: "user-7" });
  });

  it("leaves an existing assignee alone", async () => {
    resultFindUnique.mockResolvedValue({ id: "res-1", stepResults: {}, assigneeId: "user-3" });

    await applyResult("proj-1", "run-1", { case_id: "case-1", status: "PASSED" }, { executedById: "user-7" });

    const data = lastUpdateData();
    expect(data.executedById).toBe("user-7");
    expect(data).not.toHaveProperty("assigneeId");
  });

  it("assigns nobody when the caller is anonymous", async () => {
    resultFindUnique.mockResolvedValue({ id: "res-1", stepResults: {}, assigneeId: null });

    await applyResult("proj-1", "run-1", { case_id: "case-1", status: "PASSED" });

    expect(lastUpdateData()).not.toHaveProperty("assigneeId");
  });

  it("records time_spent_ms, rounded", async () => {
    resultFindUnique.mockResolvedValue({ id: "res-1", stepResults: {}, assigneeId: null });

    await applyResult(
      "proj-1", "run-1",
      { case_id: "case-1", status: "PASSED", time_spent_ms: 62_499.6 },
      { executedById: "user-7" },
    );

    expect(lastUpdateData().timeSpent).toBe(62_500);
  });
});

describe("applyResult — assignee_id", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testCaseFindFirst.mockResolvedValue(twoStepCase);
    resultUpdate.mockResolvedValue({});
    resultFindUnique.mockResolvedValue({ id: "res-1", stepResults: {}, assigneeId: null });
    memberFindFirst.mockResolvedValue({ userId: "nim" });
  });

  const asAdmin = { executedById: "migrator", role: "ADMIN" as const };

  it("credits the result to the named user, not the token owner", async () => {
    // The whole point: a migration moves 725 results that belong to other
    // people, and they have to keep their names.
    await applyResult(
      "proj-1", "run-1",
      { case_id: "case-1", status: "PASSED", assignee_id: "nim" },
      asAdmin,
    );

    const data = lastUpdateData();
    expect(data.assigneeId).toBe("nim");
    // Who pushed the row is still recorded separately.
    expect(data.executedById).toBe("migrator");
  });

  it("overrides an assignee that is already set", async () => {
    resultFindUnique.mockResolvedValue({ id: "res-1", stepResults: {}, assigneeId: "someone" });

    await applyResult(
      "proj-1", "run-1",
      { case_id: "case-1", status: "PASSED", assignee_id: "nim" },
      asAdmin,
    );

    expect(lastUpdateData().assigneeId).toBe("nim");
  });

  it("refuses a non-admin crediting someone else", async () => {
    const out = await applyResult(
      "proj-1", "run-1",
      { case_id: "case-1", status: "PASSED", assignee_id: "nim" },
      { executedById: "editor-1", role: "EDITOR" },
    );

    expect(out).toMatchObject({ status: 403 });
    expect(resultUpdate).not.toHaveBeenCalled();
  });

  it("lets a non-admin name themselves", async () => {
    memberFindFirst.mockResolvedValue({ userId: "editor-1" });

    const out = await applyResult(
      "proj-1", "run-1",
      { case_id: "case-1", status: "PASSED", assignee_id: "editor-1" },
      { executedById: "editor-1", role: "EDITOR" },
    );

    expect(out).toMatchObject({ resultId: "res-1" });
    expect(lastUpdateData().assigneeId).toBe("editor-1");
  });

  it("rejects a user who is not on the project", async () => {
    memberFindFirst.mockResolvedValue(null);
    userFindUnique.mockResolvedValue({ id: "outsider", role: "USER" });

    const out = await applyResult(
      "proj-1", "run-1",
      { case_id: "case-1", status: "PASSED", assignee_id: "outsider" },
      asAdmin,
    );

    expect(out).toMatchObject({ status: 422 });
  });

  it("accepts a workspace admin, who has no membership row", async () => {
    memberFindFirst.mockResolvedValue(null);
    userFindUnique.mockResolvedValue({ id: "boss", role: "ADMIN" });

    const out = await applyResult(
      "proj-1", "run-1",
      { case_id: "case-1", status: "PASSED", assignee_id: "boss" },
      asAdmin,
    );

    expect(out).toMatchObject({ resultId: "res-1" });
    expect(lastUpdateData().assigneeId).toBe("boss");
  });

  it("falls back to the token owner when no assignee is named", async () => {
    await applyResult("proj-1", "run-1", { case_id: "case-1", status: "PASSED" }, asAdmin);
    expect(lastUpdateData().assigneeId).toBe("migrator");
  });
});

describe("applyResult — targeting a step by id", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testCaseFindFirst.mockResolvedValue(twoStepCase);
    resultUpdate.mockResolvedValue({});
    resultFindUnique.mockResolvedValue({ id: "res-1", stepResults: {} });
  });

  it("puts each value on the step it names, whatever the array order", async () => {
    // Reading results back and writing them straight to the ids returned used
    // to land them on whichever steps sat at those array positions.
    await applyResult("proj-1", "run-1", {
      case_id: "case-1",
      status: "PASSED",
      steps: [
        { step_id: "s2", actual_result: "ของ s2" },
        { step_id: "s1", actual_result: "ของ s1" },
      ],
    });

    const { stepResults } = lastUpdateData();
    expect(stepResults.s1.actualResult).toBe("ของ s1");
    expect(stepResults.s2.actualResult).toBe("ของ s2");
  });

  it("still falls back to array position when no step_id is given", async () => {
    await applyResult("proj-1", "run-1", {
      case_id: "case-1",
      status: "PASSED",
      steps: [{ actual_result: "แรก" }, { actual_result: "สอง" }],
    });

    const { stepResults } = lastUpdateData();
    expect(stepResults.s1.actualResult).toBe("แรก");
    expect(stepResults.s2.actualResult).toBe("สอง");
  });

  it("honours an explicit position", async () => {
    await applyResult("proj-1", "run-1", {
      case_id: "case-1",
      status: "PASSED",
      steps: [{ position: 1, actual_result: "ไปที่ step 2" }],
    });

    expect(lastUpdateData().stepResults.s2.actualResult).toBe("ไปที่ step 2");
  });

  it("rejects a step id belonging to another case rather than guessing", async () => {
    const out = await applyResult("proj-1", "run-1", {
      case_id: "case-1",
      status: "PASSED",
      steps: [{ step_id: "someone-elses-step", actual_result: "x" }],
    });

    expect(out).toMatchObject({ status: 422 });
    expect(resultUpdate).not.toHaveBeenCalled();
  });

  it("rejects a position past the end of the case", async () => {
    const out = await applyResult("proj-1", "run-1", {
      case_id: "case-1",
      status: "PASSED",
      steps: [{ position: 9, actual_result: "x" }],
    });

    expect(out).toMatchObject({ status: 422 });
  });
});

describe("applyResult — clearing a step verdict", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testCaseFindFirst.mockResolvedValue(twoStepCase);
    resultUpdate.mockResolvedValue({});
    resultFindUnique.mockResolvedValue({
      id: "res-1",
      stepResults: { s1: { status: "FAILED", actualResult: "เดิม" } },
    });
  });

  it("clears the verdict on an explicit null, keeping the notes", async () => {
    await applyResult("proj-1", "run-1", {
      case_id: "case-1",
      status: "PASSED",
      steps: [{ step_id: "s1", status: null }],
    });

    const { stepResults } = lastUpdateData();
    expect(stepResults.s1.status).toBeUndefined();
    expect(stepResults.s1.actualResult).toBe("เดิม");
  });

  it("clears on UNTESTED too", async () => {
    await applyResult("proj-1", "run-1", {
      case_id: "case-1",
      status: "PASSED",
      steps: [{ step_id: "s1", status: "untested" }],
    });

    expect(lastUpdateData().stepResults.s1.status).toBeUndefined();
  });

  it("leaves the verdict alone when status is simply absent", async () => {
    await applyResult("proj-1", "run-1", {
      case_id: "case-1",
      status: "PASSED",
      steps: [{ step_id: "s1", actual_result: "ใหม่" }],
    });

    const { stepResults } = lastUpdateData();
    expect(stepResults.s1.status).toBe("FAILED");
    expect(stepResults.s1.actualResult).toBe("ใหม่");
  });

  it("rejects a status it does not recognise instead of ignoring it", async () => {
    const out = await applyResult("proj-1", "run-1", {
      case_id: "case-1",
      status: "PASSED",
      steps: [{ step_id: "s1", status: "ALMOST" }],
    });

    expect(out).toMatchObject({ status: 422 });
  });
});
