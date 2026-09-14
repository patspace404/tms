import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const globalForPrisma = global as unknown as {
  prisma: ReturnType<typeof buildClient>;
  prismaRaw: PrismaClient;
};

/**
 * Hide soft-deleted test cases from every read.
 *
 * There are 53 places that query TestCase; filtering each by hand means one of
 * them eventually forgets, and a deleted case reappears in a list, an export,
 * or the picker you build a run from. Doing it in the client means it cannot be
 * forgotten.
 *
 * `findUnique` cannot carry a non-unique filter, so it becomes `findFirst` —
 * the documented way to make unique lookups respect a soft-delete flag.
 *
 * Use `prismaRaw` when you genuinely need the deleted rows: the trash view, and
 * the Qase sync, which has to *see* a deleted case to know not to recreate it.
 */
function buildClient(base: PrismaClient) {
  return base.$extends({
    name: 'hide-deleted-test-cases',
    query: {
      testCase: {
        async findUnique({ args, query }) {
          return (query as any)({
            ...args,
            where: { ...args.where, deletedAt: null },
          });
        },
        async findUniqueOrThrow({ args, query }) {
          return (query as any)({
            ...args,
            where: { ...args.where, deletedAt: null },
          });
        },
        async findFirst({ args, query }) {
          return query({ ...args, where: { ...args.where, deletedAt: null } });
        },
        async findFirstOrThrow({ args, query }) {
          return query({ ...args, where: { ...args.where, deletedAt: null } });
        },
        async findMany({ args, query }) {
          return query({ ...args, where: { ...args.where, deletedAt: null } });
        },
        async count({ args, query }) {
          return query({ ...args, where: { ...args.where, deletedAt: null } });
        },
        async aggregate({ args, query }) {
          return query({ ...args, where: { ...args.where, deletedAt: null } });
        },
        async groupBy({ args, query }) {
          return query({ ...args, where: { ...args.where, deletedAt: null } });
        },
        async updateMany({ args, query }) {
          return query({ ...args, where: { ...args.where, deletedAt: null } });
        },
      },
    },
  });
}

// findUnique is rewritten to findFirst by the extension above; Prisma routes it
// there when the where clause carries a non-unique field.
let prismaRaw: PrismaClient;

if (!globalForPrisma.prismaRaw) {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  prismaRaw = new PrismaClient({ adapter });
} else {
  prismaRaw = globalForPrisma.prismaRaw;
}

const prisma = globalForPrisma.prisma ?? buildClient(prismaRaw);

export { prisma, prismaRaw };

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prismaRaw = prismaRaw;
  globalForPrisma.prisma = prisma;
}
