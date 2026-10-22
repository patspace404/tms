import { NextResponse } from "next/server";
import { requireOpenRun } from "@/lib/run-open";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    let { runId, caseId, status, logs } = body;

    if (!runId || !caseId || !status) {
      return NextResponse.json(
        { error: "Missing required fields: runId, caseId, status" },
        { status: 400 },
      );
    }

    // Resolve short ID (e.g., QA-065c) to full UUID
    if (caseId.includes("-") && caseId.split("-")[1].length === 4) {
      const [projectCode, shortId] = caseId.split("-");

      const testCase = await prisma.testCase.findFirst({
        where: {
          id: { startsWith: shortId },
          project: { code: projectCode },
        },
      });

      if (testCase) {
        caseId = testCase.id;
      }
    }

    // A finished run keeps its numbers: a CI job reporting late must not
    // rewrite results somebody has already read.
    const open = await requireOpenRun(runId);
    if (!open.ok) {
      return NextResponse.json({ error: open.error }, { status: open.status });
    }

    // Find the exact result record matching this run and case
    const runResult = await prisma.testRunResult.findUnique({
      where: {
        runId_caseId: {
          runId,
          caseId,
        },
      },
      select: { id: true, executionHistory: true },
    });

    if (!runResult) {
      return NextResponse.json(
        { error: "TestRunResult not found for the given runId and caseId" },
        { status: 404 },
      );
    }

    const history = runResult.executionHistory
      ? (runResult.executionHistory as any[])
      : [];
    history.push({
      timestamp: new Date().toISOString(),
      status: status.toUpperCase(),
      logs: logs || "No logs provided by reporter",
    });

    await prisma.testRunResult.update({
      where: { id: runResult.id },
      data: {
        status: status.toUpperCase() as
          | "PASSED"
          | "FAILED"
          | "BLOCKED"
          | "SKIPPED",
        comment: logs,
        executionHistory: history,
      },
    });

    return NextResponse.json({
      success: true,
      message: "Result updated successfully",
    });
  } catch (error: any) {
    console.error("Webhook Reporter error:", error);
    return NextResponse.json(
      { error: error.message || "An unexpected error occurred" },
      { status: 500 },
    );
  }
}
