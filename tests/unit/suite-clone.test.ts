import { beforeEach, describe, expect, it, vi } from "vitest";

const projectMock = vi.hoisted(() => ({ findFirst: vi.fn() }));
const testSuiteMock = vi.hoisted(() => ({ findUnique: vi.fn(), create: vi.fn() }));
const testCaseMock = vi.hoisted(() => ({ create: vi.fn() }));
const sessionMock = vi.hoisted(() => ({ getServerSession: vi.fn() }));
const requireProjectRoleMock = vi.hoisted(() => vi.fn());

// Each cloned case now takes a number of its own, inside a transaction.
const txMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: projectMock,
    testSuite: testSuiteMock,
    testCase: testCaseMock,
    $transaction: txMock,
  },
}));
vi.mock("@/lib/case-sequence", () => ({
  allocateSequenceNumber: vi.fn(async () => 7),
}));
vi.mock("next-auth/next", () => ({ getServerSession: sessionMock.getServerSession }));
vi.mock("@/lib/project-auth", () => ({ requireProjectRole: requireProjectRoleMock }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { POST } from "@/app/api/projects/[code]/suites/[suiteId]/clone/route";

const routeParams = (code: string, suiteId: string) => ({
  params: Promise.resolve({ code, suiteId }),
});

const makeRequest = (body: Record<string, unknown> = {}) =>
  new Request("http://localhost/api/projects/PROJ/suites/suite-001/clone", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const mockProject = { id: "project-1", code: "PROJ", name: "Test Project" };
const mockSession = { user: { id: "user-1", role: "EDITOR" } };
const mockSourceSuite = {
  id: "suite-001",
  title: "Auth",
  description: null,
  position: 0,
  testCases: [
    {
      id: "tc1",
      title: "Login",
      description: null,
      preconditions: null,
      postconditions: null,
      priority: "MEDIUM",
      severity: "NORMAL",
      automationStatus: "MANUAL",
      steps: [],
      tags: [],
    },
  ],
  children: [],
};
const mockCreatedSuite = { id: "new-suite", title: "Auth" };

beforeEach(() => {
  vi.clearAllMocks();
  txMock.mockImplementation(async (fn: any) =>
    fn({ testCase: testCaseMock, project: projectMock, $queryRaw: vi.fn() }),
  );
});

describe("POST /api/projects/[code]/suites/[suiteId]/clone", () => {
  it("returns 404 when project is not found", async () => {
    projectMock.findFirst.mockResolvedValue(null);

    const response = await POST(makeRequest(), routeParams("PROJ", "suite-001"));

    expect(response.status).toBe(404);
    const json = await response.json();
    expect(json.error).toBe("Project not found");
  });

  it("returns 401 when there is no session", async () => {
    projectMock.findFirst.mockResolvedValue(mockProject);
    sessionMock.getServerSession.mockResolvedValue(null);

    const response = await POST(makeRequest(), routeParams("PROJ", "suite-001"));

    expect(response.status).toBe(401);
    const json = await response.json();
    expect(json.error).toBe("Unauthorized");
  });

  it("returns 403 when requireProjectRole returns false and user is not ADMIN", async () => {
    projectMock.findFirst.mockResolvedValue(mockProject);
    sessionMock.getServerSession.mockResolvedValue({ user: { id: "user-1", role: "VIEWER" } });
    requireProjectRoleMock.mockResolvedValue(false);

    const response = await POST(makeRequest(), routeParams("PROJ", "suite-001"));

    expect(response.status).toBe(403);
    const json = await response.json();
    expect(json.error).toMatch(/Forbidden/);
  });

  it("returns 201 and clones suite with test cases when strategy is cases_and_suites", async () => {
    projectMock.findFirst.mockResolvedValue(mockProject);
    sessionMock.getServerSession.mockResolvedValue(mockSession);
    requireProjectRoleMock.mockResolvedValue(true);
    testSuiteMock.findUnique.mockResolvedValue(mockSourceSuite);
    testSuiteMock.create.mockResolvedValue(mockCreatedSuite);
    testCaseMock.create.mockResolvedValue({ id: "new-tc1", title: "Login" });

    const response = await POST(
      makeRequest({ destinationId: null, strategy: "cases_and_suites", withChildren: false }),
      routeParams("PROJ", "suite-001")
    );

    expect(response.status).toBe(201);
    const json = await response.json();
    expect(json.id).toBe("new-suite");
    expect(json.title).toBe("Auth");
    expect(testCaseMock.create).toHaveBeenCalledTimes(1);
    expect(testCaseMock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          title: "Login",
          suiteId: "new-suite",
          projectId: "project-1",
          authorId: "user-1",
        }),
      })
    );
  });

  it("does NOT clone test cases when strategy is not cases_and_suites", async () => {
    projectMock.findFirst.mockResolvedValue(mockProject);
    sessionMock.getServerSession.mockResolvedValue(mockSession);
    requireProjectRoleMock.mockResolvedValue(true);
    testSuiteMock.findUnique.mockResolvedValue(mockSourceSuite);
    testSuiteMock.create.mockResolvedValue(mockCreatedSuite);

    const response = await POST(
      makeRequest({ destinationId: null, strategy: "suites_only", withChildren: false }),
      routeParams("PROJ", "suite-001")
    );

    expect(response.status).toBe(201);
    expect(testCaseMock.create).not.toHaveBeenCalled();
  });

  it("returns 400 when suite is not found (testSuite.findUnique returns null)", async () => {
    projectMock.findFirst.mockResolvedValue(mockProject);
    sessionMock.getServerSession.mockResolvedValue(mockSession);
    requireProjectRoleMock.mockResolvedValue(true);
    testSuiteMock.findUnique.mockResolvedValue(null);

    const response = await POST(makeRequest(), routeParams("PROJ", "suite-001"));

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toBe("Failed to clone suite");
  });
});
