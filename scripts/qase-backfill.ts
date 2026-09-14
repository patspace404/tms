/**
 * Full Qase → QMaster reconciliation.
 *
 * Walks every suite, case, run and result in a Qase project and feeds each one
 * through the *same* functions the webhook uses (`lib/qase/sync.ts`), so a
 * backfill and a live event can never drift apart in behaviour.
 *
 * This exists because `migrate-qase.ts` is create-only: it skips anything that
 * already carries an `externalId`, and for runs it writes results only when the
 * run itself is new —
 *
 *     if (!existingRun) await prisma.testRunResult.createMany(...)
 *
 * — so re-running it never picks up results recorded after the first import.
 * That is fine for a one-off migration and wrong for an ongoing move off Qase.
 *
 * Like the webhook, this is **additive**: it creates what is missing and fills
 * placeholders the sync itself made, but never overwrites a verdict a person
 * recorded in QMaster, and never deletes. Safe to run repeatedly, and safe to
 * interrupt — the next run resumes by simply skipping what is already there.
 *
 * USAGE — must run on the AWS server; the DB and S3 are inside the VPC.
 *
 *   # every project that has qaseProjectCode set
 *   npx tsx scripts/qase-backfill.ts
 *
 *   # one project
 *   npx tsx scripts/qase-backfill.ts --project=PKL
 *
 *   --skip-attachments   cases/runs/results only; much faster
 *   --dry-run            report what is missing, write nothing
 */

import { prisma } from "@/lib/prisma";
import { qaseList } from "@/lib/qase/client";
import {
  relinkOrphanSuites,
  syncCase,
  syncResult,
  syncRun,
  syncSuite,
  type SyncOutcome,
} from "@/lib/qase/sync";

const arg = (name: string) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
const has = (name: string) => process.argv.includes(`--${name}`);

const ONLY_PROJECT = arg("project");
const DRY_RUN = has("dry-run");
const SKIP_ATTACHMENTS = has("skip-attachments");

if (SKIP_ATTACHMENTS) process.env.QASE_SYNC_SKIP_ATTACHMENTS = "1";

const stamp = () => new Date().toISOString().slice(11, 19);
const log = (...a: unknown[]) => console.log(`[${stamp()}]`, ...a);

type Tally = { created: number; skipped: number; failed: number };
const tally = (): Tally => ({ created: 0, skipped: 0, failed: 0 });

function record(t: Tally, outcome: SyncOutcome, label: string) {
  if (outcome.status === "PROCESSED") {
    t.created++;
    log(`   + ${label}: ${outcome.message}`);
  } else if (outcome.status === "FAILED") {
    t.failed++;
    log(`   ! ${label}: ${outcome.message}`);
  } else {
    t.skipped++;
  }
}

