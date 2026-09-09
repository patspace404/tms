import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { requireProjectRole } from "@/lib/project-auth";
import { logAudit } from "@/lib/audit-logger";
import { GET, POST } from "@/app/api/projects/[code]/cases/route";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    testCase: {
      findMany: vi.fn(),
    },
    $transaction: vi.fn(),
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
const projectCreate = prisma.project.create as unknown as Mock;
const testCaseFindMany = prisma.testCase.findMany as unknown as Mock;
const prismaTransaction = prisma.$transaction as unknown as Mock;

const params = (code = "PRO") => ({ params: Promise.resolve({ code }) });
const validCaseBody = {
  title: "Checkout applies promo",
  description: "Promo flow",
  severity: "NORMAL",
  priority: "MEDIUM",
  automationStatus: "MANUAL",
  suiteId: "suite-1",
  tags: ["checkout", "promo"],
  steps: [{ action: "Open cart", expectedResult: "Cart visible", position: 1 }],
};
const req = (body: unknown) =>
  new Request("http://qmaster.test/api/projects/PRO/cases", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
const json = async (response: Response) => response.json() as Promise<Record<string, unknown>>;

describe("project cases API route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    projectFindFirst.mockResolvedValue({ id: "project-1", code: "PRO", caseSequence: 7 });
    projectCreate.mockResolvedValue({ id: "project-1", code: "PRO", caseSequence: 0 });
    mockedGetServerSession.mockResolvedValue({ user: { id: "user-1", role: "USER" } });
    mockedRequireProjectRole.mockResolvedValue(true);
    mockedLogAudit.mockResolvedValue(undefined);
    prismaTransaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        project: {
          update: vi.fn().mockResolvedValue({ caseSequence: 8 }),
        },
        testCase: {
          create: vi.fn().mockResolvedValue({
            id: "case-1",
            title: validCaseBody.title,
            sequenceNumber: 8,
          }),
          // allocateSequenceNumber checks the highest row before trusting the counter
          aggregate: vi.fn().mockResolvedValue({ _max: { sequenceNumber: 7 } }),
        },
      }),
    );
  });

  it("requires authentication before creating cases", async () => {
    mockedGetServerSession.mockResolvedValue(null);

    const response = await POST(req(validCaseBody), params());

    expect(response.status).toBe(401);
    expect(await json(response)).toEqual({ error: "Unauthorized" });
    expect(prismaTransaction).not.toHaveBeenCalled();
  });

  it("requires editor/admin project access unless the user is a system admin", async () => {
    mockedRequireProjectRole.mockResolvedValue(false);

    const response = await POST(req(validCaseBody), params());

    expect(response.status).toBe(403);
    expect(await json(response)).toEqual({
      error: "Forbidden: You do not have permission to create test cases in this project",
    });
  });

  it("rejects invalid request payloads", async () => {
    const response = await POST(req({ ...validCaseBody, title: "" }), params());

    expect(response.status).toBe(400);
    expect(await json(response)).toEqual({ error: "Invalid request data or internal error" });
    expect(prismaTransaction).not.toHaveBeenCalled();
  });

  it("creates a case in a transaction and writes an audit log", async () => {
    const response = await POST(req(validCaseBody), params());

    expect(response.status).toBe(201);
    expect(await json(response)).toMatchObject({ id: "case-1", sequenceNumber: 8 });
    expect(prismaTransaction).toHaveBeenCalledTimes(1);
    expect(mockedLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "project-1",
        userId: "user-1",
        entity: "TEST_CASE",
        entityId: "case-1",
      }),
    );
  });

  it("returns 404 instead of auto-creating a missing project", async () => {
    projectFindFirst.mockResolvedValue(null);

    const response = await POST(req(validCaseBody), params("NEW"));

    expect(response.status).toBe(404);
    expect(await json(response)).toEqual({ error: "Project not found" });
    expect(projectCreate).not.toHaveBeenCalled();
  });

  it("filters GET results by automation status", async () => {
    testCaseFindMany.mockResolvedValue([{ id: "case-1", automationStatus: "AUTOMATED" }]);

    const response = await GET(
      new Request("http://qmaster.test/api/projects/PRO/cases?automationStatus=AUTOMATED"),
      params(),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([{ id: "case-1", automationStatus: "AUTOMATED" }]);
    expect(testCaseFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { projectId: "project-1", automationStatus: "AUTOMATED" },
      }),
    );
  });
});
