import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import {
  fail,
  handler,
  listEnvelope,
  ok,
  paging,
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

// GET /api/v1/run/{code} — list runs. Filter: ?status=ACTIVE|COMPLETED|ABORTED
export const GET = handler(async (req, { params }) => {
  const { code } = await params;
  const ctx = await requireProject(req, code, READ_ROLES);
  if (ctx instanceof NextResponse) return ctx;

  const { limit, offset } = paging(req);
  const status = new URL(req.url).searchParams.get("status");

  const where: Prisma.TestRunWhereInput = { projectId: ctx.projectId };
  if (status) where.status = status.toUpperCase() as any;

  const [total, runs] = await Promise.all([
    prisma.testRun.count({ where }),
    prisma.testRun.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: offset,
      take: limit,
      include: RUN_INCLUDE,
    }),
  ]);

  return ok(listEnvelope(runs.map(serializeRun), total, limit, offset));
});

// POST /api/v1/run/{code} — start a run
// `cases` may hold case uuids or sequence numbers; omit it to include every case.
export const POST = handler(async (req, { params }) => {
  const { code } = await params;
  const ctx = await requireProject(req, code, WRITE_ROLES);
  if (ctx instanceof NextResponse) return ctx;

  const body = await readJson<any>(req);
  if (!body?.title?.trim()) return fail("'title' is required.", 422);

  let caseIds: string[];
  if (Array.isArray(body.cases) && body.cases.length > 0) {
    caseIds = (await resolveCaseRefs(ctx.projectId, body.cases)).ids;
    if (caseIds.length === 0) return fail("None of the given 'cases' exist in this project.", 422);
  } else {
    const all = await prisma.testCase.findMany({
      where: { projectId: ctx.projectId },
      select: { id: true },
    });
    caseIds = all.map((c) => c.id);
    if (caseIds.length === 0) return fail("This project has no cases to run.", 422);
  }

  for (const [field, value, model] of [
    ["environment_id", body.environment_id, prisma.environment],
    ["milestone_id", body.milestone_id, prisma.milestone],
    ["plan_id", body.plan_id, prisma.testPlan],
  ] as const) {
    if (!value) continue;
    const found = await (model as any).findFirst({
      where: { id: value, projectId: ctx.projectId },
      select: { id: true },
    });
    if (!found) return fail(`'${field}' does not name a record in this project.`, 422);
  }

  const run = await prisma.testRun.create({
    data: {
      title: body.title.trim(),
      description: body.description ?? null,
      projectId: ctx.projectId,
      authorId: ctx.actor.userId,
      environmentId: body.environment_id ?? null,
      milestoneId: body.milestone_id ?? null,
      planId: body.plan_id ?? null,
      results: { create: caseIds.map((caseId) => ({ caseId, status: "IN_PROGRESS" as const })) },
    },
    include: RUN_INCLUDE,
  });

  return ok(serializeRun(run), 201);
});
