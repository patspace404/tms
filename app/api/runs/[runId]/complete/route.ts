import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRunAccess } from "@/lib/project-route-auth";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;

  try {
    const access = await requireRunAccess(runId);
    if (access instanceof NextResponse) return access;

    // 1. Fetch the run and its results to calculate stats
    const run = await prisma.testRun.findUnique({
      where: { id: runId },
      include: {
        results: true,
        project: {
          select: {
            code: true,
            name: true,
            msTeamsWebhookUrl: true,
          },
        },
      },
    });

    if (!run) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    // 2. Mark run as completed
    const updatedRun = await prisma.testRun.update({
      where: { id: runId },
      data: {
        status: "COMPLETED",
        // Note: You can add an endedAt field if it exists in schema
      },
    });

    // Calculate Stats
    const total = run.results.length;
    let passed = 0;
    let failed = 0;
    let skipped = 0;
    let blocked = 0;

    run.results.forEach((res) => {
      if (res.status === "PASSED") passed++;
      else if (res.status === "FAILED") failed++;
      else if (res.status === "SKIPPED") skipped++;
      else if (res.status === "BLOCKED") blocked++;
    });

    const passRate = total > 0 ? Math.round((passed / total) * 100) : 0;

    // 3. Send In-App Notifications to run author & assignees (excluding actor)
    if ( prisma.notification?.createMany ) {
      const actorId = access.userId;
      const recipientIds = new Set<string>();
      if (run.authorId && run.authorId !== actorId) {
        recipientIds.add(run.authorId);
      }
      run.results.forEach((res) => {
        if (res.assigneeId && res.assigneeId !== actorId) {
          recipientIds.add(res.assigneeId);
        }
      });

      if (recipientIds.size > 0) {
        await prisma.notification.createMany({
          data: Array.from(recipientIds).map((recipientId) => ({
            recipientId,
            actorId,
            type: "RUN_COMPLETED" as const,
            entityId: run.id,
            link: `/projects/${run.project.code}/runs/${run.id}`,
            title: `Test Run Completed: ${run.title}`,
            message: `Pass rate ${passRate}% (${passed}/${total} passed, ${failed} failed)`,
          })),
        });
      }
    }

    // 4. Send MS Teams Notification if configured
    if (run.project.msTeamsWebhookUrl) {
      const themeColor = failed > 0 ? "E81123" : "00CC6A"; // Red if any failed, Green if all passed/skipped

      // Determine base URL dynamically or use NEXTAUTH_URL
      const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
      // The user specifically requested linking to the public share report
      const reportUrl = `${baseUrl}/report/${run.id}`;

      const msTeamsPayload = {
        "@type": "MessageCard",
        "@context": "http://schema.org/extensions",
        themeColor: themeColor,
        summary: `Test Run Completed: ${run.title}`,
        sections: [
          {
            activityTitle: `**Test Run Completed: ${run.title}**`,
            activitySubtitle: `Project: ${run.project.name} (${run.project.code})`,
            facts: [
              { name: "Total Cases", value: total.toString() },
              { name: "Passed", value: passed.toString() },
              { name: "Failed", value: failed.toString() },
              { name: "Blocked", value: blocked.toString() },
              { name: "Skipped", value: skipped.toString() },
              { name: "Pass Rate", value: `${passRate}%` },
            ],
            markdown: true,
          },
        ],
        potentialAction: [
          {
            "@type": "OpenUri",
            name: "View Public Report",
            targets: [{ os: "default", uri: reportUrl }],
          },
        ],
      };

      try {
        await fetch(run.project.msTeamsWebhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(msTeamsPayload),
        });
        console.log(`MS Teams webhook sent for run ${run.id}`);
      } catch (webhookErr) {
        console.error("Failed to send MS Teams webhook:", webhookErr);
      }
    }

    return NextResponse.json({ success: true, run: updatedRun });
  } catch (error: unknown) {
    console.error("Complete Run Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to complete run" },
      { status: 500 },
    );
  }
}
