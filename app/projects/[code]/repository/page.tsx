import { SuiteTree } from "@/components/repository/SuiteTree";
import { ResizableSidebar } from "@/components/ui/ResizableSidebar";
import { RepositoryContent } from "@/components/repository/RepositoryContent";
import { SuiteExpansionProvider } from "@/components/providers/SuiteExpansionProvider";
import { SuiteSelectionProvider } from "@/components/providers/SuiteSelectionProvider";
import { prisma } from "@/lib/prisma";

export default async function RepositoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { code } = await params;
  const resolvedSearchParams = await searchParams;
  const activeSuiteId =
    typeof resolvedSearchParams.suite === "string"
      ? resolvedSearchParams.suite
      : null;

  let cases: any[] = [];
  let suites: any[] = [];
  try {
    const project = await prisma.project.findFirst({
      where: { code },
    });

    if (project) {
      suites = await prisma.testSuite.findMany({
        where: { projectId: project.id },
        orderBy: { position: "asc" },
      });

      cases = await prisma.testCase.findMany({
        where: { projectId: project.id },
        include: {
          tags: true,
          steps: true,
          author: { select: { name: true, email: true } },
          linkedIssues: { orderBy: { createdAt: "desc" } },
        },
        // Cases read in the order they are numbered: PKL-1, PKL-2, PKL-3.
        orderBy: { sequenceNumber: "asc" },
      });
    }
  } catch (err) {
    console.error("Failed to fetch cases:", err);
  }

  const allSuiteIds = suites.map((s) => s.id);

  return (
    <SuiteExpansionProvider initialExpandedIds={allSuiteIds} projectCode={code}>
      <SuiteSelectionProvider>
        <div className="flex min-h-0 flex-1 w-full bg-background overflow-hidden">
          <ResizableSidebar storageKey="qmaster.repository.sidebarWidth">
            <SuiteTree
              initialSuites={suites}
              cases={cases}
              projectCode={code}
            />
          </ResizableSidebar>
          <RepositoryContent
            projectCode={code}
            suites={suites}
            cases={cases}
            activeSuiteId={activeSuiteId}
            totalCases={cases.length}
            totalSuites={suites.length}
          />
        </div>
      </SuiteSelectionProvider>
    </SuiteExpansionProvider>
  );
}
