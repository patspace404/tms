/**
 * Ordering for the test-case table.
 *
 * Lives here rather than in the list component so the comparisons that are easy
 * to get wrong — case numbers sorting as text, ties reshuffling on every
 * re-render — are pinned down by tests.
 */

export type CaseSortKey = "id" | "title" | "priority" | "type" | "owner";
export type CaseSortDir = "asc" | "desc";

const PRIORITY_RANK: Record<string, number> = { HIGH: 3, MEDIUM: 2, LOW: 1 };

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

/** The word shown in the Type column. */
export function typeLabelOf(tc: any): string {
  const t = (tc.type || "").toUpperCase();
  if (t === "NEGATIVE") return "Negative";
  if (t === "VISUAL") return "Visual";
  if (tc.automationStatus === "AUTOMATED") return "Automated";
  return tc.type ? "Functional" : "Manual";
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
    case "type":
      return typeLabelOf(tc).toLowerCase();
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
