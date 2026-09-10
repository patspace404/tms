import { prisma } from "@/lib/prisma";

export const RESULT_STATUSES = [
  "PASSED",
  "FAILED",
  "BLOCKED",
  "SKIPPED",
  "INVALID",
  "IN_PROGRESS",
];

export type ResultPayload = {
  /** Case uuid, or its sequence number (the 42 in "PRO-42"). `case` is an alias. */
  case_id?: string | number;
  case?: string | number;
  status?: string;
  comment?: string;
  /** Milliseconds. `time_ms` is an alias. */
  time_spent_ms?: number;
  time_ms?: number;
  error_message?: string;
  /** Per-step outcomes, in the case's step order. */
  steps?: { status?: string; actual_result?: string; attachments?: { name: string; url: string }[] }[];
};

type Applied = { resultId: string };
type Failed = { error: string; status: number };

/**
 * Record one case's outcome in a run.
 *
 * A run already carries a result row per case, so this updates the existing row
 * rather than inserting — re-reporting the same case overwrites, which is what
 * a CI retry should do. Cases not in the run are rejected instead of silently
 * added, so a typo'd id surfaces rather than skewing the run's totals.
 */
export async function applyResult(
  projectId: string,
  runId: string,
  body: ResultPayload,
  /** Token owner — recorded as the person who ran the test. */
  executedById?: string,
): Promise<Applied | Failed> {
  const ref = body.case_id ?? body.case;
  if (ref === undefined || ref === null || ref === "") {
    return { error: "'case_id' (or 'case') is required.", status: 422 };
  }

  const seq = Number(ref);
  const testCase = await prisma.testCase.findFirst({
    where:
      Number.isInteger(seq) && seq > 0
        ? { projectId, sequenceNumber: seq }
        : { projectId, id: String(ref) },
    select: { id: true, steps: { orderBy: { position: "asc" }, select: { id: true } } },
  });
  if (!testCase) return { error: `Case '${ref}' not found in this project.`, status: 404 };

  const existing = await prisma.testRunResult.findUnique({
    where: { runId_caseId: { runId, caseId: testCase.id } },
    select: { id: true, stepResults: true },
  });
  if (!existing) {
    return { error: `Case '${ref}' is not part of this run.`, status: 409 };
  }

  // Map the submitted steps onto the case's real step ids, positionally — the
  // execution page reads step outcomes keyed by TestStep.id.
  let stepResults = (existing.stepResults as Record<string, any>) ?? {};
  if (Array.isArray(body.steps)) {
    // Keep only outcomes for the case's CURRENT steps. Editing a case replaces
    // its TestStep rows with new ids, so prior stepResults keyed by the old ids
    // are orphaned — carrying them forward makes the result show more step rows
    // than the case has. Start from the live step set instead of spreading all.
    const liveIds = new Set(testCase.steps.map((t) => t.id));
    const next: Record<string, any> = {};
    for (const [id, val] of Object.entries(stepResults)) {
      if (liveIds.has(id)) next[id] = val;
    }
    body.steps.forEach((s, i) => {
      const target = testCase.steps[i];
      if (!target) return;
      const status = s.status ? String(s.status).toUpperCase() : undefined;
      next[target.id] = {
        ...(next[target.id] ?? {}),
        ...(status && RESULT_STATUSES.includes(status) ? { status } : {}),
        ...(s.actual_result !== undefined ? { actualResult: s.actual_result } : {}),
        ...(Array.isArray(s.attachments)
          ? { attachments: s.attachments.filter((a) => a?.url).map((a) => ({ name: a.name, url: a.url })) }
          : {}),
      };
    });
    stepResults = next;
  }

  const timeSpent = body.time_spent_ms ?? body.time_ms;

  await prisma.testRunResult.update({
    where: { id: existing.id },
    data: {
      status: String(body.status).toUpperCase() as any,
      ...(body.comment !== undefined ? { comment: body.comment } : {}),
      ...(body.error_message !== undefined ? { errorMessage: body.error_message } : {}),
      ...(typeof timeSpent === "number" ? { timeSpent: Math.round(timeSpent) } : {}),
      ...(Array.isArray(body.steps) ? { stepResults } : {}),
      executedAt: new Date(),
      ...(executedById ? { executedById } : {}),
    },
  });

  return { resultId: existing.id };
}
