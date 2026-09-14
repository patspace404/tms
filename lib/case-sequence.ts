import { Prisma } from "@prisma/client";

/**
 * Allocate the next per-project case sequence number — the N in "BCP-42".
 *
 * `Project.caseSequence` is the fast path: one atomic increment, which is what
 * keeps two concurrent creates from claiming the same number. But the counter
 * is only correct while every insert goes through here. Anything that writes a
 * `sequenceNumber` directly — the Qase migration, `scripts/load-ui-testcases.mjs`,
 * a hand-run SQL import — can leave the counter behind the rows it inserted.
 * When that happens the next increment hands back a number that already exists
 * and the create dies on `@@unique([projectId, sequenceNumber])`, forever: the
 * failed insert rolls the increment back too, so the counter never climbs past
 * the collision on its own.
 *
 * So take the increment, compare it against the highest row actually present,
 * and when the counter is behind, fast-forward it and persist the correction.
 * The project row is already locked by the increment above, so the read and the
 * catch-up write are safe against a concurrent create.
 *
 * Must be called inside a transaction — pass the transaction client.
 */
/**
 * Structural, not `Prisma.TransactionClient`: the client is extended (see
 * lib/prisma.ts) and its transaction client no longer matches that nominal
 * type. Naming the two operations actually used keeps this callable from
 * either client.
 */
type SequenceTx = {
  project: {
    update: (args: any) => Promise<any>;
  };
  testCase: {
    aggregate: (args: any) => Promise<any>;
  };
};

export async function allocateSequenceNumber(
  tx: SequenceTx,
  projectId: string,
): Promise<number> {
  const { caseSequence } = await tx.project.update({
    where: { id: projectId },
    data: { caseSequence: { increment: 1 } },
    select: { caseSequence: true },
  });

  const { _max } = await tx.testCase.aggregate({
    where: { projectId },
    _max: { sequenceNumber: true },
  });
  const afterHighestRow = (_max.sequenceNumber ?? 0) + 1;

  if (afterHighestRow <= caseSequence) return caseSequence;

  await tx.project.update({
    where: { id: projectId },
    data: { caseSequence: afterHighestRow },
  });
  return afterHighestRow;
}
