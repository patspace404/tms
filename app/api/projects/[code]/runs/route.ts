import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { requireProjectRole } from "@/lib/project-auth";
import { logAudit } from "@/lib/audit-logger";

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Failed to create run";
}

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

    const userId = (session.user as { id?: string }).id;
    const userRole = (session.user as { role?: string }).role;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const hasAccess = await requireProjectRole(
      project.code,
      userId,
      ["EDITOR", "ADMIN"],
    );
    if (!hasAccess && userRole !== "ADMIN") {
      return NextResponse.json(
        {
          error:
            "Forbidden: You do not have permission to create test runs in this project",
        },
        { status: 403 },
      );
    }

    const body = await req.json();
    const { title, description, caseIds, planId, environmentId, milestoneId } =
      body;

    if (!caseIds || !Array.isArray(caseIds) || caseIds.length === 0) {
      return NextResponse.json(
        { error: "No test cases selected" },
        { status: 400 },
      );
    }

    const uniqueCaseIds = Array.from(
      new Set(caseIds.filter((caseId): caseId is string => typeof caseId === "string")),
    );
    const validCases = await prisma.testCase.findMany({
      where: { id: { in: uniqueCaseIds }, projectId: project.id },
      select: { id: true },
    });

    if (validCases.length !== uniqueCaseIds.length) {
      return NextResponse.json(
        { error: "One or more test cases do not belong to this project" },
        { status: 400 },
      );
    }

    if (planId) {
      const plan = await prisma.testPlan.findFirst({
        where: { id: planId, projectId: project.id },
        select: {
          id: true,
          testCases: { select: { id: true } },
        },
      });

      if (!plan) {
        return NextResponse.json(
          { error: "Test plan not found" },
          { status: 400 },
        );
      }

      const planCaseIds = new Set(plan.testCases.map((testCase) => testCase.id));
      const outsidePlan = uniqueCaseIds.some((caseId) => !planCaseIds.has(caseId));
      if (outsidePlan) {
        return NextResponse.json(
          { error: "Selected cases must belong to the selected test plan" },
          { status: 400 },
        );
      }
    }

    const run = await prisma.testRun.create({
      data: {
        title,
        description,
        projectId: project.id,
        authorId: userId,
        planId: planId || undefined,
        environmentId: environmentId || undefined,
        milestoneId: milestoneId || undefined,
        results: {
          create: uniqueCaseIds.map((caseId) => ({
            caseId,
            status: "IN_PROGRESS",
          })),
        },
      },
      include: {
        results: true,
      },
    });

    await logAudit({
      projectId: project.id,
      userId,
      action: "CREATED",
      entity: "TEST_RUN",
      entityId: run.id,
      details: `Created Test Run: ${run.title}`,
    });

    if (prisma.projectMember?.findMany && prisma.notification?.createMany) {
      const members = await prisma.projectMember.findMany({
        where: { projectId: project.id },
        select: { userId: true },
      });
      const recipientIds = members
        .map((m) => m.userId)
        .filter((id) => id !== userId);

      if (recipientIds.length > 0) {
        await prisma.notification.createMany({
          data: recipientIds.map((recipientId) => ({
            recipientId,
            actorId: userId,
            type: "RUN_STARTED" as const,
            entityId: run.id,
            link: `/projects/${project.code}/runs/${run.id}`,
            title: `New Test Run Started: ${run.title}`,
            message: `${uniqueCaseIds.length} test case(s) ready for execution in ${project.code}`,
          })),
        });
      }
    }

    return NextResponse.json(run, { status: 201 });
  } catch (error) {
    console.error("Failed to create run", error);
    return NextResponse.json(
      { error: getErrorMessage(error) },
      { status: 500 },
    );
  }
}
