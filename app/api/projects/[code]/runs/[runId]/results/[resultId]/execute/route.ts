import { NextResponse } from "next/server";
import { requireOpenRun } from "@/lib/run-open";
import { prisma } from "@/lib/prisma";
import fs from "fs";
import path from "path";
import os from "os";
import { exec } from "child_process";
import util from "util";

const execPromise = util.promisify(exec);

export async function POST(
  req: Request,
  {
    params,
  }: { params: Promise<{ code: string; runId: string; resultId: string }> },
) {
  const { code, runId, resultId } = await params;
  try {
    const open = await requireOpenRun(runId);
    if (!open.ok) {
      return NextResponse.json({ error: open.error }, { status: open.status });
    }

    const body = await req.json();
    const { script } = body;

    if (!script) {
      return NextResponse.json(
        { error: "Script is required" },
        { status: 400 },
      );
    }

    if (process.env.NEXT_PUBLIC_IS_DEMO === "true") {
      return NextResponse.json({
        success: false,
        error: "Playwright execution is disabled in the Demo version.",
        passed: false,
        logs: "Execution skipped (Demo Mode)",
      });
    }

    // Wrap the script in a test block if it isn't already
    const isWrapped = script.includes("test(");
    const finalScript = isWrapped
      ? script
      : `import { test, expect } from '@playwright/test';\n\ntest('Automated Test Case', async ({ page }) => {\n${script}\n});`;

    // Write to a temporary file
    const tmpDir = os.tmpdir();
    const filename = `test-${Date.now()}-${Math.floor(Math.random() * 1000)}.spec.ts`;
    const filepath = path.join(tmpDir, filename);

    fs.writeFileSync(filepath, finalScript, "utf8");

    // Execute Playwright
    // Inside the Docker container, we can run npx playwright test
    let stdout = "";
    let stderr = "";
    let passed = false;

    try {
      const result = await execPromise(
        `playwright test ${filename} --browser=chromium --reporter=list --output=/tmp/test-results`,
        {
          cwd: tmpDir,
          env: {
            ...process.env,
            PLAYWRIGHT_BROWSERS_PATH: "/ms-playwright",
            HOME: "/home/nextjs",
            NODE_PATH: "/usr/local/lib/node_modules",
          },
        },
      );
      stdout = result.stdout;
      stderr = result.stderr;
      passed = true;
    } catch (err: any) {
      // execPromise throws if exit code is not 0
      stdout = err.stdout || "";
      stderr = err.stderr || err.message || "";
      passed = false;
    }

    // Clean up
    try {
      fs.unlinkSync(filepath);
    } catch (e) {
      console.error("Failed to delete tmp file:", e);
    }

    // Update the database result
    const logs = `--- PLAYWRIGHT EXECUTION LOGS ---\n\nSTDOUT:\n${stdout}\n\nSTDERR:\n${stderr}`;

    const existingResult = await prisma.testRunResult.findUnique({
      where: { id: resultId },
      select: { executionHistory: true },
    });

    const history = existingResult?.executionHistory
      ? (existingResult.executionHistory as any[])
      : [];
    history.push({
      timestamp: new Date().toISOString(),
      status: passed ? "PASSED" : "FAILED",
      logs: logs,
    });

    await prisma.testRunResult.update({
      where: { id: resultId },
      data: {
        status: passed ? "PASSED" : "FAILED",
        timeSpent: 0, // We could parse time but keep it simple
        comment: logs,
        executionHistory: history,
      },
    });

    return NextResponse.json({
      success: true,
      passed,
      logs,
    });
  } catch (error: any) {
    console.error("Script execution failed:", error);
    return NextResponse.json(
      { error: error.message || "Failed to execute script" },
      { status: 500 },
    );
  }
}