/** Run one step, turning a thrown error into a FAILED outcome so one bad record cannot end the pass. */
async function guard(fn: () => Promise<SyncOutcome>): Promise<SyncOutcome> {
  try {
    return await fn();
  } catch (err) {
    return { status: "FAILED", message: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Newest Qase result for a case, mirroring `newestResult` inside the sync.
 * Qase keeps every attempt; only the last carries the final verdict and
 * screenshots.
 */
function newestFor(results: any[], caseId: string): any | undefined {
  const mine = results.filter((x) => String(x.case_id) === caseId);
  if (mine.length <= 1) return mine[0];
  return mine.reduce((best, cur) =>
    (Date.parse(cur?.end_time ?? "") || 0) >= (Date.parse(best?.end_time ?? "") || 0) ? cur : best,
  );
}

async function backfillProject(projectId: string, code: string, qaseCode: string) {
  log(`\n══ ${qaseCode} → ${code} ══`);

  const suites = tally();
  const cases = tally();
  const runs = tally();
  const results = tally();

  // ── suites ──
  const qaseSuites = await qaseList(`/suite/${qaseCode}`);
  log(`  suites in Qase: ${qaseSuites.length}`);
  if (!DRY_RUN) {
    for (const s of qaseSuites) {
      record(suites, await guard(() => syncSuite(projectId, qaseCode, s.id)), `suite ${s.id}`);
    }
    // Then place the ones whose parent did not exist yet when they were made.
    // A second pass of syncSuite cannot do this: those suites now exist, so it
    // returns before it ever looks at the parent.
    const relinked = await relinkOrphanSuites(projectId, qaseSuites);
    if (relinked) log(`   ↳ re-parented ${relinked} orphaned suite(s)`);
  }

  // ── cases ──
  const qaseCases = await qaseList(`/case/${qaseCode}`);
  log(`  cases in Qase: ${qaseCases.length}`);
  if (!DRY_RUN) {
    let n = 0;
    for (const c of qaseCases) {
      record(cases, await guard(() => syncCase(projectId, qaseCode, c.id)), `case ${c.id}`);
      if (++n % 200 === 0) log(`   … ${n}/${qaseCases.length} cases`);
    }
  }

  // ── runs + results ──
  const qaseRuns = await qaseList(`/run/${qaseCode}`);
  log(`  runs in Qase: ${qaseRuns.length}`);
  if (!DRY_RUN) {
    for (const r of qaseRuns) {
      record(runs, await guard(() => syncRun(projectId, qaseCode, r.id)), `run ${r.id}`);

      // One fetch per run, reused for every case in it.
      const runResults = await qaseList(`/result/${qaseCode}?run=${r.id}`);
      const caseIds = [...new Set(runResults.map((x: any) => String(x.case_id)).filter(Boolean))];
      for (const caseId of caseIds) {
        // Hand syncResult the record we already hold, so it does not re-fetch
        // this run's whole result list once per case.
        const known = newestFor(runResults, caseId);
        record(
          results,
          await guard(() => syncResult(projectId, qaseCode, r.id, caseId, known)),
          `result run ${r.id} case ${caseId}`,
        );
      }
      log(`  run ${r.id}: ${caseIds.length} cases · results so far +${results.created}`);
    }
  }

  const line = (name: string, t: Tally) =>
    `    ${name.padEnd(8)} +${String(t.created).padStart(5)} new  ${String(t.skipped).padStart(5)} already there  ${t.failed} failed`;
  log(`  ── ${qaseCode} → ${code} done`);
  console.log(line("suites", suites));
  console.log(line("cases", cases));
  console.log(line("runs", runs));
  console.log(line("results", results));

  return { suites, cases, runs, results };
}

async function main() {
  if (!process.env.QASE_TOKEN) {
    console.error("\n✗ QASE_TOKEN is not set.\n");
    process.exit(1);
  }

  const projects = await prisma.project.findMany({
    where: {
      qaseProjectCode: { not: null },
      isArchived: false,
      ...(ONLY_PROJECT ? { code: ONLY_PROJECT } : {}),
    },
    select: { id: true, code: true, qaseProjectCode: true },
    orderBy: { code: "asc" },
  });

  if (projects.length === 0) {
    console.error(
      ONLY_PROJECT
        ? `\n✗ Project "${ONLY_PROJECT}" not found, archived, or has no qaseProjectCode.\n`
        : "\n✗ No project has qaseProjectCode set.\n",
    );
    process.exit(1);
  }

  log(`${DRY_RUN ? "[dry-run] " : ""}Backfilling ${projects.length} project(s)`);
  if (SKIP_ATTACHMENTS) log("Attachments: SKIPPED (--skip-attachments)");

  const totals = { suites: 0, cases: 0, runs: 0, results: 0, failed: 0 };
  for (const p of projects) {
    try {
      const r = await backfillProject(p.id, p.code, p.qaseProjectCode!);
      totals.suites += r.suites.created;
      totals.cases += r.cases.created;
      totals.runs += r.runs.created;
      totals.results += r.results.created;
      totals.failed +=
        r.suites.failed + r.cases.failed + r.runs.failed + r.results.failed;
    } catch (err) {
      // One project failing must not abandon the rest.
      log(`  ✗ ${p.code} aborted: ${err instanceof Error ? err.message : err}`);
    }
  }

  log(
    `\nALL DONE — new: ${totals.suites} suites, ${totals.cases} cases, ` +
      `${totals.runs} runs, ${totals.results} results · ${totals.failed} failed`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
