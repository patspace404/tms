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
import { allocateSequenceNumber } from "@/lib/case-sequence";
import { serializeCase } from "@/lib/api-v1-serializers";
import { NextResponse } from "next/server";

const CASE_INCLUDE = {
  steps: { orderBy: { position: "asc" } },
  tags: true,
  project: { select: { code: true } },
  author: { select: { id: true, name: true, email: true } },
} satisfies Prisma.TestCaseInclude;

const PRIORITIES = ["NOT_SET", "HIGH", "MEDIUM", "LOW"];
const SEVERITIES = ["NOT_SET", "BLOCKER", "CRITICAL", "MAJOR", "NORMAL", "MINOR", "TRIVIAL"];
const AUTOMATION = ["MANUAL", "TO_BE_AUTOMATED", "AUTOMATED"];

// GET /api/v1/case/{code} — list cases
// Filters: suite_id, priority, severity, automation, search
export const GET = handler(async (req, { params }) => {
  const { code } = await params;
  const ctx = await requireProject(req, code, READ_ROLES);
  if (ctx instanceof NextResponse) return ctx;

  const { limit, offset } = paging(req);
  const q = new URL(req.url).searchParams;

  const where: Prisma.TestCaseWhereInput = { projectId: ctx.projectId };
  if (q.get("suite_id")) where.suiteId = q.get("suite_id");
  if (q.get("priority")) where.priority = q.get("priority")!.toUpperCase() as any;
  if (q.get("severity")) where.severity = q.get("severity")!.toUpperCase() as any;
  if (q.get("automation")) where.automationStatus = q.get("automation")!.toUpperCase() as any;
  if (q.get("search")) {
    where.OR = [
      { title: { contains: q.get("search")!, mode: "insensitive" } },
      { description: { contains: q.get("search")!, mode: "insensitive" } },
    ];
  }

  const [total, cases] = await Promise.all([
    prisma.testCase.count({ where }),
    prisma.testCase.findMany({
      where,
      orderBy: { sequenceNumber: "asc" },
      skip: offset,
      take: limit,
      include: CASE_INCLUDE,
    }),
  ]);

  return ok(listEnvelope(cases.map(serializeCase), total, limit, offset));
});

// POST /api/v1/case/{code} — create a case
export const POST = handler(async (req, { params }) => {
  const { code } = await params;
  const ctx = await requireProject(req, code, WRITE_ROLES);
  if (ctx instanceof NextResponse) return ctx;

  const body = await readJson<any>(req);
  if (!body?.title?.trim()) return fail("'title' is required.", 422);

  for (const [field, allowed, value] of [
    ["priority", PRIORITIES, body.priority],
    ["severity", SEVERITIES, body.severity],
    ["automation", AUTOMATION, body.automation],
  ] as const) {
    if (value && !allowed.includes(String(value).toUpperCase())) {
      return fail(`'${field}' must be one of: ${allowed.join(", ")}.`, 422);
    }
  }

  if (body.suite_id) {
    const suite = await prisma.testSuite.findFirst({
      where: { id: body.suite_id, projectId: ctx.projectId },
      select: { id: true },
    });
    if (!suite) return fail("'suite_id' does not name a suite in this project.", 422);
  }

  const steps: any[] = Array.isArray(body.steps) ? body.steps : [];

  // sequenceNumber is unique per project and is what "PRO-42" refers to, so it
  // must be allocated atomically or two concurrent creates collide.
  const created = await prisma.$transaction(async (tx) => {
    const sequenceNumber = await allocateSequenceNumber(tx, ctx.projectId);

    return tx.testCase.create({
      data: {
        title: body.title.trim(),
        description: body.description ?? null,
        preconditions: body.preconditions ?? null,
        postconditions: body.postconditions ?? null,
        priority: (body.priority?.toUpperCase() as any) ?? "MEDIUM",
        severity: (body.severity?.toUpperCase() as any) ?? "NORMAL",
        automationStatus: (body.automation?.toUpperCase() as any) ?? "MANUAL",
        projectId: ctx.projectId,
        suiteId: body.suite_id ?? null,
        authorId: ctx.actor.userId,
        sequenceNumber,
        steps: steps.length
          ? {
              create: steps.map((s: any, i: number) => ({
                action: String(s.action ?? ""),
                expectedResult: s.expected_result ?? null,
                position: i,
              })),
            }
          : undefined,
      },
      include: CASE_INCLUDE,
    });
  });

  return ok(serializeCase(created), 201);
});
