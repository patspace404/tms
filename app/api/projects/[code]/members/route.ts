import { prisma } from "@/lib/prisma";
import { ProjectRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireProjectAccess } from "@/lib/project-route-auth";

const PROJECT_ROLE_VALUES = new Set<ProjectRole>([
  ProjectRole.VIEWER,
  ProjectRole.EDITOR,
  ProjectRole.ADMIN,
]);

function normalizeProjectRole(role: unknown): ProjectRole {
  return typeof role === "string" && PROJECT_ROLE_VALUES.has(role as ProjectRole)
    ? (role as ProjectRole)
    : ProjectRole.VIEWER;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  try {
    const project = await prisma.project.findUnique({
      where: { code },
      select: {
        id: true,
        members: {
          select: {
            role: true,
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                role: true,
                workspaceRole: { select: { title: true, permissions: true } },
              },
            },
          },
        },
      },
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const users = project.members
      .map((member) => ({
        ...member.user,
        projectRole: member.role,
      }))
      .sort((a, b) => {
        const roleOrder = { ADMIN: 0, EDITOR: 1, VIEWER: 2 };
        const roleDelta = roleOrder[a.projectRole] - roleOrder[b.projectRole];
        if (roleDelta !== 0) return roleDelta;
        return (a.name || a.email).localeCompare(b.name || b.email);
      });

    return NextResponse.json(users);
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Failed to fetch users" },
      { status: 500 },
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  try {
    const { code } = await params;
    const access = await requireProjectAccess(code, [ProjectRole.ADMIN]);
    if (access instanceof NextResponse) return access;

    const { userId, role } = await req.json();
    if (!userId)
      return NextResponse.json({ error: "userId required" }, { status: 400 });

    const project = await prisma.project.findUnique({ where: { code } });
    if (!project)
      return NextResponse.json({ error: "Project not found" }, { status: 404 });

    const memberRole = normalizeProjectRole(role);
    const member = await prisma.projectMember.upsert({
      where: { userId_projectId: { userId, projectId: project.id } },
      update: { role: memberRole },
      create: { userId, projectId: project.id, role: memberRole },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            workspaceRole: { select: { title: true, permissions: true } },
          },
        },
      },
    });

    return NextResponse.json(member, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Failed to add member" },
      { status: 500 },
    );
  }
}
