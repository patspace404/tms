import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { requireProjectRole } from "@/lib/project-auth";
import { softDeleteCases } from "@/lib/case-delete";

export async function DELETE(
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

    const userId = (session.user as any).id;
    const hasAccess = await requireProjectRole(
      project.code,
      (session.user as any).id,
      ["EDITOR", "ADMIN"],
    );
    if (!hasAccess && (session.user as any).role !== "ADMIN") {
      return NextResponse.json(
        {
          error:
            "Forbidden: You do not have permission to delete test cases in this project",
        },
        { status: 403 },
      );
    }

    const body = await req.json();
    const { caseIds } = body;

    if (!Array.isArray(caseIds) || caseIds.length === 0) {
      return NextResponse.json(
        { error: "No case IDs provided" },
        { status: 400 },
      );
    }

    // Moves to the trash rather than removing the rows, and records who did it.
    const count = await softDeleteCases(project.id, caseIds, { userId });

    return NextResponse.json({ success: true, count });
  } catch (error) {
    console.error("Failed to bulk delete test cases", error);
    return NextResponse.json(
      { error: "Failed to delete test cases" },
      { status: 400 },
    );
  }
}

const VALID_PRIORITY = ["NOT_SET", "HIGH", "MEDIUM", "LOW"];
const VALID_SEVERITY = [
  "NOT_SET",
  "BLOCKER",
  "CRITICAL",
  "MAJOR",
  "NORMAL",
  "MINOR",
  "TRIVIAL",
];
const VALID_AUTOMATION = ["MANUAL", "TO_BE_AUTOMATED", "AUTOMATED"];

// Bulk-edit common fields on selected cases
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code: projectIdOrCode } = await params;
  try {
    const project = await prisma.project.findFirst({
      where: { OR: [{ id: projectIdOrCode }, { code: projectIdOrCode }] },
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
            "Forbidden: You do not have permission to edit test cases in this project",
        },
        { status: 403 },
      );
    }

    const body = await req.json();
    const { caseIds, fields } = body;
    if (!Array.isArray(caseIds) || caseIds.length === 0) {
      return NextResponse.json(
        { error: "No case IDs provided" },
        { status: 400 },
      );
    }

    const data: Record<string, any> = {};
    if (fields?.priority && VALID_PRIORITY.includes(fields.priority))
      data.priority = fields.priority;
    if (fields?.severity && VALID_SEVERITY.includes(fields.severity))
      data.severity = fields.severity;
    if (
      fields?.automationStatus &&
      VALID_AUTOMATION.includes(fields.automationStatus)
    )
      data.automationStatus = fields.automationStatus;
    // suiteId: "" or null clears the suite; a string sets it
    if (fields && Object.prototype.hasOwnProperty.call(fields, "suiteId")) {
      data.suiteId = fields.suiteId || null;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { error: "No fields to update" },
        { status: 400 },
      );
    }

    await prisma.testCase.updateMany({
      where: { id: { in: caseIds }, projectId: project.id },
      data,
    });

    return NextResponse.json({ success: true, count: caseIds.length });
  } catch (error) {
    console.error("Failed to bulk edit test cases", error);
    return NextResponse.json(
      { error: "Failed to edit test cases" },
      { status: 400 },
    );
  }
}
