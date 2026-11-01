import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { requireProjectRole } from "@/lib/project-auth";
import { logAudit } from "@/lib/audit-logger";
import { POST } from "@/app/api/projects/[code]/runs/route";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: {
      findFirst: vi.fn(),
    },
    testCase: {
      findMany: vi.fn(),
    },
    testPlan: {
      findFirst: vi.fn(),
    },
    testRun: {
      create: vi.fn(),
    },
    projectMember: {
      findMany: vi.fn(),
    },
    notification: {
      createMany: vi.fn(),
    },
  },
}));

vi.mock("next-auth/next", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  authOptions: {},
}));

vi.mock("@/lib/project-auth", () => ({
  requireProjectRole: vi.fn(),
}));

vi.mock("@/lib/audit-logger", () => ({
  logAudit: vi.fn(),
}));

const mockedGetServerSession = vi.mocked(getServerSession);
const mockedRequireProjectRole = vi.mocked(requireProjectRole);
const mockedLogAudit = vi.mocked(logAudit);
const projectFindFirst = prisma.project.findFirst as unknown as Mock;
const testCaseFindMany = prisma.testCase.findMany as unknown as Mock;
const testPlanFindFirst = prisma.testPlan.findFirst as unknown as Mock;
const testRunCreate = prisma.testRun.create as unknown as Mock;
const projectMemberFindMany = prisma.projectMember.findMany as unknown as Mock;
const notificationCreateMany = prisma.notification.createMany as unknown as Mock;

const params = (code = "PRO") => ({ params: Promise.resolve({ code }) });
const req = (body: unknown) =>
  new Request("http://qmaster.test/api/projects/PRO/runs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
const json = async (response: Response) => response.json() as Promise<Record<string, unknown>>;

describe("project runs API route", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    projectFindFirst.mockResolvedValue({ id: "project-1", code: "PRO" });
    mockedGetServerSession.mockResolvedValue({ user: { id: "user-1", role: "USER" } });
    mockedRequireProjectRole.mockResolvedValue(true);
    testCaseFindMany.mockResolvedValue([{ id: "case-1" }]);
    testRunCreate.mockResolvedValue({ id: "run-1", title: "Regression", results: [] });
    projectMemberFindMany.mockResolvedValue([{ userId: "user-1" }, { userId: "user-2" }]);
    mockedLogAudit.mockResolvedValue(undefined);
  });

  it("returns 404 when the project does not exist", async () => {
    projectFindFirst.mockResolvedValue(null);

    const response = await POST(req({ caseIds: ["case-1"] }), params("MISSING"));

    expect(response.status).toBe(404);
    expect(await json(response)).toEqual({ error: "Project not found" });
  });

  it("requires authentication before creating runs", async () => {
    mockedGetServerSession.mockResolvedValue(null);

    const response = await POST(req({ caseIds: ["case-1"] }), params());

    expect(response.status).toBe(401);
    expect(await json(response)).toEqual({ error: "Unauthorized" });
  });

  it("requires editor/admin project access unless the user is a system admin", async () => {
    mockedRequireProjectRole.mockResolvedValue(false);

    const response = await POST(req({ caseIds: ["case-1"] }), params());

    expect(response.status).toBe(403);
    expect(await json(response)).toEqual({
      error: "Forbidden: You do not have permission to create test runs in this project",
    });
  });

  it("requires at least one selected test case", async () => {
    const response = await POST(req({ caseIds: [] }), params());

    expect(response.status).toBe(400);
    expect(await json(response)).toEqual({ error: "No test cases selected" });
    expect(testRunCreate).not.toHaveBeenCalled();
  });

  it("rejects case ids that do not belong to the project", async () => {
    testCaseFindMany.mockResolvedValue([{ id: "case-1" }]);

    const response = await POST(req({ caseIds: ["case-1", "case-2"] }), params());

    expect(response.status).toBe(400);
    expect(await json(response)).toEqual({
      error: "One or more test cases do not belong to this project",
    });
  });

  it("rejects missing selected test plans", async () => {
    testPlanFindFirst.mockResolvedValue(null);

    const response = await POST(req({ caseIds: ["case-1"], planId: "missing-plan" }), params());

    expect(response.status).toBe(400);
    expect(await json(response)).toEqual({ error: "Test plan not found" });
  });

  it("rejects selected cases outside the selected test plan", async () => {
    testCaseFindMany.mockResolvedValue([{ id: "case-1" }, { id: "case-2" }]);
    testPlanFindFirst.mockResolvedValue({
      id: "plan-1",
      testCases: [{ id: "case-1" }],
    });

    const response = await POST(req({ caseIds: ["case-1", "case-2"], planId: "plan-1" }), params());

    expect(response.status).toBe(400);
    expect(await json(response)).toEqual({
      error: "Selected cases must belong to the selected test plan",
    });
  });

  it("deduplicates case ids, creates run results, and writes audit log", async () => {
    testCaseFindMany.mockResolvedValue([{ id: "case-1" }, { id: "case-2" }]);

    const response = await POST(
      req({ title: "Regression", caseIds: ["case-1", "case-1", "case-2"] }),
      params(),
    );

    expect(response.status).toBe(201);
    expect(testRunCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          projectId: "project-1",
          authorId: "user-1",
          results: {
            create: [
              { caseId: "case-1", status: "IN_PROGRESS" },
              { caseId: "case-2", status: "IN_PROGRESS" },
            ],
          },
        }),
      }),
    );
    expect(mockedLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "project-1",
        userId: "user-1",
        entity: "TEST_RUN",
      }),
    );
    expect(notificationCreateMany).toHaveBeenCalledWith({
      data: [
        {
          recipientId: "user-2",
          actorId: "user-1",
          type: "RUN_STARTED",
          entityId: "run-1",
          link: "/projects/PRO/runs/run-1",
          title: "New Test Run Started: Regression",
          message: "2 test case(s) ready for execution in PRO",
        },
      ],
    });
  });
});
