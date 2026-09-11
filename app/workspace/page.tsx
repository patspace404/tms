import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { canManageWorkspace } from "@/lib/permissions";
import UsersTable from "@/components/workspace/UsersTable";
import { initialsOf } from "@/lib/initials";

function getInitials(name: string | null) {
  return name ? initialsOf(name) : "U";
}

// Deterministic vibrant avatar color from name
const AVATAR_COLORS = [
  "#4f46e5",
  "#7c3aed",
  "#0891b2",
  "#059669",
  "#d97706",
  "#e11d48",
  "#0284c7",
  "#9333ea",
];
function avatarColor(name: string | null) {
  if (!name) return AVATAR_COLORS[0];
  let sum = 0;
  for (let i = 0; i < name.length; i++) sum += name.charCodeAt(i);
  return AVATAR_COLORS[sum % AVATAR_COLORS.length];
}

export default async function WorkspaceUsersPage() {
  const session = await getServerSession(authOptions);
  const currentUserId = (session?.user as { id?: string } | undefined)?.id;

  const dbUsers = await prisma.user.findMany({
    include: { workspaceRole: true },
    orderBy: { createdAt: "asc" },
  });

  const currentUser = dbUsers.find((u) => u.id === currentUserId) || null;
  const isAdmin = canManageWorkspace(currentUser);

  const roles = await prisma.workspaceRole.findMany({
    select: { id: true, title: true },
    orderBy: { title: "asc" },
  });

  const users = dbUsers.map((user) => ({
    id: user.id,
    name: user.name || user.email.split("@")[0],
    email: user.email,
    initials: getInitials(user.name || user.email.split("@")[0]),
    avatarBg: avatarColor(user.name || user.email.split("@")[0]),
    isActive: user.isActive,
    isSysAdmin: user.role === "ADMIN",
    role: user.workspaceRole?.title || "Member",
    roleId: user.workspaceRoleId,
    lastAction: user.lastSeenAt
      ? new Date(user.lastSeenAt).toLocaleDateString("en-GB", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        })
      : "Never",
  }));

  return (
    <div className="w-full max-w-[1180px] mx-auto p-[20px_22px]">
      <UsersTable users={users} roles={roles} isAdmin={isAdmin} />
    </div>
  );
}
