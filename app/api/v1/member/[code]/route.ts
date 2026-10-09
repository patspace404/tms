import { prisma } from "@/lib/prisma";
import { handler, listEnvelope, ok, paging, READ_ROLES, requireProject } from "@/lib/api-v1";
import { NextResponse } from "next/server";

/**
 * GET /api/v1/member/{code} — who belongs to this project, with their user ids.
 *
 * Needed to use `assignee_id` at all: a migration has names, and nothing to
 * turn them into ids with. Every guess at this route — /member, /members,
 * /user, /users — answered 404, so the only way to credit a result to the
 * person who produced it was to not credit it.
 *
 * Workspace admins hold every project without a membership row, so they are
 * listed too: they are valid assignees, and leaving them out would make the
 * list disagree with what the API accepts.
 */
export const GET = handler(async (req, { params }) => {
  const { code } = await params;
  const ctx = await requireProject(req, code, READ_ROLES);
  if (ctx instanceof NextResponse) return ctx;

  const { limit, offset } = paging(req);

  const [members, admins] = await Promise.all([
    prisma.projectMember.findMany({
      where: { projectId: ctx.projectId },
      select: {
        role: true,
        user: { select: { id: true, name: true, email: true } },
      },
    }),
    prisma.user.findMany({
      where: { role: "ADMIN" },
      select: { id: true, name: true, email: true },
    }),
  ]);

  const rows = new Map<string, { id: string; name: string | null; email: string; role: string }>();
  for (const a of admins) {
    rows.set(a.id, { id: a.id, name: a.name, email: a.email, role: "ADMIN" });
  }
  // An explicit membership describes the person's role on this project, so it
  // wins over the blanket workspace-admin entry.
  for (const m of members) {
    rows.set(m.user.id, {
      id: m.user.id,
      name: m.user.name,
      email: m.user.email,
      role: m.role,
    });
  }

  const all = [...rows.values()].sort((a, b) =>
    (a.name || a.email).localeCompare(b.name || b.email),
  );

  return ok(listEnvelope(all.slice(offset, offset + limit), all.length, limit, offset));
});
