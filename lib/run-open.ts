import { prisma } from "@/lib/prisma";

/**
 * A run stops accepting results once it is closed.
 *
 * COMPLETED and ABORTED are both settled: the numbers have been reported,
 * someone has read them, and a verdict changed afterwards rewrites history
 * nobody is looking at any more. The public API has refused this since it was
 * written; the app's own endpoints did not, so the same edit was blocked
 * through one door and allowed through another.
 *
 * Reopening is a deliberate act — PATCH the run back to ACTIVE — and that is
 * what the message points at.
 */
export const RUN_CLOSED_MESSAGE =
  "This run is closed. Reopen it before changing results.";

export type RunOpenCheck =
  | { ok: true; run: { id: string; status: string } }
  | { ok: false; status: 404 | 409; error: string };

/** Whether this run can still take result changes. */
export async function requireOpenRun(
  runId: string,
  /** Optional: also confirm the run belongs to this project. */
  projectId?: string,
): Promise<RunOpenCheck> {
  const run = await prisma.testRun.findFirst({
    where: { id: runId, ...(projectId ? { projectId } : {}) },
    select: { id: true, status: true },
  });

  if (!run) return { ok: false, status: 404, error: "Run not found." };
  if (run.status !== "ACTIVE") {
    return { ok: false, status: 409, error: RUN_CLOSED_MESSAGE };
  }
  return { ok: true, run };
}

/** True when the run's status allows results to be edited. */
export function isRunOpen(status: string | null | undefined): boolean {
  return status === "ACTIVE";
}
