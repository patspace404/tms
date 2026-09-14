import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireProjectRole } from "@/lib/project-auth";
import { listTrashedCases, purgeCases, restoreCases } from "@/lib/case-delete";

/**
 * A project's deleted test cases: what went, when, and who took it.
 *
 * Restoring is an EDITOR action, the same bar as deleting. Purging is not:
 * it is the one step that cannot be undone, so it asks for ADMIN.
 */
async function resolve(code: string, roles: ("EDITOR" | "ADMIN")[]) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const user = session.user as { id: string; role?: string };

  const project = await prisma.project.findUnique({
    where: { code },
    select: { id: true },
  });
  if (!project) {
    return { error: NextResponse.json({ error: "Project not found" }, { status: 404 }) };
  }

  const allowed = await requireProjectRole(code, user.id, roles);
  if (!allowed && user.role !== "ADMIN") {
    return {
      error: NextResponse.json(
        { error: "Forbidden: you do not have permission for this" },
        { status: 403 },
      ),
    };
  }
  return { projectId: project.id, userId: user.id };
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const ctx = await resolve(code, ["EDITOR", "ADMIN"]);
  if ("error" in ctx) return ctx.error;

  const cases = await listTrashedCases(ctx.projectId);

  // Resolve the names in one query rather than one per row.
  const ids = [...new Set(cases.map((c) => c.deletedById).filter(Boolean))] as string[];
  const users = ids.length
    ? await prisma.user.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true, email: true },
      })
    : [];
  const byId = new Map(users.map((u) => [u.id, u]));

  return NextResponse.json({
    cases: cases.map((c) => ({
      id: c.id,
      title: c.title,
      sequenceNumber: c.sequenceNumber,
      suite: c.suite?.title ?? null,
      deletedAt: c.deletedAt,
      deletedBy: c.deletedById ? (byId.get(c.deletedById) ?? null) : null,
    })),
  });
}

/** Restore cases from the trash. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const ctx = await resolve(code, ["EDITOR", "ADMIN"]);
  if ("error" in ctx) return ctx.error;

  const body = await req.json().catch(() => ({}));
  const caseIds: string[] = Array.isArray(body.caseIds) ? body.caseIds : [];
  if (caseIds.length === 0) {
    return NextResponse.json({ error: "No case IDs provided" }, { status: 400 });
  }

  const count = await restoreCases(ctx.projectId, caseIds, { userId: ctx.userId });
  return NextResponse.json({ success: true, count });
}

/** Delete cases for good. ADMIN only — this is the step with no way back. */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const ctx = await resolve(code, ["ADMIN"]);
  if ("error" in ctx) return ctx.error;

  const body = await req.json().catch(() => ({}));
  const caseIds: string[] = Array.isArray(body.caseIds) ? body.caseIds : [];
  if (caseIds.length === 0) {
    return NextResponse.json({ error: "No case IDs provided" }, { status: 400 });
  }

  const count = await purgeCases(ctx.projectId, caseIds, { userId: ctx.userId });
  return NextResponse.json({ success: true, count });
}
