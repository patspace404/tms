import { beforeEach, describe, expect, it, vi } from "vitest";

const userMock = vi.hoisted(() => ({ findUnique: vi.fn() }));
const projectMock = vi.hoisted(() => ({ findUnique: vi.fn() }));
const projectMemberMock = vi.hoisted(() => ({ findUnique: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: { user: userMock, project: projectMock, projectMember: projectMemberMock },
}));

import { getProjectRole, requireProjectRole } from "@/lib/project-auth";

describe("getProjectRole", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns ADMIN when user is system ADMIN regardless of membership", async () => {
    userMock.findUnique.mockResolvedValue({ role: "ADMIN" });

    const role = await getProjectRole("FIN", "user-001");

    expect(role).toBe("ADMIN");
    expect(projectMock.findUnique).not.toHaveBeenCalled();
  });

  it("returns null when project does not exist", async () => {
    userMock.findUnique.mockResolvedValue({ role: "USER" });
    projectMock.findUnique.mockResolvedValue(null);

    const role = await getProjectRole("NOTEXIST", "user-001");

    expect(role).toBeNull();
  });

  it("returns member role when user is an explicit project member", async () => {
    userMock.findUnique.mockResolvedValue({ role: "USER" });
    projectMock.findUnique.mockResolvedValue({ id: "proj-fin" });
    projectMemberMock.findUnique.mockResolvedValue({ role: "VIEWER" });

    const role = await getProjectRole("FIN", "user-001");

    expect(role).toBe("VIEWER");
  });

  it("defaults to VIEWER when user is not an explicit project member", async () => {
    userMock.findUnique.mockResolvedValue({ role: "USER" });
    projectMock.findUnique.mockResolvedValue({ id: "proj-fin" });
    projectMemberMock.findUnique.mockResolvedValue(null);

    const role = await getProjectRole("FIN", "user-001");

    expect(role).toBe("VIEWER");
  });

  // The workspace "Administrator" and "Owner" roles carry permissions: ["all"].
  // Before this, that badge granted nothing inside a project: the holder
  // resolved to VIEWER and lost every create button with no explanation.
  it('returns ADMIN for a workspace role carrying "all", without membership', async () => {
    userMock.findUnique.mockResolvedValue({
      role: "USER",
      workspaceRole: { permissions: ["all"] },
    });

    const role = await getProjectRole("FIN", "user-001");

    expect(role).toBe("ADMIN");
    expect(projectMock.findUnique).not.toHaveBeenCalled();
  });

  it('returns ADMIN for a workspace role granted "prj-owner" explicitly', async () => {
    userMock.findUnique.mockResolvedValue({
      role: "USER",
      workspaceRole: { permissions: ["tc-repository", "prj-owner"] },
    });

    expect(await getProjectRole("FIN", "user-001")).toBe("ADMIN");
  });

  it("leaves a limited workspace role to its project membership", async () => {
    // "Member" holds tc-repository + tc-create — real permissions, but not
    // project ownership, so it must not be promoted.
    userMock.findUnique.mockResolvedValue({
      role: "USER",
      workspaceRole: { permissions: ["tc-repository", "tc-create"] },
    });
    projectMock.findUnique.mockResolvedValue({ id: "proj-fin" });
    projectMemberMock.findUnique.mockResolvedValue({ role: "EDITOR" });

    expect(await getProjectRole("FIN", "user-001")).toBe("EDITOR");
  });

  it("leaves a read-only workspace role as VIEWER", async () => {
    userMock.findUnique.mockResolvedValue({
      role: "USER",
      workspaceRole: { permissions: ["tc-repository", "tr-view", "ws-users-view"] },
    });
    projectMock.findUnique.mockResolvedValue({ id: "proj-fin" });
    projectMemberMock.findUnique.mockResolvedValue(null);

    expect(await getProjectRole("FIN", "user-001")).toBe("VIEWER");
  });
});

describe("requireProjectRole", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns true when user role is in allowed list", async () => {
    userMock.findUnique.mockResolvedValue({ role: "USER" });
    projectMock.findUnique.mockResolvedValue({ id: "proj-fin" });
    projectMemberMock.findUnique.mockResolvedValue({ role: "EDITOR" });

    const result = await requireProjectRole("FIN", "user-001", ["EDITOR", "ADMIN"]);

    expect(result).toBe(true);
  });

  it("returns false when user role is not in allowed list", async () => {
    userMock.findUnique.mockResolvedValue({ role: "USER" });
    projectMock.findUnique.mockResolvedValue({ id: "proj-fin" });
    projectMemberMock.findUnique.mockResolvedValue({ role: "VIEWER" });

    const result = await requireProjectRole("FIN", "user-001", ["EDITOR", "ADMIN"]);

    expect(result).toBe(false);
  });

  it("returns false when project does not exist", async () => {
    userMock.findUnique.mockResolvedValue({ role: "USER" });
    projectMock.findUnique.mockResolvedValue(null);

    const result = await requireProjectRole("NOTEXIST", "user-001", ["EDITOR"]);

    expect(result).toBe(false);
  });
});
