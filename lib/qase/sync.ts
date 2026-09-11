/**
 * Live Qase → QMaster sync, driven by webhooks.
 *
 * ## The one rule
 *
 * Sync is **additive**: it only ever creates records that do not exist yet, and
 * it only ever fills fields that are still empty on records it created itself
 * (matched by `externalId`). Anything a person typed in QMaster is never
 * touched, so the worst a broken sync can do is fail to add something — it can
 * never destroy work. Every decision not to write is recorded as SKIPPED with a
 * reason, so "nothing happened" is always explainable.
 *
 * The one place this needs care is run results. Creating a run also creates a
 * result row per case, so by the time Qase reports an outcome the row already
 * exists. A row still sitting at IN_PROGRESS is a placeholder this sync made,
 * so it gets filled in; a row that already carries a real verdict was decided
 * by a person or an earlier event, and its verdict is left alone. Evidence is
 * the exception: screenshots are only ever *added*, so they are copied onto a
 * settled result too — otherwise every project migrated before this sync
 * existed would keep its verdicts and lose its images.
 *
 * Webhook payloads are used only to identify *what* changed. The actual data is
 * re-fetched from the Qase REST API, because the payload shape varies between
 * event types and Qase versions, whereas the API is the shape the migration
 * scripts already handle.
 */

import { PutObjectCommand } from "@aws-sdk/client-s3";
import * as crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { s3Client, S3_BUCKET } from "@/lib/s3";
import { qaseEntity, qaseList } from "./client";
import {
  attachmentName,
  attachmentSource,
  mapAutomation,
  mapPriority,
  mapResultStatus,
  mapRunStatus,
  mapSeverity,
  mapStepStatus,
} from "./mappers";

export type SyncOutcome = {
  status: "PROCESSED" | "SKIPPED" | "FAILED";
  message: string;
};

const processed = (message: string): SyncOutcome => ({ status: "PROCESSED", message });
const skipped = (message: string): SyncOutcome => ({ status: "SKIPPED", message });

/** The QMaster project mirroring this Qase project code, if any. */
export async function projectForQaseCode(projectCode: string) {
  return prisma.project.findUnique({ where: { qaseProjectCode: projectCode } });
}

// ── attachments ────────────────────────────────────────────────────────

type Uploaded = { url: string; size: number; name: string; mime: string };

/**
 * Copy one Qase attachment into our S3 bucket.
 *
 * The bucket is private, so the stored URL is our own proxy path rather than an
 * S3 URL — a raw S3 link renders as a broken image (403) for every viewer.
 *
 * Failures are returned, not swallowed. Evidence that quietly fails to copy is
 * the worst outcome here: the run looks synced, the screenshots are gone, and
 * nothing says so. The reason travels back into the event log instead.
 */
