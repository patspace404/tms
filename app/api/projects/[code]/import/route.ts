import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { requireProjectRole } from "@/lib/project-auth";
import { allocateSequenceNumber } from "@/lib/case-sequence";
import { logAudit } from "@/lib/audit-logger";

const parseSeverity = (sev: string | undefined) => {
  if (!sev) return "NORMAL";
  const upper = sev.toUpperCase();
  if (
    [
      "NOT_SET",
      "BLOCKER",
      "CRITICAL",
      "MAJOR",
      "NORMAL",
      "MINOR",
      "TRIVIAL",
    ].includes(upper)
  )
    return upper;
  return "NORMAL";
};

const parsePriority = (pri: string | undefined) => {
  if (!pri || pri === "undefined") return "NOT_SET";
  const upper = pri.toUpperCase();
  if (["NOT_SET", "HIGH", "MEDIUM", "LOW"].includes(upper)) return upper;
  return "NOT_SET";
};

const parseAutomation = (auto: string | undefined) => {
  if (auto === "to-be-automated") return "TO_BE_AUTOMATED";
  if (auto === "is-automated") return "AUTOMATED";
  return "MANUAL";
};

export async function POST(
  req: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  try {
    const { code } = await params;
    const reqBody = await req.json();

    const body = reqBody.payload || reqBody;
    const rootParentId = reqBody.parentId || null;
    const replaceMatching = reqBody.replaceMatching || false;

    if (!body || !Array.isArray(body.suites)) {
      return NextResponse.json(
        { error: "Invalid Qase JSON format. Expected { suites: [...] }" },
        { status: 400 },
      );
    }

    const project = await prisma.project.findUnique({ where: { code } });
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // middleware.ts already requires a session on /api/projects/*, but this
    // route checked nothing beyond that: any signed-in account could import
    // suites and cases into any project, including one it holds no role on.
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = (session.user as any).id;
    const allowed = await requireProjectRole(project.code, userId, ["EDITOR", "ADMIN"]);
    if (!allowed && (session.user as any).role !== "ADMIN") {
      return NextResponse.json(
        { error: "Forbidden: you cannot import test cases into this project" },
        { status: 403 },
      );
    }

    let imported = 0;
    let suitesMade = 0;

    await prisma.$transaction(
      async (tx) => {
        const processSuites = async (
          suites: any[],
          parentId: string | null,
        ) => {
          for (const suite of suites) {
            let newSuiteId;

            const newSuite = await tx.testSuite.create({
              data: {
                title: suite.title,
                description: suite.description || null,
                projectId: project.id,
                parentId: parentId,
              },
            });
            newSuiteId = newSuite.id;
            suitesMade++;

            if (suite.cases && Array.isArray(suite.cases)) {
              for (const tc of suite.cases) {
                const sequenceNumber = await allocateSequenceNumber(
                  tx as any,
                  project.id,
                );
                imported++;
                await tx.testCase.create({
                  data: {
                    sequenceNumber,
                    title: tc.title,
                    description: tc.description || null,
                    preconditions: tc.preconditions || null,
                    postconditions: tc.postconditions || null,
                    severity: parseSeverity(tc.severity) as any,
                    priority: parsePriority(tc.priority) as any,
                    automationStatus: parseAutomation(tc.automation) as any,
                    projectId: project.id,
                    suiteId: newSuiteId,
                    steps: {
                      create: (tc.steps || []).map(
                        (step: any, idx: number) => ({
                          position: step.position || idx + 1,
                          action: step.action || "",
                          expectedResult: step.expected_result || null,
                        }),
                      ),
                    },
                  },
                });
              }
            }

            if (suite.suites && Array.isArray(suite.suites)) {
              await processSuites(suite.suites, newSuiteId);
            }
          }
        };

        await processSuites(body.suites, rootParentId);
      },
      {
        maxWait: 15000,
        timeout: 120000,
      },
    );

    await logAudit({
      projectId: project.id,
      userId,
      action: "CREATED",
      entity: "TEST_CASE",
      details: `Imported ${imported} test case(s) in ${suitesMade} suite(s) from a JSON file`,
    });

    return NextResponse.json({ success: true, cases: imported, suites: suitesMade });
  } catch (error: any) {
    console.error("Failed to import qase:", error);
    return NextResponse.json(
      { error: error.message || "Import failed" },
      { status: 500 },
    );
  }
}
