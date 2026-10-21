import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, unauthorized, forbidden } from "@/lib/api-auth";
import { canManageRoles } from "@/lib/permissions";

export async function GET() {
  try {
    // Ensure all system roles exist (upsert by title)
    const systemRoleDefs = [
      {
        title: "Owner",
        description: "Full access to all features and workspace management.",
        isDefault: false,
        permissions: ["all"],
      },
      {
        title: "Administrator",
        description: "Administrative access, similar to Owner.",
        isDefault: false,
        permissions: ["all"],
      },
      {
        title: "Member",
        description: "Standard access to core features.",
        isDefault: true,
        permissions: ["tc-repository", "tc-create", "tr-view", "db-view"],
      },
      {
        title: "Read-only",
        description:
          "Can view content but cannot create, edit, or delete anything.",
        isDefault: false,
        permissions: [
          "tc-repository",
          "tr-view",
          "db-view",
          "df-view",
          "env-view",
          "tp-view",
          "tg-view",
          "ws-users-view",
        ],
      },
    ];

    for (const def of systemRoleDefs) {
      const existing = await prisma.workspaceRole.findFirst({
        where: { title: def.title, isSystem: true },
      });
      if (!existing) {
        await prisma.workspaceRole.create({ data: { ...def, isSystem: true } });
      }
    }

    const roles = await prisma.workspaceRole.findMany({
      include: {
        _count: {
          select: { users: true },
        },
      },
      orderBy: [{ isSystem: "desc" }, { createdAt: "asc" }],
    });

    return NextResponse.json({ success: true, roles });
  } catch (error) {
    console.error("Failed to fetch roles:", error);
    return NextResponse.json(
      { error: "Failed to fetch roles" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  const actor = await getSessionUser();
  if (!actor) return unauthorized();
  if (!canManageRoles(actor)) return forbidden();
  try {
    const body = await req.json();
    const { title, description, isDefault, permissions } = body;

    if (!title) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }

    // If this role is set to default, unset the old default
    if (isDefault) {
      await prisma.workspaceRole.updateMany({
        where: { isDefault: true },
        data: { isDefault: false },
      });
    }

    const newRole = await prisma.workspaceRole.create({
      data: {
        title,
        description,
        isDefault: isDefault || false,
        permissions: permissions || [],
        isSystem: false, // User created roles are not system roles
      },
    });

    return NextResponse.json({ success: true, role: newRole }, { status: 201 });
  } catch (error) {
    console.error("Failed to create role:", error);
    return NextResponse.json(
      { error: "Failed to create role" },
      { status: 500 },
    );
  }
}
