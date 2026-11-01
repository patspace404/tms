import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit-logger";
import { requireRunAccess } from "@/lib/project-route-auth";
import { POST as completeRun } from "@/app/api/runs/[runId]/complete/route";
import { POST as reopenRun } from "@/app/api/runs/[runId]/reopen/route";
import { POST as rerunRun } from "@/app/api/runs/[runId]/rerun/route";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    testRun: {
      findUnique: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
    notification: {
      createMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/audit-logger", () => ({
  logAudit: vi.fn(),
}));

vi.mock("@/lib/project-route-auth", () => ({
  requireRunAccess: vi.fn(),
}));

const mockedLogAudit = vi.mocked(logAudit);
const mockedRequireRunAccess = vi.mocked(requireRunAccess);
const testRunFindUnique = prisma.testRun.findUnique as unknown as Mock;
const testRunUpdate = prisma.testRun.update as unknown as Mock;
const testRunCreate = prisma.testRun.create as unknown as Mock;
const notificationCreateMany = prisma.notification.createMany as unknown as Mock;

const params = (runId = "run-1") => ({ params: Promise.resolve({ runId }) });
const req = (body?: unknown) =>
  new Request("http://qmaster.test/api/runs/run-1", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const json = async (response: Response) => response.json() as Promise<Record<string, unknown>>;

describe("run lifecycle API routes", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockedRequireRunAccess.mockResolvedValue({ userId: "actor-1", userRole: "USER" });
    mockedLogAudit.mockResolvedValue(undefined);
    testRunFindUnique.mockResolvedValue({
      id: "run-1",
      title: "Regression",
      status: "COMPLETED",
      projectId: "project-1",
      project: {
        id: "project-1",
        code: "PRO",
        name: "Project",
        msTeamsWebhookUrl: null,
      },
      planId: null,
      environmentId: null,
      milestoneId: null,
      results: [
        { caseId: "case-1", status: "FAILED" },
        { caseId: "case-2", status: "BLOCKED" },
        { caseId: "case-1", status: "FAILED" },
        { caseId: "case-3", status: "PASSED" },
      ],
    });
    testRunUpdate.mockResolvedValue({ id: "run-1", status: "COMPLETED" });
    testRunCreate.mockResolvedValue({ id: "rerun-1", title: "Re-run: Regression" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 200 })));
  });

  it("returns 404 when completing a missing run", async () => {
    testRunFindUnique.mockResolvedValue(null);

    const response = await completeRun(req(), params("missing"));

    expect(response.status).toBe(404);
    expect(await json(response)).toEqual({ error: "Run not found" });
    expect(testRunUpdate).not.toHaveBeenCalled();
  });

  it("completes a run and skips webhook when Teams is not configured", async () => {
    const response = await completeRun(req(), params());

    expect(response.status).toBe(200);
    expect(await json(response)).toMatchObject({ success: true });
    expect(testRunUpdate).toHaveBeenCalledWith({
      where: { id: "run-1" },
      data: { status: "COMPLETED" },
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("sends Teams webhook with run statistics when configured", async () => {
    testRunFindUnique.mockResolvedValue({
      id: "run-1",
      title: "Regression",
      results: [
        { status: "PASSED" },
        { status: "FAILED" },
        { status: "BLOCKED" },
        { status: "SKIPPED" },
      ],
      project: {
        code: "PRO",
        name: "Project",
        msTeamsWebhookUrl: "https://teams.example/webhook",
      },
    });

    const response = await completeRun(req(), params());

    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledWith(
      "https://teams.example/webhook",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"Failed","value":"1"'),
      }),
    );
  });

  it("notifies run author and assignees (excluding actor) when a run completes", async () => {
    testRunFindUnique.mockResolvedValue({
      id: "run-1",
      title: "Regression",
      authorId: "author-1",
      results: [
        { status: "PASSED", assigneeId: "assignee-1" },
        { status: "FAILED", assigneeId: "actor-1" },
      ],
      project: {
        code: "PRO",
        name: "Project",
        msTeamsWebhookUrl: null,
      },
    });

    const response = await completeRun(req(), params());

    expect(response.status).toBe(200);
    expect(notificationCreateMany).toHaveBeenCalledWith({
      data: [
        {
          recipientId: "author-1",
          actorId: "actor-1",
          type: "RUN_COMPLETED",
          entityId: "run-1",
          link: "/projects/PRO/runs/run-1",
          title: "Test Run Completed: Regression",
          message: "Pass rate 50% (1/2 passed, 1 failed)",
        },
        {
          recipientId: "assignee-1",
          actorId: "actor-1",
          type: "RUN_COMPLETED",
          entityId: "run-1",
          link: "/projects/PRO/runs/run-1",
          title: "Test Run Completed: Regression",
          message: "Pass rate 50% (1/2 passed, 1 failed)",
        },
      ],
    });
  });

  it("requires auth before reopening runs", async () => {
    mockedRequireRunAccess.mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    );

    const response = await reopenRun(req(), params());

    expect(response.status).toBe(401);
    expect(await json(response)).toEqual({ error: "Unauthorized" });
  });

  it("does not reopen an already active run", async () => {
    testRunFindUnique.mockResolvedValue({
      id: "run-1",
      title: "Regression",
      status: "ACTIVE",
      projectId: "project-1",
    });

    const response = await reopenRun(req(), params());

    expect(response.status).toBe(400);
    expect(await json(response)).toEqual({ error: "Run is already active" });
    expect(testRunUpdate).not.toHaveBeenCalled();
  });

  it("reopens inactive runs and audits the change", async () => {
    testRunUpdate.mockResolvedValue({ id: "run-1", status: "ACTIVE" });

    const response = await reopenRun(req(), params());

    expect(response.status).toBe(200);
    expect(await json(response)).toMatchObject({ success: true });
    expect(mockedLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "project-1",
        userId: "actor-1",
        entity: "TEST_RUN",
      }),
    );
  });

  it("creates a re-run from failed and blocked cases only, deduped", async () => {
    const response = await rerunRun(req(), params());

    expect(response.status).toBe(201);
    expect(testRunCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          title: "Re-run: Regression",
          results: {
            create: [
              { caseId: "case-1", status: "IN_PROGRESS" },
              { caseId: "case-2", status: "IN_PROGRESS" },
            ],
          },
        }),
      }),
    );
  });

  it("returns 400 when a re-run has no matching result statuses", async () => {
    testRunFindUnique.mockResolvedValue({
      id: "run-1",
      title: "Regression",
      project: { id: "project-1", code: "PRO" },
      results: [{ caseId: "case-1", status: "PASSED" }],
    });

    const response = await rerunRun(req(), params());

    expect(response.status).toBe(400);
    expect(await json(response)).toEqual({ error: "No matching cases to re-run in this run" });
    expect(testRunCreate).not.toHaveBeenCalled();
  });
});
