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
  rejectUnknownFields,
  requireProject,
  WRITE_ROLES,
} from "@/lib/api-v1";
import { serializeResult } from "@/lib/api-v1-serializers";
import { NextResponse } from "next/server";
import { applyResult, RESULT_FIELDS, RESULT_STATUSES, ResultPayload } from "./apply";

const RESULT_INCLUDE = {
  assignee: { select: { id: true, name: true, email: true } },
  attachments: { select: { id: true, originalName: true, url: true, mimeType: true, size: true } },
  // The case's steps, in order, so the serializer can return step outcomes in
  // the order they are executed rather than however the JSON object was keyed.
  testCase: {
    select: { steps: { orderBy: { position: "asc" }, select: { id: true, position: true } } },
  },
} satisfies Prisma.TestRunResultInclude;

// GET /api/v1/result/{code}/{runId} — results of one run. Filter: ?status=FAILED
export const GET = handler(async (req, { params }) => {
  const { code, runId } = await params;
  const ctx = await requireProject(req, code, READ_ROLES);
  if (ctx instanceof NextResponse) return ctx;

  const run = await prisma.testRun.findFirst({
    where: { id: runId, projectId: ctx.projectId },
    select: { id: true },
  });
  if (!run) return fail("Run not found.", 404);

  const { limit, offset } = paging(req);
  const status = new URL(req.url).searchParams.get("status");

  const where: Prisma.TestRunResultWhereInput = { runId: run.id };
  if (status) where.status = status.toUpperCase() as any;

  const [total, results] = await Promise.all([
    prisma.testRunResult.count({ where }),
    prisma.testRunResult.findMany({
      where,
      // createdAt alone is not a total order — a run's rows are created in one
      // batch and share a timestamp, so paging through them by offset repeated
      // some and skipped others. The id breaks the tie.
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      skip: offset,
      take: limit,
      include: RESULT_INCLUDE,
    }),
  ]);

  return ok(listEnvelope(results.map(serializeResult), total, limit, offset));
});

// POST /api/v1/result/{code}/{runId} — record one case's outcome
export const POST = handler(async (req, { params }) => {
  const { code, runId } = await params;
  const ctx = await requireProject(req, code, WRITE_ROLES);
  if (ctx instanceof NextResponse) return ctx;

  const run = await prisma.testRun.findFirst({
    where: { id: runId, projectId: ctx.projectId },
    select: { id: true, status: true },
  });
  if (!run) return fail("Run not found.", 404);
  if (run.status !== "ACTIVE") {
    return fail("This run is not active — reopen it before submitting results.", 409);
  }

  const body = await readJson<ResultPayload>(req);
  if (!body) return fail("A JSON body is required.", 422);
  const unknown = rejectUnknownFields(body as Record<string, unknown>, RESULT_FIELDS);
  if (unknown) return unknown;
  if (!body.case_id && !body.case) return fail("'case_id' (or 'case') is required.", 422);
  if (!body.status || !RESULT_STATUSES.includes(String(body.status).toUpperCase())) {
    return fail(`'status' must be one of: ${RESULT_STATUSES.join(", ")}.`, 422);
  }

  const outcome = await applyResult(ctx.projectId, run.id, body, {
    executedById: ctx.actor.userId,
    role: ctx.role,
  });
  if ("error" in outcome) return fail(outcome.error, outcome.status);

  const saved = await prisma.testRunResult.findUnique({
    where: { id: outcome.resultId },
    include: RESULT_INCLUDE,
  });

  return ok(serializeResult(saved), 201);
});
