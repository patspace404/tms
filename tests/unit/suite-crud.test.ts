import { beforeEach, describe, expect, it, vi } from "vitest";

const suiteMock = vi.hoisted(() => ({
  update: vi.fn(),
  delete: vi.fn(),
  findUnique: vi.fn(),
  findMany: vi.fn(),
}));

const testCaseMock = vi.hoisted(() => ({
  updateMany: vi.fn(),
  deleteMany: vi.fn(),
}));

const projectMock = vi.hoisted(() => ({
  findFirst: vi.fn(),
}));

const sessionMock = vi.hoisted(() => ({
  getServerSession: vi.fn(),
}));

const requireProjectRoleMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    testSuite: suiteMock,
    testCase: testCaseMock,
    project: projectMock,
  },
}));

vi.mock("next-auth/next", () => ({
  getServerSession: sessionMock.getServerSession,
}));

vi.mock("@/lib/project-auth", () => ({
  requireProjectRole: requireProjectRoleMock,
}));

vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { PATCH, DELETE } from "@/app/api/projects/[code]/suites/[suiteId]/route";

const routeParams = (code: string, suiteId: string) => ({
  params: Promise.resolve({ code, suiteId }),
});

function jsonRequest(method: string, code: string, suiteId: string, body?: unknown) {
  return new Request(`http://localhost/api/projects/${code}/suites/${suiteId}`, {
    method,
    body: body ? JSON.stringify(body) : undefined,
    headers: body ? { "content-type": "application/json" } : undefined,
  });
}

const fakeProject = { id: "proj-fin", code: "FIN" };
const fakeSuite = { id: "suite-001", parentId: null };
const fakeUser = { id: "user-001", email: "admin@example.com", role: "ADMIN" };

describe("PATCH /api/projects/[code]/suites/[suiteId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    projectMock.findFirst.mockResolvedValue(fakeProject);
    requireProjectRoleMock.mockResolvedValue(true);
  });

  it("returns 401 when user is not authenticated", async () => {
    sessionMock.getServerSession.mockResolvedValue(null);

    const res = await PATCH(
      jsonRequest("PATCH", "FIN", "suite-001", { title: "New Title" }),
      routeParams("FIN", "suite-001")
    );

    expect(res.status).toBe(401);
    expect(suiteMock.update).not.toHaveBeenCalled();
  });

  it("returns 403 when user lacks EDITOR or ADMIN role", async () => {
    sessionMock.getServerSession.mockResolvedValue({ user: { ...fakeUser, role: "USER" } });
    requireProjectRoleMock.mockResolvedValue(false);

    const res = await PATCH(
      jsonRequest("PATCH", "FIN", "suite-001", { title: "New Title" }),
      routeParams("FIN", "suite-001")
    );

    expect(res.status).toBe(403);
    expect(suiteMock.update).not.toHaveBeenCalled();
  });

  it("updates suite title and returns updated suite", async () => {
    sessionMock.getServerSession.mockResolvedValue({ user: fakeUser });
    suiteMock.update.mockResolvedValue({ id: "suite-001", title: "New Title", description: null });

    const res = await PATCH(
      jsonRequest("PATCH", "FIN", "suite-001", { title: "New Title" }),
      routeParams("FIN", "suite-001")
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.title).toBe("New Title");
    expect(suiteMock.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "suite-001" }, data: expect.objectContaining({ title: "New Title" }) })
    );
  });

  it("moves suite to a new parentId and updates sibling positions", async () => {
    sessionMock.getServerSession.mockResolvedValue({ user: fakeUser });
    suiteMock.findUnique.mockResolvedValue({ id: "suite-parent", parentId: null, projectId: "proj-fin" });
    suiteMock.update.mockResolvedValue({ id: "suite-001", parentId: "suite-parent", position: 1 });

    const res = await PATCH(
      jsonRequest("PATCH", "FIN", "suite-001", {
        parentId: "suite-parent",
        position: 1,
        orderedSiblingIds: ["suite-002", "suite-001"],
      }),
      routeParams("FIN", "suite-001")
    );

    expect(res.status).toBe(200);
    expect(suiteMock.update).toHaveBeenCalledWith({
      where: { id: "suite-001" },
      data: { parentId: "suite-parent", position: 1 },
    });
    expect(suiteMock.update).toHaveBeenCalledWith({
      where: { id: "suite-002" },
      data: { position: 0 },
    });
  });

  it("rejects moving a suite into itself or its descendant", async () => {
    sessionMock.getServerSession.mockResolvedValue({ user: fakeUser });

    const selfRes = await PATCH(
      jsonRequest("PATCH", "FIN", "suite-001", { parentId: "suite-001" }),
      routeParams("FIN", "suite-001")
    );
    expect(selfRes.status).toBe(400);

    suiteMock.findUnique
      .mockResolvedValueOnce({ id: "suite-grandchild", parentId: "suite-child", projectId: "proj-fin" })
      .mockResolvedValueOnce({ parentId: "suite-001" });

    const cycleRes = await PATCH(
      jsonRequest("PATCH", "FIN", "suite-001", { parentId: "suite-grandchild" }),
      routeParams("FIN", "suite-001")
    );
    expect(cycleRes.status).toBe(400);
    expect(suiteMock.update).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/projects/[code]/suites/[suiteId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    projectMock.findFirst.mockResolvedValue(fakeProject);
    requireProjectRoleMock.mockResolvedValue(true);
    suiteMock.findUnique.mockResolvedValue(fakeSuite);
    suiteMock.findMany.mockResolvedValue([]);
    suiteMock.delete.mockResolvedValue(fakeSuite);
  });

  it("returns 403 when user lacks role", async () => {
    sessionMock.getServerSession.mockResolvedValue({ user: { ...fakeUser, role: "USER" } });
    requireProjectRoleMock.mockResolvedValue(false);

    const res = await DELETE(
      jsonRequest("DELETE", "FIN", "suite-001"),
      routeParams("FIN", "suite-001")
    );

    expect(res.status).toBe(403);
    expect(suiteMock.delete).not.toHaveBeenCalled();
  });

  it("deletes suite and its cases when retainCases is false", async () => {
    sessionMock.getServerSession.mockResolvedValue({ user: fakeUser });

    const res = await DELETE(
      jsonRequest("DELETE", "FIN", "suite-001", { retainCases: false }),
      routeParams("FIN", "suite-001")
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(testCaseMock.deleteMany).toHaveBeenCalled();
    expect(suiteMock.delete).toHaveBeenCalledWith({ where: { id: "suite-001" } });
  });

  it("moves cases to parent suite when retainCases is true", async () => {
    sessionMock.getServerSession.mockResolvedValue({ user: fakeUser });

    await DELETE(
      jsonRequest("DELETE", "FIN", "suite-001", { retainCases: true }),
      routeParams("FIN", "suite-001")
    );

    expect(testCaseMock.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { suiteId: null } })
    );
    expect(testCaseMock.deleteMany).not.toHaveBeenCalled();
  });
});
