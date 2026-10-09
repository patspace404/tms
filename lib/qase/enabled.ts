/**
 * The master switch for pulling anything out of Qase.
 *
 * The migration to QMaster is winding down: the nightly reconciliation was
 * still importing suites and cases (70 in one night) on top of work the team
 * had since done here, so it was turned off. This is the same stop for the
 * other way in — the webhook — and for the backfill script, so re-enabling one
 * without the other is not possible.
 *
 * It fails closed. Sync happens only when someone deliberately sets
 * QASE_SYNC_ENABLED=true; anything else, including an unset variable, means no.
 * Wiring Qase back up is then a decision somebody makes, not something that
 * resumes because a webhook was left pointing here.
 */
export function qaseSyncEnabled(): boolean {
  return (process.env.QASE_SYNC_ENABLED || "").trim().toLowerCase() === "true";
}

/** What to tell a caller, and what to write in the event log. */
export const QASE_SYNC_DISABLED_MESSAGE =
  "Qase sync is turned off (QASE_SYNC_ENABLED is not true). The delivery was recorded but not applied.";
