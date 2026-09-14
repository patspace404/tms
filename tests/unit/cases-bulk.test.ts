import { beforeEach, describe, expect, it, vi } from "vitest";

const projectMock = vi.hoisted(() => ({ findFirst: vi.fn() }));
const testCaseMock = vi.hoisted(() => ({
  deleteMany: vi.fn(),
  findMany: vi.fn(),
  create: vi.fn(),
}));
const softDeleteCasesMock = vi.hoisted(() => vi.fn());
const sessionMock = vi.hoisted(() => ({ getServerSession: vi.fn() }));
const requireProjectRoleMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: { project: projectMock, testCase: testCaseMock },
}));
vi.mock("next-auth/next", () => ({ getServerSession: sessionMock.getServerSession }));
vi.mock("@/lib/project-auth", () => ({ requireProjectRole: requireProjectRoleMock }));
// The route delegates the delete; soft-delete semantics are covered in
// tests/unit/soft-delete-cases.test.ts.
vi.mock("@/lib/case-delete", () => ({ softDeleteCases: softDeleteCasesMock }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { DELETE as bulkDelete } from "@/app/api/projects/[code]/cases/bulk/route";
import { POST as bulkClone } from "@/app/api/projects/[code]/cases/bulk-clone/route";

const routeParams = (code: string) => ({ params: Promise.resolve({ code }) });

function jsonRequest(method: string, url: string, body: unknown) {
  return new Request(url, {
    method,
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

const fakeProject = { id: "proj-fin", code: "FIN" };
const fakeUser = { id: "user-001", email: "admin@example.com", role: "ADMIN" };
const fakeCase = {
  id: "case-001", title: "Login", description: null, preconditions: null,
  postconditions: null, priority: "MEDIUM", severity: "NORMAL",
  automationStatus: "MANUAL", automationScript: null, customFields: null,
  suiteId: "suite-001", steps: [], tags: [],
};

// ─── Bulk Delete ──────────────────────────────────────────────────────────────

describe("DELETE /api/projects/[code]/cases/bulk", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    projectMock.findFirst.mockResolvedValue(fakeProject);
    requireProjectRoleMock.mockResolvedValue(true);
  });

  it("returns 401 when not authenticated", async () => {
    sessionMock.getServerSession.mockResolvedValue(null);

    const res = await bulkDelete(
      jsonRequest("DELETE", "http://localhost/api/projects/FIN/cases/bulk", { caseIds: ["c1"] }),
      routeParams("FIN")
    );

    expect(res.status).toBe(401);
    expect(testCaseMock.deleteMany).not.toHaveBeenCalled();
  });

  it("returns 403 when user lacks role", async () => {
    sessionMock.getServerSession.mockResolvedValue({ user: { ...fakeUser, role: "USER" } });
    requireProjectRoleMock.mockResolvedValue(false);

    const res = await bulkDelete(
      jsonRequest("DELETE", "http://localhost/api/projects/FIN/cases/bulk", { caseIds: ["c1"] }),
      routeParams("FIN")
    );

    expect(res.status).toBe(403);
  });

  it("returns 400 when caseIds is empty", async () => {
    sessionMock.getServerSession.mockResolvedValue({ user: fakeUser });

    const res = await bulkDelete(
      jsonRequest("DELETE", "http://localhost/api/projects/FIN/cases/bulk", { caseIds: [] }),
      routeParams("FIN")
    );

    expect(res.status).toBe(400);
    expect(testCaseMock.deleteMany).not.toHaveBeenCalled();
  });

  it("moves cases to the trash, scoped to project, and returns the count", async () => {
    sessionMock.getServerSession.mockResolvedValue({ user: fakeUser });
    softDeleteCasesMock.mockResolvedValue(2);

    const res = await bulkDelete(
      jsonRequest("DELETE", "http://localhost/api/projects/FIN/cases/bulk", { caseIds: ["c1", "c2"] }),
      routeParams("FIN")
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.count).toBe(2);
    // Scoped to the project, and moved to the trash rather than removed.
    expect(softDeleteCasesMock).toHaveBeenCalledWith("proj-fin", ["c1", "c2"], {
      userId: fakeUser.id,
    });
  });

  it("returns 404 when project not found", async () => {
    sessionMock.getServerSession.mockResolvedValue({ user: fakeUser });
    projectMock.findFirst.mockResolvedValue(null);

    const res = await bulkDelete(
      jsonRequest("DELETE", "http://localhost/api/projects/NOTEXIST/cases/bulk", { caseIds: ["c1"] }),
      routeParams("NOTEXIST")
    );

    expect(res.status).toBe(404);
  });
});

// ─── Bulk Clone ───────────────────────────────────────────────────────────────

describe("POST /api/projects/[code]/cases/bulk-clone", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    projectMock.findFirst.mockResolvedValue(fakeProject);
    requireProjectRoleMock.mockResolvedValue(true);
  });

  it("returns 401 when not authenticated", async () => {
    sessionMock.getServerSession.mockResolvedValue(null);

    const res = await bulkClone(
      jsonRequest("POST", "http://localhost/api/projects/FIN/cases/bulk-clone", { caseIds: ["c1"] }),
      routeParams("FIN")
    );

    expect(res.status).toBe(401);
  });

  it("returns 400 when caseIds is empty", async () => {
    sessionMock.getServerSession.mockResolvedValue({ user: fakeUser });

    const res = await bulkClone(
      jsonRequest("POST", "http://localhost/api/projects/FIN/cases/bulk-clone", { caseIds: [] }),
      routeParams("FIN")
    );

    expect(res.status).toBe(400);
  });

  it("returns 404 when no cases found in project", async () => {
    sessionMock.getServerSession.mockResolvedValue({ user: fakeUser });
    testCaseMock.findMany.mockResolvedValue([]);

    const res = await bulkClone(
      jsonRequest("POST", "http://localhost/api/projects/FIN/cases/bulk-clone", { caseIds: ["c1"] }),
      routeParams("FIN")
    );

    expect(res.status).toBe(404);
  });

  it("clones cases into destination suite", async () => {
    sessionMock.getServerSession.mockResolvedValue({ user: fakeUser });
    testCaseMock.findMany.mockResolvedValue([fakeCase]);
    testCaseMock.create.mockResolvedValue({ ...fakeCase, id: "case-clone-001", suiteId: "suite-002" });

    const res = await bulkClone(
      jsonRequest("POST", "http://localhost/api/projects/FIN/cases/bulk-clone", {
        caseIds: ["case-001"], destinationId: "suite-002"
      }),
      routeParams("FIN")
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.count).toBe(1);
    expect(testCaseMock.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ suiteId: "suite-002" }) })
    );
  });

  it("keeps original suiteId when destinationId is undefined", async () => {
    sessionMock.getServerSession.mockResolvedValue({ user: fakeUser });
    testCaseMock.findMany.mockResolvedValue([fakeCase]);
    testCaseMock.create.mockResolvedValue({ ...fakeCase, id: "case-clone-002" });

    await bulkClone(
      jsonRequest("POST", "http://localhost/api/projects/FIN/cases/bulk-clone", { caseIds: ["case-001"] }),
      routeParams("FIN")
    );

    expect(testCaseMock.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ suiteId: "suite-001" }) })
    );
  });
});
