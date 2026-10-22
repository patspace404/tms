import { beforeEach, describe, expect, it, vi } from "vitest";

const testRunResultMock = vi.hoisted(() => ({
  findUnique: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}));
const notificationMock = vi.hoisted(() => ({ create: vi.fn() }));
const apiAuthMock = vi.hoisted(() => ({ getSessionUser: vi.fn() }));

const testRunMock = vi.hoisted(() => ({ findFirst: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    testRunResult: testRunResultMock,
    notification: notificationMock,
    // requireOpenRun reads the run before allowing a result change.
    testRun: testRunMock,
  },
}));
vi.mock("@/lib/api-auth", () => apiAuthMock);

import { PATCH, DELETE } from "@/app/api/runs/[runId]/results/[resultId]/route";

const routeParams = (runId: string, resultId: string) => ({
  params: Promise.resolve({ runId, resultId }),
});

function patchRequest(body: unknown) {
  return new Request("http://localhost/api/runs/run-1/results/res-1", {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("PATCH /api/runs/[runId]/results/[resultId]", () => {
  beforeEach(() => {
    testRunMock.findFirst.mockResolvedValue({ id: "run-1", status: "ACTIVE" });
    vi.clearAllMocks();
    apiAuthMock.getSessionUser.mockResolvedValue({ id: "u1", role: "ADMIN" });
    testRunResultMock.findUnique.mockResolvedValue({ assigneeId: null, testCase: { title: "Case A" } });
    testRunResultMock.update.mockImplementation(({ data }) => Promise.resolve({ id: "res-1", ...data }));
  });

  it("saves a comment (bug note) scoped to the run", async () => {
    const note = "BUG: Save Changes does not fire PATCH when a step is empty";

    const res = await PATCH(patchRequest({ comment: note }), routeParams("run-1", "res-1"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.comment).toBe(note);
    expect(testRunResultMock.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "res-1", runId: "run-1" },
        data: expect.objectContaining({ comment: note }),
      }),
    );
  });

  it("updates only the comment without touching status (status stays undefined)", async () => {
    await PATCH(patchRequest({ comment: "just a note" }), routeParams("run-1", "res-1"));

    const call = testRunResultMock.update.mock.calls[0][0];
    expect(call.data.comment).toBe("just a note");
    expect(call.data.status).toBeUndefined();
    // No status change → no auto-assign lookup should have run for assignment
    expect(notificationMock.create).not.toHaveBeenCalled();
  });

  it("updates status and auto-assigns to the actor when unassigned", async () => {
    const res = await PATCH(patchRequest({ status: "FAILED" }), routeParams("run-1", "res-1"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe("FAILED");
    expect(testRunResultMock.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "FAILED", assigneeId: "u1" }) }),
    );
  });

  it("returns 500 when the update fails", async () => {
    testRunResultMock.update.mockRejectedValue(new Error("DB error"));

    const res = await PATCH(patchRequest({ comment: "x" }), routeParams("run-1", "res-1"));

    expect(res.status).toBe(500);
  });
});

describe("DELETE /api/runs/[runId]/results/[resultId]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("deletes the result scoped to the run and returns success", async () => {
    testRunResultMock.delete.mockResolvedValue({ id: "res-1" });

    const res = await DELETE(
      new Request("http://localhost/api/runs/run-1/results/res-1", { method: "DELETE" }),
      routeParams("run-1", "res-1"),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(testRunResultMock.delete).toHaveBeenCalledWith({
      where: { id: "res-1", runId: "run-1" },
    });
  });

  it("returns 500 when delete fails", async () => {
    testRunResultMock.delete.mockRejectedValue(new Error("DB error"));

    const res = await DELETE(
      new Request("http://localhost/api/runs/run-1/results/res-1", { method: "DELETE" }),
      routeParams("run-1", "res-1"),
    );

    expect(res.status).toBe(500);
  });
});

describe("a closed run refuses result changes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiAuthMock.getSessionUser.mockResolvedValue({ id: "user-1" });
  });

  for (const status of ["COMPLETED", "ABORTED"] as const) {
    it(`refuses a PATCH on a ${status} run`, async () => {
      testRunMock.findFirst.mockResolvedValue({ id: "run-1", status });

      const res = await PATCH(
        patchRequest({ status: "PASSED" }),
        routeParams("run-1", "res-1"),
      );

      expect(res.status).toBe(409);
      expect(testRunResultMock.update).not.toHaveBeenCalled();
    });

    it(`refuses a DELETE on a ${status} run`, async () => {
      testRunMock.findFirst.mockResolvedValue({ id: "run-1", status });

      const res = await DELETE(
        new Request("http://localhost/api/runs/run-1/results/res-1", { method: "DELETE" }),
        routeParams("run-1", "res-1"),
      );

      expect(res.status).toBe(409);
      expect(testRunResultMock.delete).not.toHaveBeenCalled();
    });
  }

  it("says to reopen the run rather than just refusing", async () => {
    testRunMock.findFirst.mockResolvedValue({ id: "run-1", status: "COMPLETED" });

    const res = await PATCH(
      patchRequest({ status: "PASSED" }),
      routeParams("run-1", "res-1"),
    );

    expect((await res.json()).error).toMatch(/reopen/i);
  });
});
