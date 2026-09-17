import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/api-auth";
import { POST as bulkResults } from "@/app/api/runs/[runId]/bulk/route";
import { DELETE, PATCH } from "@/app/api/runs/[runId]/results/[resultId]/route";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    testRun: {
      findUnique: vi.fn(),
    },
    testRunResult: {
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      upsert: vi.fn(),
    },
    notification: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/api-auth", () => ({
  getSessionUser: vi.fn(),
}));

const mockedGetSessionUser = vi.mocked(getSessionUser);
const testRunFindUnique = prisma.testRun.findUnique as unknown as Mock;
const resultFindUnique = prisma.testRunResult.findUnique as unknown as Mock;
const resultUpdate = prisma.testRunResult.update as unknown as Mock;
const resultDelete = prisma.testRunResult.delete as unknown as Mock;
const resultUpsert = prisma.testRunResult.upsert as unknown as Mock;
const notificationCreate = prisma.notification.create as unknown as Mock;
const prismaTransaction = prisma.$transaction as unknown as Mock;

const params = (runId = "run-1", resultId = "result-1") => ({
  params: Promise.resolve({ runId, resultId }),
});
const req = (body: unknown, method = "PATCH") =>
  new Request("http://qmaster.test/api/runs/run-1/results/result-1", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
const json = async (response: Response) => response.json() as Promise<Record<string, unknown>>;

describe("run result API routes", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockedGetSessionUser.mockResolvedValue({ id: "actor-1", role: "USER", workspaceRole: null });
    testRunFindUnique.mockResolvedValue({ id: "run-1" });
    resultFindUnique.mockResolvedValue({
      assigneeId: null,
      testCase: { title: "Checkout works" },
    });
    resultUpdate.mockResolvedValue({ id: "result-1", status: "PASSED", assigneeId: "actor-1" });
    resultDelete.mockResolvedValue({});
    resultUpsert.mockImplementation((args) => args);
    prismaTransaction.mockImplementation(async (ops: unknown[]) => ops);
  });

  describe("step verdicts when a case is passed", () => {
    const withSteps = (stepResults: unknown = null) => {
      resultFindUnique.mockResolvedValue({
        assigneeId: "actor-1",
        stepResults,
        testCase: {
          title: "Checkout works",
          steps: [{ id: "step-1" }, { id: "step-2" }],
        },
      });
    };
    const writtenStepResults = () =>
      resultUpdate.mock.calls[0][0].data.stepResults as Record<string, any>;

    it("stamps every step, so the report has something to show", async () => {
      // Passing a case in the app settles the case, not its steps. Without
      // this the shared report printed a verdict for none of them.
      withSteps();

      await PATCH(req({ status: "PASSED" }), params());

      expect(writtenStepResults()).toEqual({
        "step-1": { status: "PASSED", derivedFrom: "case-result" },
        "step-2": { status: "PASSED", derivedFrom: "case-result" },
      });
    });

    it("marks them as inferred rather than passing them off as recorded", async () => {
      withSteps();
      await PATCH(req({ status: "PASSED" }), params());
      for (const v of Object.values(writtenStepResults())) {
        expect(v.derivedFrom).toBe("case-result");
      }
    });

    it("leaves a part-stamped case alone — that is someone's work in progress", async () => {
      withSteps({ "step-1": { status: "FAILED" } });

      await PATCH(req({ status: "PASSED" }), params());

      // Nothing is written for stepResults at all, which is how Prisma is told
      // to leave the stored value exactly as it is.
      expect(writtenStepResults()).toBeUndefined();
    });

    it("keeps evidence already attached to a step", async () => {
      withSteps({ "step-1": { attachments: [{ url: "/api/uploads/shot.png" }] } });

      await PATCH(req({ status: "PASSED" }), params());

      expect(writtenStepResults()["step-1"]).toEqual({
        attachments: [{ url: "/api/uploads/shot.png" }],
        status: "PASSED",
        derivedFrom: "case-result",
      });
    });

    it("does not infer anything for a failed case", async () => {
      // Which step failed is not something that can be guessed.
      withSteps();

      await PATCH(req({ status: "FAILED" }), params());

      expect(resultUpdate.mock.calls[0][0].data.stepResults).toBeUndefined();
    });

    it("survives a case with no steps", async () => {
      resultFindUnique.mockResolvedValue({
        assigneeId: "actor-1",
        stepResults: null,
        testCase: { title: "Smoke", steps: [] },
      });

      const response = await PATCH(req({ status: "PASSED" }), params());

      expect(response.status).toBe(200);
    });
  });

  it("auto-assigns the actor when status changes and result has no assignee", async () => {
    const response = await PATCH(req({ status: "PASSED" }), params());

    expect(response.status).toBe(200);
    expect(resultUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "result-1", runId: "run-1" },
        data: expect.objectContaining({
          status: "PASSED",
          assigneeId: "actor-1",
        }),
      }),
    );
  });

  it("notifies a newly assigned user when assignment changes to someone else", async () => {
    resultFindUnique
      .mockResolvedValueOnce({ assigneeId: null })
      .mockResolvedValueOnce({ assigneeId: null, testCase: { title: "Checkout works" } });
    resultUpdate.mockResolvedValue({ id: "result-1", assigneeId: "user-2" });

    const response = await PATCH(req({ status: "FAILED", assigneeId: "user-2" }), params());

    expect(response.status).toBe(200);
    expect(notificationCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        recipientId: "user-2",
        actorId: "actor-1",
        type: "ASSIGNMENT",
        entityId: "result-1",
      }),
    });
  });

  it("does not notify when assigning the actor to themselves", async () => {
    resultUpdate.mockResolvedValue({ id: "result-1", assigneeId: "actor-1" });

    const response = await PATCH(req({ status: "FAILED", assigneeId: "actor-1" }), params());

    expect(response.status).toBe(200);
    expect(notificationCreate).not.toHaveBeenCalled();
  });

  it("deletes a run result scoped to its run", async () => {
    const response = await DELETE(new Request("http://qmaster.test", { method: "DELETE" }), params());

    expect(response.status).toBe(200);
    expect(await json(response)).toEqual({ success: true });
    expect(resultDelete).toHaveBeenCalledWith({
      where: { id: "result-1", runId: "run-1" },
    });
  });

  it("bulk upserts valid automation results", async () => {
    const response = await bulkResults(
      req(
        {
          results: [
            { caseId: "case-1", status: "PASSED", timeSpent: 12 },
            { caseId: "case-2", status: "FAILED", errorMessage: "boom" },
          ],
        },
        "POST",
      ),
      { params: Promise.resolve({ runId: "run-1" }) },
    );

    expect(response.status).toBe(200);
    expect(await json(response)).toEqual({
      message: "Successfully processed 2 results",
      count: 2,
    });
    expect(resultUpsert).toHaveBeenCalledTimes(2);
    expect(prismaTransaction).toHaveBeenCalledTimes(1);
  });

  it("returns 404 when bulk import targets a missing run", async () => {
    testRunFindUnique.mockResolvedValue(null);

    const response = await bulkResults(
      req({ results: [{ caseId: "case-1", status: "PASSED" }] }, "POST"),
      { params: Promise.resolve({ runId: "missing" }) },
    );

    expect(response.status).toBe(404);
    expect(await json(response)).toEqual({ error: "Test Run not found" });
  });
});
