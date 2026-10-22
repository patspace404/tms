/**
 * Whether a run still accepts result changes — the rule on its own.
 *
 * Separate from lib/run-open.ts because that one opens a database connection,
 * and the run screen is a client component. Importing the rule from there
 * dragged Prisma, and then `pg`, into the browser bundle; the build failed on
 * `Can't resolve 'dns'`. Nothing in this file imports anything.
 */

export const RUN_CLOSED_MESSAGE =
  "This run is closed. Reopen it before changing results.";

/**
 * COMPLETED and ABORTED are both settled. Anything that does not read ACTIVE —
 * including a status that is missing because a lookup returned nothing — counts
 * as closed, so a bad read refuses the edit rather than waving it through.
 */
export function isRunOpen(status: string | null | undefined): boolean {
  return status === "ACTIVE";
}
