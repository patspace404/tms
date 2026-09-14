// (Phase 2) Backend API Routes
// # CRUD สำหรับ Test Case รายตัว
// app/api/cases/[caseId]/route.ts
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { logAudit } from "@/lib/audit-logger";
import { softDeleteCases } from "@/lib/case-delete";
import { requireProjectRole } from "@/lib/project-auth";

// Scalar fields whose changes we record in the case change history.
const TRACKED_FIELDS = [
  "title",
  "description",
  "preconditions",
  "postconditions",
  "priority",
  "severity",
  "automationStatus",
  "suiteId",
  "requirementText",
] as const;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ caseId: string }> },
) {
  const { caseId } = await params;
  const testCase = await prisma.testCase.findUnique({
    where: { id: caseId },
    include: {
      steps: { orderBy: { position: "asc" } },
      author: { select: { name: true, email: true } },
    },
  });
  if (!testCase)
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(testCase);
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ caseId: string }> },
) {
  const { caseId } = await params;
  try {
    const body = await req.json();
    // For steps update, we delete existing and recreate to maintain order easily
    const { steps, ...caseData } = body;

    const session = await getServerSession(authOptions);
    const actorId = session?.user ? (session.user as any).id : null;

    const existingCase = await prisma.testCase.findUnique({
      where: { id: caseId }
    });

    const updatedCase = await prisma.$transaction(async (tx) => {
      const updated = await tx.testCase.update({
        where: { id: caseId },
        data: {
          ...caseData,
          steps: steps
            ? {
                deleteMany: {},
                create: steps.map((s: any) => ({
                  action: s.action,
                  expectedResult: s.expectedResult,
                  position: s.position,
                })),
              }
            : undefined,
        },
        include: { steps: true, author: true },
      });

      // Notification Logic: If authorId (assignee) changed
      if (
        caseData.authorId && 
        existingCase && 
        existingCase.authorId !== caseData.authorId &&
        caseData.authorId !== actorId // Don't notify if assigning to self
      ) {
        await tx.notification.create({
          data: {
            recipientId: caseData.authorId,
            actorId: actorId,
            type: "ASSIGNMENT",
            entityId: updated.id,
            title: "Assigned Test Case",
            message: `You have been assigned to test case: ${updated.title}`,
          }
        });
      }

      return updated;
    });

    // Record a field-level change history entry (best-effort, never blocks).
    if (existingCase) {
      const changes: Record<string, { from: any; to: any }> = {};
      for (const f of TRACKED_FIELDS) {
        if (f in caseData) {
          const before = (existingCase as any)[f] ?? null;
          const after = (caseData as any)[f] ?? null;
          if (before !== after) changes[f] = { from: before, to: after };
        }
      }
      if (steps) changes["steps"] = { from: "edited", to: "edited" };
      if (Object.keys(changes).length > 0) {
        await logAudit({
          projectId: existingCase.projectId,
          userId: actorId || "system",
          action: "UPDATED",
          entity: "TEST_CASE",
          entityId: caseId,
          details: { fields: Object.keys(changes), changes },
        });
      }
    }

    return NextResponse.json(updatedCase);
  } catch (error) {
    console.error("Test Case Update Error:", error);
    return NextResponse.json({ error: "Update failed" }, { status: 400 });
  }
}

/**
 * Move a case to the trash.
 *
 * This route previously deleted the row outright with no authorisation at all
 * — any signed-in account could destroy a case in any project, and nothing was
 * written down. It now checks the caller's role on the case's own project and
 * records who did it.
 */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ caseId: string }> },
) {
  const { caseId } = await params;

  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = (session.user as { id: string }).id;

  const testCase = await prisma.testCase.findUnique({
    where: { id: caseId },
    select: { projectId: true, project: { select: { code: true } } },
  });
  if (!testCase) {
    return NextResponse.json({ error: "Test case not found" }, { status: 404 });
  }

  const allowed = await requireProjectRole(testCase.project.code, userId, [
    "EDITOR",
    "ADMIN",
  ]);
  if (!allowed && (session.user as { role?: string }).role !== "ADMIN") {
    return NextResponse.json(
      { error: "Forbidden: you cannot delete cases in this project" },
      { status: 403 },
    );
  }

  await softDeleteCases(testCase.projectId, [caseId], { userId });
  return new NextResponse(null, { status: 204 });
}
