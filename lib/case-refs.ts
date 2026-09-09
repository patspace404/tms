import { prisma } from "@/lib/prisma";

/**
 * Resolve the `cases` shorthand the public API accepts — a mix of case uuids
 * and sequence numbers (the 42 in "PRO-42") — to case ids in one project.
 *
 * Shared so that creating a run and later amending it agree on what a case
 * reference means; a ref that resolves when the run is created must resolve the
 * same way when a case is added to it.
 */
export async function resolveCaseRefs(
  projectId: string,
  refs: unknown[],
): Promise<{ ids: string[]; unresolved: unknown[] }> {
  const uuids = refs.filter((r): r is string => typeof r === "string" && !/^\d+$/.test(r));
  const seqs = refs
    .map((r) => Number(r))
    .filter((n) => Number.isInteger(n) && n > 0);

  const found = await prisma.testCase.findMany({
    where: {
      projectId,
      OR: [
        ...(uuids.length ? [{ id: { in: uuids } }] : []),
        ...(seqs.length ? [{ sequenceNumber: { in: seqs } }] : []),
      ],
    },
    select: { id: true, sequenceNumber: true },
  });

  const byId = new Set(found.map((c) => c.id));
  const bySeq = new Set(found.map((c) => c.sequenceNumber));
  const unresolved = refs.filter((r) => {
    const n = Number(r);
    if (Number.isInteger(n) && n > 0) return !bySeq.has(n);
    return typeof r === "string" ? !byId.has(r) : true;
  });

  return { ids: found.map((c) => c.id), unresolved };
}
