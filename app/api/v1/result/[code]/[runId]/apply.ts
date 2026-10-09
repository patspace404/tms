import { prisma } from "@/lib/prisma";
import type { ProjectRole } from "@prisma/client";

export const RESULT_STATUSES = [
  "PASSED",
  "FAILED",
  "BLOCKED",
  "SKIPPED",
  "INVALID",
  "IN_PROGRESS",
];

/**
 * Clears a step's verdict instead of setting one.
 *
 * Omitting `status` means "leave it as it was", which is right for a partial
 * update but left no way to put a step back to untested — once stamped, it was
 * stamped for good. `null` and "UNTESTED" both mean clear it.
 */
export const STEP_STATUS_RESET = "UNTESTED";

export type ResultStepPayload = {
  /**
   * Which step this is for. Preferred: it says what you mean, and survives the
   * case being reordered between the read and the write. Without it the entry's
   * position in the array decides, which is what the list used to rely on.
   */
  step_id?: string;
  /** Zero-based position in the case's steps. An alternative to `step_id`. */
  position?: number;
  status?: string | null;
  actual_result?: string;
  attachments?: { name: string; url: string }[];
};

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
  /** Who ran the test. Requires ADMIN on the project; see `applyResult`. */
  assignee_id?: string | null;
  /** Per-step outcomes. Targeted by `step_id`, else by array position. */
  steps?: ResultStepPayload[];
};

/** Every field a result payload may carry, for rejecting the rest. */
export const RESULT_FIELDS = [
  "case_id",
  "case",
  "status",
  "comment",
  "time_spent_ms",
  "time_ms",
  "error_message",
  "assignee_id",
  "steps",
] as const;

export type ApplyContext = {
  /** Token owner — recorded as the person who ran the test. */
  executedById?: string;
  /** The token's role on this project. Only ADMIN may credit someone else. */
  role?: ProjectRole;
};

type Applied = { resultId: string };
type Failed = { error: string; status: number };

/**
 * Resolve `assignee_id` to a user who actually belongs to this project.
 *
 * Crediting work to someone is not a free-text field: an id that is not a
 * member would put a name on a report that nobody can account for.
 */
async function resolveAssignee(
  projectId: string,
  assigneeId: string,
  ctx: ApplyContext,
): Promise<{ id: string } | Failed> {
  if (ctx.role !== "ADMIN" && assigneeId !== ctx.executedById) {
    return {
      error:
        "Only a project ADMIN can record a result under someone else's name. " +
        "Your token may set 'assignee_id' to its own user id.",
      status: 403,
    };
  }

  const member = await prisma.projectMember.findFirst({
    where: { projectId, userId: assigneeId },
    select: { userId: true },
  });
  if (member) return { id: member.userId };

  // Workspace admins hold every project without a membership row, so a missing
  // row is not proof of a stranger — check the account before refusing.
  const user = await prisma.user.findUnique({
    where: { id: assigneeId },
    select: { id: true, role: true },
  });
  if (user?.role === "ADMIN") return { id: user.id };

  return {
    error: user
      ? `User '${assigneeId}' is not a member of this project.`
      : `User '${assigneeId}' does not exist. GET /api/v1/member/{code} lists who you can assign to.`,
    status: 422,
  };
}

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
  // Defaulted: an unauthenticated caller records an outcome credited to nobody,
  // which is a supported case and should not be a crash.
  ctx: ApplyContext = {},
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
    select: { id: true, stepResults: true, assigneeId: true },
  });
  if (!existing) {
    return { error: `Case '${ref}' is not part of this run.`, status: 409 };
  }

  let assigneeId: string | undefined;
  if (body.assignee_id !== undefined && body.assignee_id !== null) {
    const resolved = await resolveAssignee(projectId, String(body.assignee_id), ctx);
    if ("error" in resolved) return resolved;
    assigneeId = resolved.id;
  }

  // Map the submitted steps onto the case's real step ids.
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

    for (const [i, s] of body.steps.entries()) {
      // `step_id` wins when given. It used to be accepted and ignored, so a
      // client that read the steps back and wrote them to the ids it was handed
      // had its values land on whichever steps happened to sit at those array
      // positions — quietly, and only on cases whose stored order differed.
      let targetId: string | undefined;
      if (s?.step_id !== undefined) {
        if (!liveIds.has(String(s.step_id))) {
          return {
            error: `Step '${s.step_id}' does not belong to case '${ref}'.`,
            status: 422,
          };
        }
        targetId = String(s.step_id);
      } else {
        const at = typeof s?.position === "number" ? s.position : i;
        const target = testCase.steps[at];
        if (!target) {
          return {
            error: `Case '${ref}' has ${testCase.steps.length} step(s); no step at position ${at}.`,
            status: 422,
          };
        }
        targetId = target.id;
      }

      const entry = { ...(next[targetId] ?? {}) };

      // Present-and-null (or UNTESTED) clears; absent leaves it alone.
      if (s && "status" in s) {
        const raw = s.status === null ? null : String(s.status).toUpperCase();
        if (raw === null || raw === STEP_STATUS_RESET) {
          delete entry.status;
          delete entry.derivedFrom;
        } else if (RESULT_STATUSES.includes(raw)) {
          entry.status = raw;
          delete entry.derivedFrom;
        } else {
          return {
            error:
              `'steps[${i}].status' must be one of: ${RESULT_STATUSES.join(", ")}, ` +
              `or ${STEP_STATUS_RESET}/null to clear it.`,
            status: 422,
          };
        }
      }
      if (s?.actual_result !== undefined) entry.actualResult = s.actual_result;
      if (Array.isArray(s?.attachments)) {
        entry.attachments = s.attachments
          .filter((a) => a?.url)
          .map((a) => ({ name: a.name, url: a.url }));
      }

      next[targetId] = entry;
    }
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
      ...(ctx.executedById ? { executedById: ctx.executedById } : {}),
      // An explicit assignee_id wins. Otherwise mirror the execution page:
      // whoever first records an outcome becomes the assignee, so results
      // submitted through the API are not credited to nobody.
      ...(assigneeId
        ? { assigneeId }
        : ctx.executedById && !existing.assigneeId
          ? { assigneeId: ctx.executedById }
          : {}),
    },
  });

  return { resultId: existing.id };
}
