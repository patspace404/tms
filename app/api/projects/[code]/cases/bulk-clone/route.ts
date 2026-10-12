import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { requireProjectRole } from "@/lib/project-auth";
import { allocateSequenceNumber } from "@/lib/case-sequence";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code: projectIdOrCode } = await params;
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
            "Forbidden: You do not have permission to clone test cases in this project",
        },
        { status: 403 },
      );
    }

    const body = await req.json();
    const { caseIds, destinationId } = body;

    if (!Array.isArray(caseIds) || caseIds.length === 0) {
      return NextResponse.json(
        { error: "No case IDs provided" },
        { status: 400 },
      );
    }

    // Fetch original cases
    const originalCases = await prisma.testCase.findMany({
      where: {
        id: { in: caseIds },
        projectId: project.id,
      },
      include: {
        steps: true,
        tags: true,
      },
    });

    if (originalCases.length === 0) {
      return NextResponse.json(
        { error: "No cases found to clone" },
        { status: 404 },
      );
    }

    // Duplicate logic
    //
    // Each clone needs its own case number. Leaving it out meant every clone
    // was created with the column default of 0, so the second one in a project
    // collided on @@unique([projectId, sequenceNumber]) and the whole clone
    // failed with "Failed to clone test cases" — nothing in the message said
    // which part went wrong.
    let clonedCount = 0;
    for (const originalCase of originalCases) {
      await prisma.$transaction(async (tx) => {
        const sequenceNumber = await allocateSequenceNumber(tx, project.id);
        await tx.testCase.create({
          data: {
            sequenceNumber,
            title: originalCase.title,
            description: originalCase.description,
            preconditions: originalCase.preconditions,
            postconditions: originalCase.postconditions,
            priority: originalCase.priority,
            severity: originalCase.severity,
            automationStatus: originalCase.automationStatus,
            automationScript: originalCase.automationScript,
            customFields: originalCase.customFields || undefined,
            projectId: project.id,
            suiteId:
              destinationId !== undefined
                ? destinationId
                : originalCase.suiteId,
            authorId: (session.user as any).id,
            tags: {
              connect: originalCase.tags.map((tag) => ({ id: tag.id })),
            },
            steps: {
              create: originalCase.steps.map((step) => ({
                action: step.action,
                expectedResult: step.expectedResult,
                sharedStepId: step.sharedStepId,
                position: step.position,
              })),
            },
          },
        });
      });
      clonedCount++;
    }

    return NextResponse.json({ success: true, count: clonedCount });
  } catch (error) {
    console.error("Failed to bulk clone test cases", error);
    return NextResponse.json(
      { error: "Failed to clone test cases" },
      { status: 400 },
    );
  }
}
