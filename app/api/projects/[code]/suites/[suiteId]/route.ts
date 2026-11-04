import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { requireProjectRole } from "@/lib/project-auth";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ code: string; suiteId: string }> },
) {
  const { code: projectIdOrCode, suiteId } = await params;
  try {
    const project = await prisma.project.findFirst({
      where: {
        OR: [{ id: projectIdOrCode }, { code: projectIdOrCode }],
      },
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const hasAccess = await requireProjectRole(
      project.code,
      (session.user as any).id,
      ["EDITOR", "ADMIN"],
    );
    if (!hasAccess && (session.user as any).role !== "ADMIN") {
      return NextResponse.json(
        {
          error:
            "Forbidden: You do not have permission to edit suites in this project",
        },
        { status: 403 },
      );
    }

    const body = await req.json();
    const { title, description, parentId, position, orderedSiblingIds } = body;

    // Validate parentId if provided (can be string or null)
    if (parentId !== undefined && parentId !== null) {
      if (parentId === suiteId) {
        return NextResponse.json(
          { error: "Cannot move a suite into itself" },
          { status: 400 },
        );
      }

      const targetParent = await prisma.testSuite.findUnique({
        where: { id: parentId },
      });

      if (!targetParent || (targetParent.projectId && targetParent.projectId !== project.id)) {
        return NextResponse.json(
          { error: "Target parent suite not found" },
          { status: 400 },
        );
      }

      // Walk up ancestors of targetParent to prevent circular hierarchy
      let cursorId: string | null = targetParent.parentId;
      while (cursorId) {
        if (cursorId === suiteId) {
          return NextResponse.json(
            { error: "Cannot move a suite into one of its child suites" },
            { status: 400 },
          );
        }
        const ancestor = await prisma.testSuite.findUnique({
          where: { id: cursorId },
          select: { parentId: true },
        });
        cursorId = ancestor?.parentId ?? null;
      }
    }

    const updateData: Record<string, any> = {};
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (parentId !== undefined) updateData.parentId = parentId;
    if (typeof position === "number") updateData.position = position;

    const suite = await prisma.testSuite.update({
      where: { id: suiteId },
      data: updateData,
    });

    if (Array.isArray(orderedSiblingIds) && orderedSiblingIds.length > 0) {
      for (let idx = 0; idx < orderedSiblingIds.length; idx++) {
        const sibId = orderedSiblingIds[idx];
        if (typeof sibId === "string" && sibId !== suiteId) {
          await prisma.testSuite.update({
            where: { id: sibId },
            data: { position: idx },
          });
        }
      }
    }

    return NextResponse.json(suite);
  } catch (error) {
    console.error("Failed to update suite", error);
    return NextResponse.json(
      { error: "Failed to update suite" },
      { status: 400 },
    );
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ code: string; suiteId: string }> },
) {
  const { code: projectIdOrCode, suiteId } = await params;
  try {
    const project = await prisma.project.findFirst({
      where: {
        OR: [{ id: projectIdOrCode }, { code: projectIdOrCode }],
      },
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const hasAccess = await requireProjectRole(
      project.code,
      (session.user as any).id,
      ["EDITOR", "ADMIN"],
    );
    if (!hasAccess && (session.user as any).role !== "ADMIN") {
      return NextResponse.json(
        {
          error:
            "Forbidden: You do not have permission to delete suites in this project",
        },
        { status: 403 },
      );
    }

    const body = await req.json().catch(() => ({}));
    const retainCases = body.retainCases === true;

    // Fetch the suite to be deleted to know its parent
    const suiteToDelete = await prisma.testSuite.findUnique({
      where: { id: suiteId },
      select: { id: true, parentId: true },
    });

    if (!suiteToDelete) {
      return NextResponse.json({ error: "Suite not found" }, { status: 404 });
    }

    // Function to recursively get all descendant suite IDs
    async function getDescendantIds(parentId: string): Promise<string[]> {
      const children = await prisma.testSuite.findMany({
        where: { parentId },
        select: { id: true },
      });
      let ids = children.map((c) => c.id);
      for (const child of children) {
        const desc = await getDescendantIds(child.id);
        ids = ids.concat(desc);
      }
      return ids;
    }

    const allSuiteIds = [suiteId, ...(await getDescendantIds(suiteId))];

    if (retainCases) {
      // Move all cases in these suites to the parent suite (or unassigned if null)
      await prisma.testCase.updateMany({
        where: { suiteId: { in: allSuiteIds } },
        data: { suiteId: suiteToDelete.parentId },
      });
    } else {
      // Delete all cases in these suites
      await prisma.testCase.deleteMany({
        where: { suiteId: { in: allSuiteIds } },
      });
    }

    // Finally delete the suite itself (Prisma Cascade will delete the child suites folders)
    await prisma.testSuite.delete({
      where: { id: suiteId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete suite", error);
    return NextResponse.json(
      { error: "Failed to delete suite" },
      { status: 400 },
    );
  }
}
