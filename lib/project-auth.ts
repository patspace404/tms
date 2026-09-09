import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/permissions";
import { ProjectRole } from "@prisma/client";

export async function getProjectRole(projectCode: string, userId: string): Promise<ProjectRole | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, workspaceRole: { select: { permissions: true } } },
  });

  if (user?.role === 'ADMIN') {
    return 'ADMIN';
  }

  // A workspace role carrying "all" — Administrator and Owner — means all,
  // inside projects too. Without this the badge on Workspace → Users grants
  // nothing here: the person is shown as "Administrator", silently resolves to
  // VIEWER, and loses every create/edit button with no explanation. Roles that
  // list specific permissions (Member, Read-only) are unaffected and still fall
  // through to their project membership below.
  if (hasPermission(user, 'prj-owner')) {
    return 'ADMIN';
  }

  const project = await prisma.project.findUnique({
    where: { code: projectCode },
    select: { id: true }
  });

  if (!project) return null;

  const member = await prisma.projectMember.findUnique({
    where: {
      userId_projectId: {
        userId,
        projectId: project.id
      }
    }
  });

  // Non-members get read-only (VIEWER) access. Editing/admin actions require
  // explicit membership (or system ADMIN, handled above). System admins keep
  // full access; users added via project invites get their assigned role.
  return member ? member.role : 'VIEWER';
}

export async function requireProjectRole(projectCode: string, userId: string, allowedRoles: ProjectRole[]): Promise<boolean> {
  const role = await getProjectRole(projectCode, userId);
  if (!role) return false;
  return allowedRoles.includes(role);
}
