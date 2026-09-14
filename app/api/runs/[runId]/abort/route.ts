import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit-logger";
import { requireRunAccess } from "@/lib/project-route-auth";

/**
 * Abandon a run without finishing it.
 *
 * The board could already group and filter by Aborted, and the public API
 * could set it, but nothing inside the app could — so runs people had given up
 * on were renamed "Cancelled …" and left sitting in Active.
 *
 * Mirrors ./reopen and ./complete rather than taking a status parameter, so the
 * three lifecycle moves read the same way from the client.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;
  try {
    const access = await requireRunAccess(runId);
    if (access instanceof NextResponse) return access;

    const run = await prisma.testRun.findUnique({
      where: { id: runId },
      select: { id: true, title: true, status: true, projectId: true },
    });

    if (!run) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    if (run.status === "ABORTED") {
      return NextResponse.json(
        { error: "Run is already aborted" },
        { status: 400 },
      );
    }

    const updated = await prisma.testRun.update({
      where: { id: runId },
      data: { status: "ABORTED" },
    });

    await logAudit({
      projectId: run.projectId,
      userId: access.userId,
      action: "UPDATED",
      entity: "TEST_RUN",
      entityId: run.id,
      details: `Aborted Test Run: ${run.title}`,
    });

    return NextResponse.json({ success: true, run: updated });
  } catch (error: unknown) {
    console.error("Abort Run Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to abort run" },
      { status: 500 },
    );
  }
}
