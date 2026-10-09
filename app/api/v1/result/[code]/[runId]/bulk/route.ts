import { prisma } from "@/lib/prisma";
import {
  fail,
  handler,
  ok,
  readJson,
  rejectUnknownFields,
  requireProject,
  WRITE_ROLES,
} from "@/lib/api-v1";
import { NextResponse } from "next/server";
import { applyResult, RESULT_FIELDS, RESULT_STATUSES, ResultPayload } from "../apply";

// POST /api/v1/result/{code}/{runId}/bulk — submit a whole suite run in one call
// Body: { results: [ { case_id, status, ... }, ... ] }
//
// Partial success is intentional: one unknown case id shouldn't discard the
// other results a CI job spent minutes producing. Failures come back per item.
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

  const body = await readJson<{ results?: ResultPayload[] }>(req);
  const unknownTop = rejectUnknownFields(body as Record<string, unknown>, ["results"]);
  if (unknownTop) return unknownTop;
  const items = body?.results;
  if (!Array.isArray(items) || items.length === 0) {
    return fail("'results' must be a non-empty array.", 422);
  }
  if (items.length > 500) {
    return fail("At most 500 results per request.", 422);
  }

  const applied: string[] = [];
  const errors: { index: number; case_id: unknown; error: string }[] = [];

  for (const [index, item] of items.entries()) {
    // Per item, so one mistyped field names itself instead of failing the batch.
    const unknown = Object.keys(item ?? {}).filter(
      (k) => !(RESULT_FIELDS as readonly string[]).includes(k),
    );
    if (unknown.length) {
      errors.push({
        index,
        case_id: item?.case_id ?? item?.case ?? null,
        error: `Unrecognised field${unknown.length > 1 ? "s" : ""}: ${unknown.join(", ")}.`,
      });
      continue;
    }

    const status = String(item?.status ?? "").toUpperCase();
    if (!RESULT_STATUSES.includes(status)) {
      errors.push({
        index,
        case_id: item?.case_id ?? item?.case ?? null,
        error: `'status' must be one of: ${RESULT_STATUSES.join(", ")}.`,
      });
      continue;
    }

    const outcome = await applyResult(ctx.projectId, run.id, item, {
      executedById: ctx.actor.userId,
      role: ctx.role,
    });
    if ("error" in outcome) {
      errors.push({ index, case_id: item?.case_id ?? item?.case ?? null, error: outcome.error });
    } else {
      applied.push(outcome.resultId);
    }
  }

  return ok(
    { submitted: items.length, applied: applied.length, failed: errors.length, errors },
    errors.length === items.length ? 422 : 200,
  );
});
