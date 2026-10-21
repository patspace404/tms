import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const mapSeverity = (sev: string) => sev.toLowerCase();
const mapPriority = (pri: string) =>
  pri === "NOT_SET" ? "undefined" : pri.toLowerCase();
const mapAutomation = (auto: string) => {
  if (auto === "TO_BE_AUTOMATED") return "to-be-automated";
  if (auto === "AUTOMATED") return "is-automated";
  return "is-not-automated";
};

export async function GET(
  req: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  try {
    const { code } = await params;
    const project = await prisma.project.findUnique({
      where: { code },
      include: {
        suites: true,
        testCases: {
          include: {
            steps: {
              orderBy: { position: "asc" },
            },
          },
        },
      },
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const allSuites = project.suites;
    const allCases = project.testCases;

    const buildCases = (suiteId: string | null) => {
      return allCases
        .filter((c) => c.suiteId === suiteId)
        .map((tc) => ({
          id: tc.id,
          title: tc.title,
          description: tc.description,
          preconditions: tc.preconditions,
          postconditions: tc.postconditions,
          priority: mapPriority(tc.priority),
          severity: mapSeverity(tc.severity),
          type: "functional",
          behavior: "undefined",
          automation: mapAutomation(tc.automationStatus),
          status: "actual",
          is_flaky: "no",
          layer: "unknown",
          milestone: null,
          custom_fields: [],
          steps_type: "classic",
          steps: tc.steps.map((step) => ({
            position: step.position,
            action: step.action,
            expected_result: step.expectedResult || "",
            data: "",
            steps: [],
          })),
          tags: [],
          params: [],
          is_muted: "no",
        }));
    };

    const buildTree = (parentId: string | null): any[] => {
      const currentSuites = allSuites.filter((s) => s.parentId === parentId);
      return currentSuites.map((suite) => {
        return {
          id: suite.id,
          title: suite.title,
          description: suite.description,
          preconditions: null,
          suites: buildTree(suite.id),
          cases: buildCases(suite.id),
        };
      });
    };

    const rootSuites = buildTree(null);
    const rootCases = buildCases(null);

    // If there are test cases without a suite, put them in a default suite
    if (rootCases.length > 0) {
      rootSuites.push({
        id: "uncategorized",
        title: "Uncategorized",
        description: "Test cases without a suite",
        preconditions: null,
        suites: [],
        cases: rootCases,
      });
    }

    const payload = { suites: rootSuites };

    return new NextResponse(JSON.stringify(payload, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${project.code}_qase_export.json"`,
      },
    });
  } catch (error) {
    console.error("Failed to export qase:", error);
    return NextResponse.json({ error: "Export failed" }, { status: 500 });
  }
}
