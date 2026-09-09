import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import {
  fail,
  handler,
  ok,
  readJson,
  READ_ROLES,
  requireProject,
  WRITE_ROLES,
} from "@/lib/api-v1";
import { resolveCaseRefs } from "@/lib/case-refs";
import { serializeRun } from "@/lib/api-v1-serializers";
import { NextResponse } from "next/server";

const RUN_INCLUDE = {
  author: { select: { id: true, name: true, email: true } },
  _count: { select: { results: true } },
} satisfies Prisma.TestRunInclude;

// GET /api/v1/run/{code}/{id} — includes a status breakdown of its results
export const GET = handler(async (req, { params }) => {
  const { code, id } = await params;
  const ctx = await requireProject(req, code, READ_ROLES);
  if (ctx instanceof NextResponse) return ctx;

  const run = await prisma.testRun.findFirst({
    where: { id, projectId: ctx.projectId },
    include: RUN_INCLUDE,
  });
  if (!run) return fail("Run not found.", 404);

  const grouped = await prisma.testRunResult.groupBy({
    by: ["status"],
    where: { runId: run.id },
    _count: { _all: true },
  });
  const stats: Record<string, number> = { total: run._count.results };
  for (const g of grouped) stats[g.status.toLowerCase()] = g._count._all;

  return ok({ ...serializeRun(run), stats });
});

// PATCH /api/v1/run/{code}/{id}
export const PATCH = handler(async (req, { params }) => {
  const { code, id } = await params;
  const ctx = await requireProject(req, code, WRITE_ROLES);
  if (ctx instanceof NextResponse) return ctx;

  const existing = await prisma.testRun.findFirst({
    where: { id, projectId: ctx.projectId },
    select: { id: true, status: true },
  });
  if (!existing) return fail("Run not found.", 404);

  const body = await readJson<any>(req);
  if (!body) return fail("A JSON body is required.", 422);

  const STATUSES = ["ACTIVE", "COMPLETED", "ABORTED"];
  if (body.status && !STATUSES.includes(String(body.status).toUpperCase())) {
    return fail(`'status' must be one of: ${STATUSES.join(", ")}.`, 422);
  }

  for (const field of ["add_cases", "remove_cases"] as const) {
    if (body[field] !== undefined && !Array.isArray(body[field])) {
      return fail(`'${field}' must be an array of case uuids or sequence numbers.`, 422);
    }
  }
  const toAdd: unknown[] = body.add_cases ?? [];
  const toRemove: unknown[] = body.remove_cases ?? [];
  const amending = toAdd.length > 0 || toRemove.length > 0;

  // A run's case list is only meaningful while the run is open. Amending a
  // closed run would silently change totals someone has already reported on.
  if (amending && existing.status !== "ACTIVE") {
    return fail("This run is not active — reopen it before adding or removing cases.", 409);
  }

  const summary: { added: string[]; removed: string[]; already_present: string[]; not_in_run: string[] } = {
    added: [],
    removed: [],
    already_present: [],
    not_in_run: [],
  };

  if (amending) {
    const [add, remove] = await Promise.all([
      resolveCaseRefs(ctx.projectId, toAdd),
      resolveCaseRefs(ctx.projectId, toRemove),
    ]);
    const unresolved = [...add.unresolved, ...remove.unresolved];
    if (unresolved.length) {
      return fail(
        `These 'cases' do not exist in this project: ${unresolved.join(", ")}.`,
        422,
      );
    }

    const present = new Set(
      (
        await prisma.testRunResult.findMany({
          where: { runId: id },
          select: { caseId: true },
        })
      ).map((r) => r.caseId),
    );

    // Adding a case already in the run is a no-op rather than an error, so a
    // caller can re-send the same amendment without having to diff it first.
    const addIds = add.ids.filter((c) => !present.has(c));
    summary.already_present = add.ids.filter((c) => present.has(c));
    const removeIds = remove.ids.filter((c) => present.has(c));
    summary.not_in_run = remove.ids.filter((c) => !present.has(c));

    // Dropping a case discards whatever outcome was recorded against it, so
    // only untouched (IN_PROGRESS) cases go quietly. Anything a tester has
    // already reported on needs `force`.
    if (removeIds.length && body.force !== true) {
      const recorded = await prisma.testRunResult.findMany({
        where: { runId: id, caseId: { in: removeIds }, status: { not: "IN_PROGRESS" } },
        select: { testCase: { select: { sequenceNumber: true } }, status: true },
      });
      if (recorded.length) {
        const named = recorded
          .map((r) => `${code}-${r.testCase.sequenceNumber} (${r.status})`)
          .join(", ");
        return fail(
          `These cases already have a recorded result: ${named}. ` +
            `Removing them discards it — resend with \"force\": true to confirm.`,
          409,
        );
      }
    }

    const finalCount = present.size + addIds.length - removeIds.length;
    if (finalCount === 0) {
      return fail("A run must keep at least one case.", 422);
    }

    await prisma.$transaction(async (tx) => {
      if (removeIds.length) {
        await tx.testRunResult.deleteMany({
          where: { runId: id, caseId: { in: removeIds } },
        });
      }
      if (addIds.length) {
        await tx.testRunResult.createMany({
          data: addIds.map((caseId) => ({ runId: id, caseId, status: "IN_PROGRESS" as const })),
          skipDuplicates: true,
        });
      }
    });
    summary.added = addIds;
    summary.removed = removeIds;
  }

  const run = await prisma.testRun.update({
    where: { id },
    data: {
      ...(body.title !== undefined ? { title: body.title } : {}),
      ...(body.description !== undefined ? { description: body.description } : {}),
      ...(body.status ? { status: body.status.toUpperCase() } : {}),
    },
    include: RUN_INCLUDE,
  });

  return ok({ ...serializeRun(run), ...(amending ? { cases: summary } : {}) });
});

// DELETE /api/v1/run/{code}/{id}
export const DELETE = handler(async (req, { params }) => {
  const { code, id } = await params;
  const ctx = await requireProject(req, code, WRITE_ROLES);
  if (ctx instanceof NextResponse) return ctx;

  const existing = await prisma.testRun.findFirst({
    where: { id, projectId: ctx.projectId },
    select: { id: true },
  });
  if (!existing) return fail("Run not found.", 404);

  await prisma.testRun.delete({ where: { id } });
  return ok({ deleted: true, id });
});
