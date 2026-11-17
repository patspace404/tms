/**
 * Ordering for the test-case table.
 *
 * Lives here rather than in the list component so the comparisons that are easy
 * to get wrong — case numbers sorting as text, ties reshuffling on every
 * re-render — are pinned down by tests.
 */

export type CaseSortKey = "id" | "title" | "priority" | "automation" | "owner";
export type CaseSortDir = "asc" | "desc";

const PRIORITY_RANK: Record<string, number> = { HIGH: 3, MEDIUM: 2, LOW: 1 };
const AUTOMATION_RANK: Record<string, number> = {
  Manual: 1,
  "To automate": 2,
  Automated: 3,
};

/** Who a case belongs to: its assignee if it has one, otherwise its author. */
export function ownerLabel(tc: any): string {
  return (
    tc.assignee?.name ||
    tc.assignee?.email ||
    tc.author?.name ||
    tc.assigneeId ||
    ""
  );
}

/**
 * The word shown in the Automation column.
 *
 * This used to be a "Type" column that read `tc.type` and fell back to
 * "Manual". A test case has no type — the column was showing automation status
 * under the wrong name, and only told two of its three states apart, so every
 * case waiting to be automated read as "Manual".
 */
export function automationLabelOf(tc: any): string {
  switch ((tc.automationStatus || "MANUAL").toUpperCase()) {
    case "AUTOMATED":
      return "Automated";
    case "TO_BE_AUTOMATED":
      return "To automate";
    default:
      return "Manual";
  }
}

/** What a column sorts on. Case numbers stay numeric so 9 lands before 10. */
export function caseSortValue(tc: any, key: CaseSortKey): number | string {
  switch (key) {
    case "id":
      return tc.sequenceNumber ?? 0;
    case "title":
      return (tc.title || "").toLowerCase();
    case "priority":
      return PRIORITY_RANK[(tc.priority || "").toUpperCase()] ?? 0;
    case "automation":
      // Ordered by how far along the case is, not alphabetically.
      return AUTOMATION_RANK[automationLabelOf(tc)] ?? 0;
    case "owner":
      return ownerLabel(tc).toLowerCase();
  }
}

export function compareCases(
  a: any,
  b: any,
  key: CaseSortKey,
  dir: CaseSortDir,
): number {
  const av = caseSortValue(a, key);
  const bv = caseSortValue(b, key);
  let cmp =
    typeof av === "number" && typeof bv === "number"
      ? av - bv
      : String(av).localeCompare(String(bv));
  // Equal rows fall back to case number, so re-sorting the same column twice
  // never reshuffles them.
  if (cmp === 0) cmp = (a.sequenceNumber ?? 0) - (b.sequenceNumber ?? 0);
  return dir === "asc" ? cmp : -cmp;
}
