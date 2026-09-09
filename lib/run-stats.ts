/**
 * One definition of "how far along is this run", shared by every screen.
 *
 * There were three, and they disagreed: the workspace dashboard counted
 * anything not IN_PROGRESS, the project dashboard counted pass/fail/blocked
 * plus skipped, and the Test Runs board counted only pass/fail/blocked. The
 * strictest one meant a finished run that skipped three cases sat at 98%
 * forever, and those three cases appeared nowhere on the card — the icons
 * added up to less than the total with nothing to explain the gap.
 *
 * The rule here: a result is **decided** unless it is still IN_PROGRESS.
 * Skipping a case is a tester's decision, not an omission; the case will not
 * be run again in this run, so it counts towards completion.
 */

export type RunResultLike = { status: string };

export type RunStats = {
  total: number;
  passed: number;
  failed: number;
  blocked: number;
  skipped: number;
  invalid: number;
  /** Still awaiting a verdict. */
  untested: number;
  /** Everything that has a verdict, including skipped and invalid. */
  decided: number;
  /** decided ÷ total, 0–100. */
  completionPercent: number;
  /** passed ÷ decided, 0–100. */
  passRate: number;
  /** Every case has a verdict — the run can be closed. */
  isFullyDecided: boolean;
};

export function runStats(results: RunResultLike[] | null | undefined): RunStats {
  const list = results ?? [];
  const count = (status: string) => list.filter((r) => r.status === status).length;

  const total = list.length;
  const passed = count("PASSED");
  const failed = count("FAILED");
  const blocked = count("BLOCKED");
  const skipped = count("SKIPPED");
  const invalid = count("INVALID");
  const untested = count("IN_PROGRESS");
  const decided = total - untested;

  return {
    total,
    passed,
    failed,
    blocked,
    skipped,
    invalid,
    untested,
    decided,
    completionPercent: total > 0 ? Math.round((decided / total) * 100) : 0,
    passRate: decided > 0 ? Math.round((passed / decided) * 100) : 0,
    isFullyDecided: total > 0 && untested === 0,
  };
}
