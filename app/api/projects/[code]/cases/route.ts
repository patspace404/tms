// (Phase 2) Backend API Routes
// # จัดการ Project และ Cases ภายใต้ Project
// app/api/projects/[code]/cases/route.ts
import { prisma } from "@/lib/prisma";
import { allocateSequenceNumber } from "@/lib/case-sequence";
import { NextResponse } from "next/server";
import { AutomationStatus, Prisma } from "@prisma/client";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { requireProjectRole } from "@/lib/project-auth";
import { z } from "zod";
import { logAudit } from "@/lib/audit-logger";

const testCaseSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  preconditions: z.string().optional(),
  postconditions: z.string().optional(),
  severity: z.enum([
    "NOT_SET",
    "BLOCKER",
    "CRITICAL",
    "MAJOR",
    "NORMAL",
    "MINOR",
    "TRIVIAL",
  ]),
  priority: z.enum(["NOT_SET", "HIGH", "MEDIUM", "LOW"]),
  automationStatus: z.enum(["MANUAL", "TO_BE_AUTOMATED", "AUTOMATED"]),
  suiteId: z.string().min(1),
  tags: z.array(z.string()).optional(),
  attachmentIds: z.array(z.string()).optional(),
  steps: z
    .array(
      z.object({
        action: z.string(),
        expectedResult: z.string().optional(),
        position: z.number(),
      }),
    )
    .optional(),
  customFields: z.record(z.string(), z.any()).optional(),
});

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
    const sessionUser = session.user as { id?: string; role?: string };
    if (!sessionUser.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const hasAccess = await requireProjectRole(
      project.code,
      sessionUser.id,
      ["EDITOR", "ADMIN"],
    );
    if (!hasAccess && sessionUser.role !== "ADMIN") {
      return NextResponse.json(
        {
          error:
            "Forbidden: You do not have permission to create test cases in this project",
        },
        { status: 403 },
      );
    }

    const projectId = project.id;
    const body = await req.json();
    const validatedData = testCaseSchema.parse(body);
    const { tags, attachmentIds, steps, customFields, ...rest } = validatedData;

    const testCase = await prisma.$transaction(async (tx) => {
      const sequenceNumber = await allocateSequenceNumber(tx, projectId);
      return tx.testCase.create({
        data: {
          ...rest,
          projectId: projectId,
          sequenceNumber,
          tags:
            tags && tags.length > 0
              ? {
                  connectOrCreate: tags.map((tagName) => ({
                    where: {
                      name_projectId: { name: tagName, projectId: projectId },
                    },
                    create: { name: tagName, projectId: projectId },
                  })),
                }
              : undefined,
          attachments:
            attachmentIds && attachmentIds.length > 0
              ? {
                  connect: attachmentIds.map((id) => ({ id })),
                }
              : undefined,
          customFields: customFields || undefined,
          steps: {
            create: steps || [],
          },
        },
        include: { steps: true, tags: true, attachments: true },
      });
    });

    await logAudit({
      projectId,
      userId: sessionUser.id,
      action: "CREATED",
      entity: "TEST_CASE",
      entityId: testCase.id,
      details: `Created Test Case: ${testCase.title}`,
    });

    return NextResponse.json(testCase, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Invalid request data or internal error" },
      { status: 400 },
    );
  }
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code: projectIdOrCode } = await params;

  const project = await prisma.project.findFirst({
    where: {
      OR: [{ id: projectIdOrCode }, { code: projectIdOrCode }],
    },
  });

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const url = new URL(req.url);
  const automationStatus = url.searchParams.get("automationStatus");

  const whereClause: Prisma.TestCaseWhereInput = {
    projectId: project.id,
  };
  if (
    automationStatus &&
    Object.values(AutomationStatus).includes(automationStatus as AutomationStatus)
  ) {
    whereClause.automationStatus = automationStatus as AutomationStatus;
  }

  const cases = await prisma.testCase.findMany({
    where: whereClause,
    include: { steps: true, tags: true, attachments: true },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(cases);
}