async function transferToS3(
  a: any,
  projectId: string,
): Promise<{ ok: Uploaded } | { error: string }> {
  const src = attachmentSource(a);
  if (!src) return { error: "no url" };
  const originalName = attachmentName(a);

  let buffer: Buffer;
  try {
    const res = await fetch(src, { redirect: "follow", signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    buffer = Buffer.from(await res.arrayBuffer());
  } catch (err) {
    return { error: `download ${originalName}: ${err instanceof Error ? err.message : err}` };
  }

  const extMatch = originalName.match(/\.([^.]+)$/);
  const extension = extMatch ? `.${extMatch[1]}` : "";
  const s3Key = `projects/${projectId}/attachments/${crypto.randomUUID()}${extension}`;
  const mime = a?.mime || "application/octet-stream";

  try {
    await s3Client.send(
      new PutObjectCommand({ Bucket: S3_BUCKET, Key: s3Key, Body: buffer, ContentType: mime }),
    );
  } catch (err) {
    return { error: `s3 ${originalName}: ${err instanceof Error ? err.message : err}` };
  }

  return {
    ok: { url: `/api/uploads/${s3Key}`, size: a?.size || buffer.length, name: originalName, mime },
  };
}

// ── suites ─────────────────────────────────────────────────────────────

export async function syncSuite(
  projectId: string,
  qaseProjectCode: string,
  suiteId: string | number,
): Promise<SyncOutcome> {
  const externalId = String(suiteId);
  const existing = await prisma.testSuite.findFirst({
    where: { projectId, externalId },
    select: { id: true },
  });
  if (existing) return skipped(`Suite ${externalId} already exists.`);

  const s = await qaseEntity(`/suite/${qaseProjectCode}/${externalId}`);
  if (!s) return skipped(`Suite ${externalId} no longer in Qase.`);

  // A child can arrive before its parent; link only if the parent is here.
  let parentId: string | null = null;
  if (s.parent_id) {
    const parent = await prisma.testSuite.findFirst({
      where: { projectId, externalId: String(s.parent_id) },
      select: { id: true },
    });
    parentId = parent?.id ?? null;
  }

  await prisma.testSuite.create({
    data: {
      title: s.title || "Untitled suite",
      description: s.description || null,
      projectId,
      parentId,
      externalId,
    },
  });
  return processed(`Created suite "${s.title}".`);
}

// ── cases ──────────────────────────────────────────────────────────────

export async function syncCase(
  projectId: string,
  qaseProjectCode: string,
  caseId: string | number,
): Promise<SyncOutcome> {
  const externalId = String(caseId);
  const existing = await prisma.testCase.findFirst({
    where: { projectId, externalId },
    select: { id: true },
  });
  if (existing) return skipped(`Case ${externalId} already exists.`);

  const c = await qaseEntity(`/case/${qaseProjectCode}/${externalId}`);
  if (!c) return skipped(`Case ${externalId} no longer in Qase.`);

  let suiteId: string | null = null;
  if (c.suite_id) {
    const suite = await prisma.testSuite.findFirst({
      where: { projectId, externalId: String(c.suite_id) },
      select: { id: true },
    });
    // Pull the suite in first if this is the event that reveals it.
    if (!suite) {
      await syncSuite(projectId, qaseProjectCode, c.suite_id);
      const retried = await prisma.testSuite.findFirst({
        where: { projectId, externalId: String(c.suite_id) },
        select: { id: true },
      });
      suiteId = retried?.id ?? null;
    } else {
      suiteId = suite.id;
    }
  }

  const steps = Array.isArray(c.steps)
    ? c.steps.map((st: any, i: number) => ({
        action: String(st.action || st.hash || ""),
        expectedResult: st.expected_result || st.expected || null,
        position: i,
      }))
    : [];

  // sequenceNumber is the human-facing "PRO-42" and must be unique per project.
  const maxSeq = await prisma.testCase.aggregate({
    where: { projectId },
    _max: { sequenceNumber: true },
  });

  await prisma.testCase.create({
    data: {
      title: c.title || "Untitled case",
      description: c.description || null,
      preconditions: c.preconditions || null,
      postconditions: c.postconditions || null,
      priority: mapPriority(c.priority),
      severity: mapSeverity(c.severity),
      automationStatus: mapAutomation(c.automation),
      projectId,
      suiteId,
      sequenceNumber: (maxSeq._max.sequenceNumber || 0) + 1,
      externalId,
      steps: steps.length ? { create: steps } : undefined,
    },
  });
  return processed(`Created case "${c.title}" with ${steps.length} steps.`);
}

// ── runs ───────────────────────────────────────────────────────────────

export async function syncRun(
  projectId: string,
  qaseProjectCode: string,
  runId: string | number,
): Promise<SyncOutcome> {
  const externalId = String(runId);
  const existing = await prisma.testRun.findFirst({
    where: { projectId, externalId },
    select: { id: true, status: true },
  });

  const r = await qaseEntity(`/run/${qaseProjectCode}/${externalId}`);
  if (!r) return skipped(`Run ${externalId} no longer in Qase.`);
  const status = mapRunStatus(r.status_text ?? r.status);

  if (existing) {
    // A run's status is sync's own bookkeeping, not somebody's content — but
    // only advance it, so a run closed in QMaster is not reopened by a late event.
    if (existing.status === "ACTIVE" && status !== "ACTIVE") {
      await prisma.testRun.update({ where: { id: existing.id }, data: { status } });
      return processed(`Run ${externalId} → ${status}.`);
    }
    return skipped(`Run ${externalId} already exists (${existing.status}).`);
  }

  const created = await prisma.testRun.create({
    data: {
      title: r.title || `Qase run ${externalId}`,
      description: r.description || null,
      status,
      projectId,
      externalId,
    },
    select: { id: true },
  });

  // Seed a result row per case so the run opens with its full checklist, the
  // same way a run created inside QMaster does.
  //
  // Qase's run *detail* endpoint does not return the case list — only stats —
  // so the roster has to come from the run's results, which carry `case_id`.
  const results = await qaseList(`/result/${qaseProjectCode}?run=${externalId}`);
  const caseIds = [...new Set(results.map((x: any) => String(x.case_id)).filter(Boolean))];
  let seeded = 0;
  if (caseIds.length) {
    const ours = await prisma.testCase.findMany({
      where: { projectId, externalId: { in: caseIds } },
      select: { id: true },
    });
    if (ours.length) {
      const { count } = await prisma.testRunResult.createMany({
        data: ours.map((c) => ({ runId: created.id, caseId: c.id, status: "IN_PROGRESS" as const })),
        skipDuplicates: true,
      });
      seeded = count;
    }
  }

  return processed(
    `Created run "${r.title}" (${status}); seeded ${seeded} of ${caseIds.length} cases.`,
  );
}

// ── results ────────────────────────────────────────────────────────────

/**
 * Apply one Qase result. `caseId`/`runId` are Qase's ids.
 *
 * Fills a placeholder row, or creates one if the case was added to the run
 * after we mirrored it. A row that already holds a verdict is left untouched.
 */
export async function syncResult(
  projectId: string,
  qaseProjectCode: string,
  runId: string | number,
  caseId: string | number,
  /**
   * The Qase result record, when the caller already has it.
   *
   * The webhook omits it and one fetch per event is nothing. A backfill walking
   * 145 runs of 100 cases would otherwise re-download the same run's result
   * list once per case — tens of thousands of redundant calls, and a fast track
   * to Qase's rate limit — so `scripts/qase-backfill.ts` fetches each run's
   * results once and passes the right record in.
   */
  known?: any,
): Promise<SyncOutcome> {
  const run = await prisma.testRun.findFirst({
    where: { projectId, externalId: String(runId) },
    select: { id: true },
  });
  if (!run) {
    // The run event may not have arrived (or was missed) — pull it in first.
    const outcome = await syncRun(projectId, qaseProjectCode, runId);
    if (outcome.status !== "PROCESSED") return skipped(`Run ${runId} not in QMaster; ${outcome.message}`);
  }
  const runRow =
    run ??
    (await prisma.testRun.findFirst({
      where: { projectId, externalId: String(runId) },
      select: { id: true },
    }));
  if (!runRow) return skipped(`Run ${runId} could not be created.`);

  let testCase = await prisma.testCase.findFirst({
    where: { projectId, externalId: String(caseId) },
    select: { id: true },
  });
  if (!testCase) {
    await syncCase(projectId, qaseProjectCode, caseId);
    testCase = await prisma.testCase.findFirst({
      where: { projectId, externalId: String(caseId) },
      select: { id: true },
    });
  }
  if (!testCase) return skipped(`Case ${caseId} not in QMaster.`);

  // Prefer the authoritative record over the webhook payload.
  //
  // Qase keeps *every* attempt, so one case in one run can have several result
  // records — a first pass, a "retest", then the real one. Only the newest is
  // the current verdict, and it is the one carrying the final screenshots;
  // taking the first match silently imports a stale, evidence-free attempt.
  const result =
    known ?? newestResult(await qaseList(`/result/${qaseProjectCode}?run=${runId}`), caseId);
  if (!result) return skipped(`Result for case ${caseId} in run ${runId} not found in Qase.`);

  const status = mapResultStatus(result.status);
  const existing = await prisma.testRunResult.findUnique({
    where: { runId_caseId: { runId: runRow.id, caseId: testCase.id } },
    select: { id: true, status: true },
  });

  let resultId: string;
  if (!existing) {
    const createdRow = await prisma.testRunResult.create({
      data: {
        runId: runRow.id,
        caseId: testCase.id,
        status,
        comment: result.comment || null,
        timeSpent: timeSpentMs(result),
      },
      select: { id: true },
    });
    resultId = createdRow.id;
  } else if (existing.status === "IN_PROGRESS") {
    await prisma.testRunResult.update({
      where: { id: existing.id },
      data: {
        status,
        comment: result.comment || null,
        timeSpent: timeSpentMs(result),
      },
    });
    resultId = existing.id;
  } else {
    // The verdict stands — but evidence is purely additive, and refusing to
    // copy it would strand every screenshot behind an already-recorded result.
    // That is most of them on a project migrated before this sync existed.
    const evidence = await syncResultEvidence(
      projectId,
      existing.id,
      testCase.id,
      result,
      existing.status,
    );
    if (!evidence) {
      return skipped(
        `Result for case ${caseId} already recorded as ${existing.status} — left as is.`,
      );
    }
    return processed(
      `Result for case ${caseId} kept as ${existing.status}; evidence only.${evidence}`,
    );
  }

  const evidence = await syncResultEvidence(projectId, resultId, testCase.id, result, status);
  return processed(`Result for case ${caseId} → ${status}.${evidence}`);
}

/**
 * The most recent result Qase holds for a case in a run.
 *
 * Ordered by `end_time`; the list endpoint already returns oldest-first, so the
 * last match wins when timestamps are missing or tie.
 */
/**
 * Duration in ms. The list endpoint calls it `time_spent_ms`; older payloads
 * and the docs say `time_spent`. Reading only one of them silently stores null.
 */
function timeSpentMs(result: any): number | null {
  const v = result?.time_spent_ms ?? result?.time_spent;
  return typeof v === "number" ? v : null;
}

function newestResult(results: any[], caseId: string | number): any | undefined {
  const mine = results.filter((x) => String(x.case_id) === String(caseId));
  if (mine.length <= 1) return mine[0];
  return mine.reduce((best, cur) => {
    const b = Date.parse(best?.end_time ?? "") || 0;
    const c = Date.parse(cur?.end_time ?? "") || 0;
    return c >= b ? cur : best;
  });
}


/**
 * Fill in step verdicts Qase never recorded, for a case that passed.
 *
 * Qase lets a tester settle a case without touching its steps, and most do:
 * every step then arrives as status 0, which means "untested", not a verdict.
 * That leaves a migrated run showing a column of dashes and looking as though
 * the migration dropped something.
 *
 * For a PASSED case it is recoverable — a case passes only if every step
 * passed, so the step verdicts are *entailed* by the case verdict rather than
 * invented. FAILED and BLOCKED are not: nothing in the data says which step
 * broke, and guessing would paint a red mark on steps that were fine.
 *
 * Mutates `stepResults` and reports whether anything changed. Entries are
 * flagged `derivedFrom: "case-result"` so a reader — and the UI — can tell an
 * inference from something a person actually typed.
 */
export function deriveStepVerdicts(
  caseStatus: string | undefined,
  stepResults: Record<string, any>,
  stepIds: string[],
): boolean {
  if (caseStatus !== "PASSED" || stepIds.length === 0) return false;
  // Only when nothing was recorded: a partially stamped case is somebody's
  // work in progress, and filling the rest would overwrite their intent.
  if (Object.values(stepResults).some((v: any) => v?.status)) return false;

  for (const id of stepIds) {
    stepResults[id] = { ...(stepResults[id] || {}), status: "PASSED", derivedFrom: "case-result" };
  }
  return true;
}

/** Copy result-level and step-level attachments. Returns a short suffix for the log. */
async function syncResultEvidence(
  projectId: string,
  resultId: string,
  caseId: string,
  result: any,
  /** The case-level verdict, used to fill in steps Qase left untouched. */
  caseStatus?: string,
): Promise<string> {
  // Set by scripts/qase-backfill.ts --skip-attachments, for a fast structural
  // pass over a large project. Never set in the running app.
  if (process.env.QASE_SYNC_SKIP_ATTACHMENTS === "1") return "";

  let resultLevel = 0;
  let stepLevel = 0;
  const failures: string[] = [];

  for (const a of result?.attachments || []) {
    if (!attachmentSource(a)) continue;
    const name = attachmentName(a);
    const dupe = await prisma.attachment.findFirst({
      where: { resultId, originalName: name },
      select: { id: true },
    });
    if (dupe) continue;
    const transfer = await transferToS3(a, projectId);
    if ("error" in transfer) {
      failures.push(transfer.error);
      continue;
    }
    const uploaded = transfer.ok;
    await prisma.attachment.create({
      data: {
        filename: uploaded.url.split("/").pop() || uploaded.name,
        originalName: uploaded.name,
        mimeType: uploaded.mime,
        size: uploaded.size,
        url: uploaded.url,
        projectId,
        resultId,
      },
    });
    resultLevel++;
  }

  const qaseSteps: any[] = Array.isArray(result?.steps) ? result.steps : [];
  // Also enter for a passed case with no steps from Qase at all: the block
  // below can still derive the step verdicts from the case result, and Qase
  // returns `steps: null` often enough that skipping would strand them.
  if (qaseSteps.length || caseStatus === "PASSED") {
    const ourSteps = await prisma.testStep.findMany({
      where: { caseId },
      orderBy: { position: "asc" },
      select: { id: true },
    });
    const row = await prisma.testRunResult.findUnique({
      where: { id: resultId },
      select: { stepResults: true },
    });
    const stepResults: Record<string, any> = (row?.stepResults as any) || {};
    let changed = false;

    // Qase returns steps in execution order, matching the order we created
    // TestStep rows in — so index-align rather than trying to match text.
    for (let i = 0; i < qaseSteps.length; i++) {
      const target = ourSteps[i];
      if (!target) continue;
      const qs = qaseSteps[i];
      const entry = stepResults[target.id] || {};

      const status = mapStepStatus(qs?.status);
      if (status && !entry.status) {
        entry.status = status;
        changed = true;
      }
      if (qs?.comment && !entry.actualResult) {
        entry.actualResult = qs.comment;
        changed = true;
      }

      const existing: any[] = Array.isArray(entry.attachments) ? entry.attachments : [];
      for (const a of qs?.attachments || []) {
        if (!attachmentSource(a)) continue;
        const name = attachmentName(a);
        if (existing.some((e) => e?.name === name)) continue;
        const transfer = await transferToS3(a, projectId);
        if ("error" in transfer) {
          failures.push(transfer.error);
          continue;
        }
        existing.push({ url: transfer.ok.url, name: transfer.ok.name });
        stepLevel++;
        changed = true;
      }
      if (existing.length) entry.attachments = existing;
      if (Object.keys(entry).length) stepResults[target.id] = entry;
    }

    if (deriveStepVerdicts(caseStatus, stepResults, ourSteps.map((x) => x.id))) {
      changed = true;
    }

    if (changed) {
      await prisma.testRunResult.update({ where: { id: resultId }, data: { stepResults } });
    }
  }

  const parts: string[] = [];
  if (resultLevel || stepLevel) {
    parts.push(`Evidence: ${resultLevel} result-level, ${stepLevel} step-level.`);
  }
  if (failures.length) {
    // Surfaced, not hidden: a run whose screenshots failed to copy must say so.
    parts.push(`${failures.length} attachment(s) FAILED — ${failures.slice(0, 2).join("; ")}`);
  }
  return parts.length ? ` ${parts.join(" ")}` : "";
}
