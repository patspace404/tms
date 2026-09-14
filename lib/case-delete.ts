import { prisma, prismaRaw } from "@/lib/prisma";
import { logAudit } from "@/lib/audit-logger";

/**
 * Deleting test cases, reversibly.
 *
 * Cases used to be removed outright, by three endpoints that disagreed about
 * authorisation and only one of which wrote an audit entry. Two batches went
 * missing in a single week and the only reason they came back is that Qase
 * still held them — which stops being true the day the team finishes moving
 * off it.
 *
 * So a delete now stamps `deletedAt` and the reads in lib/prisma.ts hide the
 * row. Nothing is lost, the trash shows exactly what went and who took it, and
 * a purge is a separate, deliberate act.
 */

export type CaseDeleteActor = { userId: string };

/** Soft-delete cases that belong to this project. Returns how many moved. */
export async function softDeleteCases(
  projectId: string,
  caseIds: string[],
  actor: CaseDeleteActor,
): Promise<number> {
  if (caseIds.length === 0) return 0;

  // Titles first: after the update the audit entry would have to name rows the
  // default client can no longer see.
  const cases = await prisma.testCase.findMany({
    where: { id: { in: caseIds }, projectId },
    select: { id: true, title: true },
  });
  if (cases.length === 0) return 0;

  const { count } = await prisma.testCase.updateMany({
    where: { id: { in: cases.map((c) => c.id) }, projectId },
    data: { deletedAt: new Date(), deletedById: actor.userId },
  });

  await logAudit({
    projectId,
    userId: actor.userId,
    action: "DELETED",
    entity: "TEST_CASE",
    entityId: cases.length === 1 ? cases[0].id : undefined,
    details:
      cases.length === 1
        ? `Moved test case to trash: ${cases[0].title}`
        : `Moved ${cases.length} test cases to trash: ${cases
            .slice(0, 5)
            .map((c) => c.title)
            .join(", ")}${cases.length > 5 ? `, +${cases.length - 5} more` : ""}`,
  });

  return count;
}

/** Put soft-deleted cases back. Uses the raw client — the default one hides them. */
export async function restoreCases(
  projectId: string,
  caseIds: string[],
  actor: CaseDeleteActor,
): Promise<number> {
  if (caseIds.length === 0) return 0;

  const cases = await prismaRaw.testCase.findMany({
    where: { id: { in: caseIds }, projectId, deletedAt: { not: null } },
    select: { id: true, title: true },
  });
  if (cases.length === 0) return 0;

  const { count } = await prismaRaw.testCase.updateMany({
    where: { id: { in: cases.map((c) => c.id) }, projectId },
    data: { deletedAt: null, deletedById: null },
  });

  await logAudit({
    projectId,
    userId: actor.userId,
    action: "UPDATED",
    entity: "TEST_CASE",
    entityId: cases.length === 1 ? cases[0].id : undefined,
    details:
      cases.length === 1
        ? `Restored test case from trash: ${cases[0].title}`
        : `Restored ${cases.length} test cases from trash`,
  });

  return count;
}

/**
 * Remove cases for good. Only ever touches rows already in the trash, so a
 * purge cannot reach a live case even if the wrong id is passed.
 */
export async function purgeCases(
  projectId: string,
  caseIds: string[],
  actor: CaseDeleteActor,
): Promise<number> {
  if (caseIds.length === 0) return 0;

  const cases = await prismaRaw.testCase.findMany({
    where: { id: { in: caseIds }, projectId, deletedAt: { not: null } },
    select: { id: true, title: true },
  });
  if (cases.length === 0) return 0;

  const { count } = await prismaRaw.testCase.deleteMany({
    where: { id: { in: cases.map((c) => c.id) }, projectId, deletedAt: { not: null } },
  });

  await logAudit({
    projectId,
    userId: actor.userId,
    action: "DELETED",
    entity: "TEST_CASE",
    entityId: cases.length === 1 ? cases[0].id : undefined,
    details:
      cases.length === 1
        ? `Permanently deleted test case: ${cases[0].title}`
        : `Permanently deleted ${cases.length} test cases`,
  });

  return count;
}

/** What is in a project's trash, newest first. */
export async function listTrashedCases(projectId: string) {
  return prismaRaw.testCase.findMany({
    where: { projectId, deletedAt: { not: null } },
    select: {
      id: true,
      title: true,
      sequenceNumber: true,
      deletedAt: true,
      deletedById: true,
      suite: { select: { title: true } },
    },
    orderBy: { deletedAt: "desc" },
  });
}
