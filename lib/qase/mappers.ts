/**
 * Qase → QMaster value mapping.
 *
 * Qase sends most enums as integers over the API but as names in some webhook
 * payloads, and the two disagree often enough that every mapper here accepts
 * both. Extracted from the migration scripts so a mapping corrected in one
 * place is corrected everywhere.
 */

const PRIORITY: Record<number, "HIGH" | "MEDIUM" | "LOW" | "NOT_SET"> = {
  0: "NOT_SET",
  1: "HIGH",
  2: "MEDIUM",
  3: "LOW",
};
const PRIORITY_BY_NAME: Record<string, "HIGH" | "MEDIUM" | "LOW" | "NOT_SET"> = {
  undefined: "NOT_SET",
  not_set: "NOT_SET",
  high: "HIGH",
  medium: "MEDIUM",
  low: "LOW",
};

const SEVERITY: Record<
  number,
  "NOT_SET" | "BLOCKER" | "CRITICAL" | "MAJOR" | "NORMAL" | "MINOR" | "TRIVIAL"
> = {
  0: "NOT_SET",
  1: "BLOCKER",
  2: "CRITICAL",
  3: "MAJOR",
  4: "NORMAL",
  5: "MINOR",
  6: "TRIVIAL",
};

const AUTOMATION: Record<number, "MANUAL" | "TO_BE_AUTOMATED" | "AUTOMATED"> = {
  0: "MANUAL",
  1: "TO_BE_AUTOMATED",
  2: "AUTOMATED",
};
const AUTOMATION_BY_NAME: Record<string, "MANUAL" | "TO_BE_AUTOMATED" | "AUTOMATED"> = {
  "is-not-automated": "MANUAL",
  manual: "MANUAL",
  "to-be-automated": "TO_BE_AUTOMATED",
  to_be_automated: "TO_BE_AUTOMATED",
  "is-automated": "AUTOMATED",
  automated: "AUTOMATED",
};

/** Look a value up by integer or by name, whichever Qase happened to send. */
function byNumberOrName<T>(
  raw: unknown,
  byNumber: Record<number, T>,
  byName: Record<string, T>,
  fallback: T,
): T {
  if (raw === null || raw === undefined) return fallback;
  if (typeof raw === "number") return byNumber[raw] ?? fallback;
  const s = String(raw).trim().toLowerCase();
  if (s === "") return fallback;
  if (/^\d+$/.test(s)) return byNumber[Number(s)] ?? fallback;
  return byName[s] ?? fallback;
}

export const mapPriority = (v: unknown) =>
  byNumberOrName(v, PRIORITY, PRIORITY_BY_NAME, "MEDIUM" as const);

export const mapSeverity = (v: unknown) => {
  const byName = Object.fromEntries(
    Object.values(SEVERITY).map((n) => [n.toLowerCase(), n]),
  ) as Record<string, (typeof SEVERITY)[number]>;
  return byNumberOrName(v, SEVERITY, byName, "NORMAL" as const);
};

export const mapAutomation = (v: unknown) =>
  byNumberOrName(v, AUTOMATION, AUTOMATION_BY_NAME, "MANUAL" as const);

export type ResultStatus =
  | "PASSED"
  | "FAILED"
  | "BLOCKED"
  | "SKIPPED"
  | "INVALID"
  | "IN_PROGRESS";

const RESULT_STATUS: Record<string, ResultStatus> = {
  passed: "PASSED",
  failed: "FAILED",
  blocked: "BLOCKED",
  skipped: "SKIPPED",
  invalid: "INVALID",
  in_progress: "IN_PROGRESS",
  untested: "IN_PROGRESS",
  // Qase's "retest" means the verdict was withdrawn and the case needs running
  // again — closest to not-yet-decided, not to any pass/fail outcome.
  retest: "IN_PROGRESS",
};

export const mapResultStatus = (v: unknown): ResultStatus =>
  RESULT_STATUS[String(v).toLowerCase()] ?? "IN_PROGRESS";

/**
 * Qase run status → ours. Verified against a live account: the API sends
 * `status` as an int with a parallel `status_text`, and both spellings reach
 * us depending on the endpoint —
 *   0 in_progress · 1 passed · 2 aborted · 3 failed
 * "passed" and "failed" are both *finished* runs; the pass/fail verdict lives
 * on the results, not the run, so both map to COMPLETED. Reading "failed" as
 * still-running would leave every failed run stuck as ACTIVE forever.
 */
export const mapRunStatus = (v: unknown): "ACTIVE" | "COMPLETED" | "ABORTED" => {
  const s = String(v).trim().toLowerCase();
  if (s === "2" || s === "abort" || s === "aborted") return "ABORTED";
  if (
    s === "1" ||
    s === "3" ||
    s === "complete" ||
    s === "completed" ||
    s === "passed" ||
    s === "failed"
  ) {
    return "COMPLETED";
  }
  return "ACTIVE"; // 0 / in_progress / active / anything unrecognised
};

// Step status is its own scale in Qase, and 0 means "untested" rather than a
// verdict — mapping it to anything would invent a result that was never given.
const STEP_STATUS_BY_NUMBER: Record<number, string> = {
  1: "PASSED",
  2: "FAILED",
  3: "BLOCKED",
};
const STEP_STATUS_BY_NAME: Record<string, string> = {
  passed: "PASSED",
  failed: "FAILED",
  blocked: "BLOCKED",
  skipped: "SKIPPED",
};

export function mapStepStatus(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") return STEP_STATUS_BY_NUMBER[raw] ?? null;
  const s = String(raw).trim().toLowerCase();
  if (s === "") return null;
  if (/^\d+$/.test(s)) return STEP_STATUS_BY_NUMBER[Number(s)] ?? null;
  return STEP_STATUS_BY_NAME[s] ?? null;
}

/** Qase spells an attachment's location `url` on some endpoints, `full_path` on others. */
export const attachmentSource = (a: any): string | null => a?.url || a?.full_path || null;
export const attachmentName = (a: any): string => a?.filename || a?.file || "attachment";
