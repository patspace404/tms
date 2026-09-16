export const dynamic = "force-dynamic";

import Link from "next/link";
import { prisma } from "@/lib/prisma";
import {
  Search,
  Filter,
  LayoutList,
  Grid,
  MoreVertical,
  AlertTriangle,
  Check,
} from "lucide-react";

import { CreateProjectModal } from "@/components/projects/CreateProjectModal";
import { ProjectList } from "./ProjectList";

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ create?: string }>;
}) {
  const { create } = await searchParams;
  const isCreateModalOpen = create === "true";

  let projectsWithLatestRuns: any[] = [];
  let dbError: string | null = null;

  try {
    const projects = await prisma.project.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: {
          select: {
            testCases: {
              where: { deletedAt: null }
            },
            suites: true,
            testRuns: true,
            members: true,
            milestones: true,
          },
        },
        testRuns: {
          where: { status: "ACTIVE" },
          select: { id: true },
        },
      },
    });

    const automatedCasesGroup = await prisma.testCase.groupBy({
      by: ["projectId"],
      where: { automationStatus: "AUTOMATED", deletedAt: null },
      _count: { id: true },
    });
    const automatedCasesMap = new Map(
      automatedCasesGroup.map((g) => [g.projectId, g._count.id])
    );

    projectsWithLatestRuns = await Promise.all(
      projects.map(async (project) => {
        // Get latest run
        const latestRun = await prisma.testRun.findFirst({
          where: { projectId: project.id },
          orderBy: { createdAt: "desc" },
          select: {
            results: {
              select: { status: true }
            }
          }
        });

        let passRate: number | null = null;
        if (latestRun && latestRun.results.length > 0) {
          const total = latestRun.results.length;
          const passed = latestRun.results.filter(
            (r) => r.status === "PASSED",
          ).length;
          passRate = (passed / total) * 100;
        }

        // Automation calc
        const totalCases = project._count.testCases;
        const automatedCases = automatedCasesMap.get(project.id) || 0;
        const automationPercent =
          totalCases > 0 ? (automatedCases / totalCases) * 100 : 0;

        return {
          id: project.id,
          name: project.name,
          code: project.code,
          testCasesCount: project._count.testCases,
          suitesCount: project._count.suites,
          activeRunsCount: project.testRuns.length,
          testRunsCount: project._count.testRuns,
          milestonesCount: project._count.milestones,
          teamMembers: project._count.members,
          automationPercent,
          latestRunPassRate: passRate,
          isArchived: project.isArchived,
          updatedAt: project.updatedAt.toISOString(),
        };
      }),
    );
  } catch (error: any) {
    console.error("Database Error:", error);
    dbError = error.message || "Failed to fetch projects";
  }

  return (
    <main className="flex-1 w-full bg-background overflow-y-auto transition-colors">
      <div className="max-w-[1400px] mx-auto px-6 py-6">
        {dbError && (
          <div className="mb-6 p-4 bg-danger-soft border border-danger/25 rounded-lg text-danger">
            <h3 className="font-bold flex items-center">
              <AlertTriangle className="mr-2 h-5 w-5" />
              Database Error
            </h3>
            <p className="mt-2 text-sm">{dbError}</p>
          </div>
        )}

        {/* Projects List Client Component */}
        <ProjectList initialProjects={projectsWithLatestRuns} />
      </div>

      {/* Modal is rendered here but only visible when isCreateModalOpen is true */}
      {isCreateModalOpen && <CreateProjectModal />}
    </main>
  );
}
