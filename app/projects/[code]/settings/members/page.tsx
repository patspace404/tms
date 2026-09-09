import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { MembersListClient } from "./MembersListClient";
import { requireProjectRole } from "@/lib/project-auth";
import { redirect } from "next/navigation";

export default async function ProjectMembersPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login");
  }

  // Only ADMINs can manage members
  const hasAccess = await requireProjectRole(code, (session.user as any).id, [
    "ADMIN",
  ]);
  if (!hasAccess && (session.user as any).role !== "ADMIN") {
    redirect(`/projects/${code}/repository`);
  }

  let members: any[] = [];
  try {
    const project = await prisma.project.findUnique({
      where: { code },
      include: {
        members: {
          include: {
            user: {
              include: { workspaceRole: { select: { title: true, permissions: true } } },
            },
          },
        },
      },
    });
    members = project?.members || [];
  } catch (error) {
    console.error("Failed to fetch project members", error);
  }

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <MembersListClient initialMembers={members} projectCode={code} />
    </div>
  );
}
