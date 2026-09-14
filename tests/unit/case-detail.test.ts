import { beforeEach, describe, expect, it, vi } from "vitest";

const projectMock = vi.hoisted(() => ({ findFirst: vi.fn() }));
const testCaseMock = vi.hoisted(() => ({ findUnique: vi.fn(), delete: vi.fn() }));
const sessionMock = vi.hoisted(() => ({ getServerSession: vi.fn() }));
const logAuditMock = vi.hoisted(() => vi.fn());
const softDeleteCasesMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({ prisma: { project: projectMock, testCase: testCaseMock } }));
vi.mock("next-auth/next", () => ({ getServerSession: sessionMock.getServerSession }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/audit-logger", () => ({ logAudit: logAuditMock }));
// The route delegates the delete itself; the soft-delete semantics and its
// audit entry are covered in tests/unit/soft-delete-cases.test.ts.
vi.mock("@/lib/case-delete", () => ({ softDeleteCases: softDeleteCasesMock }));

import { DELETE } from "@/app/api/projects/[code]/cases/[caseId]/route";

const routeParams = (code: string, caseId: string) => ({ params: Promise.resolve({ code, caseId }) });

describe("DELETE /api/projects/[code]/cases/[caseId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when there is no session", async () => {
    sessionMock.getServerSession.mockResolvedValue(null);

    const res = await DELETE(new Request("http://localhost"), routeParams("PROJ", "case-1"));
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 404 when project is not found", async () => {
    sessionMock.getServerSession.mockResolvedValue({ user: { id: "user-1" } });
    projectMock.findFirst.mockResolvedValue(null);

    const res = await DELETE(new Request("http://localhost"), routeParams("MISSING", "case-1"));
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toBe("Project not found");
  });

  it("returns 404 when test case is not found", async () => {
    sessionMock.getServerSession.mockResolvedValue({ user: { id: "user-1" } });
    projectMock.findFirst.mockResolvedValue({ id: "project-1", code: "PROJ" });
    testCaseMock.findUnique.mockResolvedValue(null);

    const res = await DELETE(new Request("http://localhost"), routeParams("PROJ", "case-missing"));
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toBe("Test case not found");
  });

  it("returns 404 when test case projectId does not match project", async () => {
    sessionMock.getServerSession.mockResolvedValue({ user: { id: "user-1" } });
    projectMock.findFirst.mockResolvedValue({ id: "project-1", code: "PROJ" });
    testCaseMock.findUnique.mockResolvedValue({ id: "case-1", projectId: "project-other", title: "Some Case" });

    const res = await DELETE(new Request("http://localhost"), routeParams("PROJ", "case-1"));
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toBe("Test case not found");
  });

  it("moves the test case to the trash and returns { success: true }", async () => {
    sessionMock.getServerSession.mockResolvedValue({ user: { id: "user-1" } });
    projectMock.findFirst.mockResolvedValue({ id: "project-1", code: "PROJ" });
    testCaseMock.findUnique.mockResolvedValue({ id: "case-1", projectId: "project-1", title: "Login Test" });
    softDeleteCasesMock.mockResolvedValue(1);

    const res = await DELETE(new Request("http://localhost"), routeParams("PROJ", "case-1"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ success: true });
    expect(softDeleteCasesMock).toHaveBeenCalledWith("project-1", ["case-1"], {
      userId: "user-1",
    });
    // The audit entry lives in softDeleteCases now, so that a delete from any
    // of the three routes records the same thing.
    expect(logAuditMock).not.toHaveBeenCalled();
  });

  it("returns 500 when delete throws an error", async () => {
    sessionMock.getServerSession.mockResolvedValue({ user: { id: "user-1" } });
    projectMock.findFirst.mockResolvedValue({ id: "project-1", code: "PROJ" });
    testCaseMock.findUnique.mockResolvedValue({ id: "case-1", projectId: "project-1", title: "Login Test" });
    softDeleteCasesMock.mockRejectedValue(new Error("DB connection lost"));

    const res = await DELETE(new Request("http://localhost"), routeParams("PROJ", "case-1"));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBe("DB connection lost");
  });
});
