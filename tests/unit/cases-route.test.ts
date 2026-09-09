import { beforeEach, describe, expect, it, vi } from "vitest";

const projectMock = vi.hoisted(() => ({ findFirst: vi.fn(), update: vi.fn() }));
const testCaseMock = vi.hoisted(() => ({ create: vi.fn(), findMany: vi.fn(), aggregate: vi.fn() }));
const transactionMock = vi.hoisted(() => vi.fn());
const sessionMock = vi.hoisted(() => ({ getServerSession: vi.fn() }));
const requireProjectRoleMock = vi.hoisted(() => vi.fn());
const logAuditMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: { project: projectMock, testCase: testCaseMock, $transaction: transactionMock },
}));
vi.mock("next-auth/next", () => ({ getServerSession: sessionMock.getServerSession }));
vi.mock("@/lib/project-auth", () => ({ requireProjectRole: requireProjectRoleMock }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/audit-logger", () => ({ logAudit: logAuditMock }));

import { POST, GET } from "@/app/api/projects/[code]/cases/route";

const routeParams = (code: string) => ({ params: Promise.resolve({ code }) });

const existingProject = { id: "proj-1", code: "FIN", name: "FIN Project", caseSequence: 0 };
const validBody = {
  title: "Login test",
  severity: "NORMAL",
  priority: "MEDIUM",
  automationStatus: "MANUAL",
  suiteId: "suite-001",
};
const authedSession = { user: { id: "user-1", role: "EDITOR" } };

describe("POST /api/projects/[code]/cases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    projectMock.findFirst.mockResolvedValue(existingProject);
    projectMock.update.mockResolvedValue({ caseSequence: 1 });
    // allocateSequenceNumber checks the highest row before trusting the counter
    testCaseMock.aggregate.mockResolvedValue({ _max: { sequenceNumber: null } });
    sessionMock.getServerSession.mockResolvedValue(authedSession);
    requireProjectRoleMock.mockResolvedValue(true);
    transactionMock.mockImplementation(async (cb) =>
      cb({ project: projectMock, testCase: testCaseMock }),
    );
    testCaseMock.create.mockResolvedValue({
      id: "case-1",
      sequenceNumber: 1,
      title: "Login test",
      steps: [],
      tags: [],
      attachments: [],
    });
    logAuditMock.mockResolvedValue(undefined);
  });

  it("returns 404 when project not found", async () => {
    projectMock.findFirst.mockResolvedValue(null);
    const req = new Request("http://localhost/api/projects/FIN/cases", {
      method: "POST",
      body: JSON.stringify(validBody),
    });
    const res = await POST(req, routeParams("FIN"));
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toMatch(/not found/i);
  });

  it("returns 401 when no session", async () => {
    sessionMock.getServerSession.mockResolvedValue(null);
    const req = new Request("http://localhost/api/projects/FIN/cases", {
      method: "POST",
      body: JSON.stringify(validBody),
    });
    const res = await POST(req, routeParams("FIN"));
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe("Unauthorized");
  });

  it("returns 403 when requireProjectRole returns false", async () => {
    requireProjectRoleMock.mockResolvedValue(false);
    // role must not be ADMIN for the 403 branch to trigger
    sessionMock.getServerSession.mockResolvedValue({ user: { id: "user-1", role: "VIEWER" } });
    const req = new Request("http://localhost/api/projects/FIN/cases", {
      method: "POST",
      body: JSON.stringify(validBody),
    });
    const res = await POST(req, routeParams("FIN"));
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toMatch(/Forbidden/);
  });

  it("returns 400 when zod validation fails (missing title)", async () => {
    const { title: _omitted, ...bodyWithoutTitle } = validBody;
    const req = new Request("http://localhost/api/projects/FIN/cases", {
      method: "POST",
      body: JSON.stringify(bodyWithoutTitle),
    });
    const res = await POST(req, routeParams("FIN"));
    expect(res.status).toBe(400);
  });

  it("returns 201 and creates case with sequenceNumber", async () => {
    const req = new Request("http://localhost/api/projects/FIN/cases", {
      method: "POST",
      body: JSON.stringify(validBody),
    });
    const res = await POST(req, routeParams("FIN"));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.sequenceNumber).toBe(1);
    expect(projectMock.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: existingProject.id },
        data: { caseSequence: { increment: 1 } },
      }),
    );
    expect(testCaseMock.create).toHaveBeenCalledOnce();
    expect(logAuditMock).toHaveBeenCalledOnce();
  });
});

describe("GET /api/projects/[code]/cases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    projectMock.findFirst.mockResolvedValue(existingProject);
    testCaseMock.findMany.mockResolvedValue([
      { id: "case-1", sequenceNumber: 1, automationStatus: "MANUAL", steps: [], tags: [], attachments: [] },
      { id: "case-2", sequenceNumber: 2, automationStatus: "AUTOMATED", steps: [], tags: [], attachments: [] },
    ]);
  });

  it("returns all cases when no automationStatus filter", async () => {
    const req = new Request("http://localhost/api/projects/FIN/cases");
    const res = await GET(req, routeParams("FIN"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveLength(2);
    expect(testCaseMock.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { projectId: existingProject.id },
      })
    );
  });

  it("filters by automationStatus when query param is present", async () => {
    testCaseMock.findMany.mockResolvedValue([
      { id: "case-2", sequenceNumber: 2, automationStatus: "AUTOMATED", steps: [], tags: [], attachments: [] },
    ]);
    const req = new Request("http://localhost/api/projects/FIN/cases?automationStatus=AUTOMATED");
    const res = await GET(req, routeParams("FIN"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveLength(1);
    expect(testCaseMock.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { projectId: existingProject.id, automationStatus: "AUTOMATED" },
      })
    );
  });

  it("returns 404 when project not found", async () => {
    projectMock.findFirst.mockResolvedValue(null);
    const req = new Request("http://localhost/api/projects/FIN/cases");
    const res = await GET(req, routeParams("FIN"));
    expect(res.status).toBe(404);
  });
});
