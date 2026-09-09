// Loads the QMaster UI test cases (docs/ui-test-cases.md) into a QMaster project
// via Prisma, then writes e2e/case-map.json mapping doc IDs -> QMaster case IDs.
//
// Run:  node --env-file=.env scripts/load-ui-testcases.mjs
import { PrismaClient } from "@prisma/client";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const prisma = new PrismaClient();
const __dirname = dirname(fileURLToPath(import.meta.url));

// The 8 UI test cases from docs/ui-test-cases.md
const CASES = [
  { docId: "QMS-01", title: "Login with valid credentials",        priority: "HIGH",   severity: "CRITICAL" },
  { docId: "QMS-02", title: "Login with wrong password",           priority: "HIGH",   severity: "MAJOR" },
  { docId: "QMS-03", title: "Create a new project",                priority: "HIGH",   severity: "CRITICAL" },
  { docId: "QMS-04", title: "Open project and see test cases",     priority: "MEDIUM", severity: "NORMAL" },
  { docId: "QMS-05", title: "Create a new test case",              priority: "HIGH",   severity: "CRITICAL" },
  { docId: "QMS-06", title: "Edit an existing test case",          priority: "MEDIUM", severity: "NORMAL" },
  { docId: "QMS-07", title: "Create a test run and select cases",  priority: "HIGH",   severity: "MAJOR" },
  { docId: "QMS-08", title: "Logout from the system",              priority: "MEDIUM", severity: "NORMAL" },
];

async function main() {
  // 1. Need an admin as author
  const admin = await prisma.user.findFirst({ where: { role: "ADMIN" } });
  if (!admin) throw new Error("No ADMIN user found — run /api/setup first");

  // 2. Upsert the QMS project (reuse if it exists)
  let project = await prisma.project.findUnique({ where: { code: "QMS" } });
  if (!project) {
    project = await prisma.project.create({
      data: { name: "QMaster Self-Test", code: "QMS", description: "Dogfood UI test cases for QMaster" },
    });
    console.log(`Created project QMS (${project.id})`);
  } else {
    console.log(`Reusing project QMS (${project.id})`);
  }

  // 3. Clean previous UI-test data so the loader is re-runnable
  await prisma.testCase.deleteMany({ where: { projectId: project.id } });
  await prisma.testSuite.deleteMany({ where: { projectId: project.id } });

  // 4. One suite to hold the UI cases
  const suite = await prisma.testSuite.create({
    data: { title: "UI Test Suite", description: "Auth + Core CRUD", projectId: project.id },
  });

  // 5. Create each case, capturing the generated id
  const map = {};
  for (let i = 0; i < CASES.length; i++) {
    const c = CASES[i];
    const created = await prisma.testCase.create({
      data: {
        title: c.title,
        priority: c.priority,
        severity: c.severity,
        automationStatus: "AUTOMATED",
        projectId: project.id,
        suiteId: suite.id,
        authorId: admin.id,
        sequenceNumber: i + 1,
      },
    });
    map[c.docId] = {
      qmasterId: created.id,
      shortId: `QMS-${created.id.slice(0, 4)}`, // matches reporter webhook short-id resolution
      title: c.title,
    };
    console.log(`  ${c.docId} -> ${created.id}`);
  }

  // Keep the project's caseSequence counter in sync so the app's "create case"
  // route generates the next sequenceNumber without colliding with these.
  // Raise it to the highest row present rather than setting it to this run's
  // CASES.length — a second run, or cases added through the UI in between,
  // would otherwise push the counter backwards and every later create would
  // collide on @@unique([projectId, sequenceNumber]).
  const { _max } = await prisma.testCase.aggregate({
    where: { projectId: project.id },
    _max: { sequenceNumber: true },
  });
  await prisma.project.update({
    where: { id: project.id },
    data: { caseSequence: Math.max(_max.sequenceNumber ?? 0, CASES.length) },
  });

  // 6. Write the mapping for Playwright to consume
  const outPath = resolve(__dirname, "../e2e/case-map.json");
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify({ projectCode: "QMS", projectId: project.id, cases: map }, null, 2));
  console.log(`\nWrote ${outPath}`);
  console.log(`Loaded ${CASES.length} test cases into project QMS.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
