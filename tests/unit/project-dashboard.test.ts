import { beforeEach, describe, expect, it, vi } from "vitest";

const projectMock = vi.hoisted(() => ({ findUnique: vi.fn() }));
const testCaseMock = vi.hoisted(() => ({ count: vi.fn() }));
const testRunMock = vi.hoisted(() => ({ count: vi.fn(), findMany: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: projectMock,
    testCase: testCaseMock,
    testRun: testRunMock,
  },
}));

import { GET } from "@/app/api/projects/[code]/dashboard/route";

const routeParams = (code: string) => ({ params: Promise.resolve({ code }) });

const makeProject = (overrides = {}) => ({
  id: "project-1",
  code: "PROJ",
  name: "Test Project",
  _count: { suites: 4, testCases: 18, testRuns: 7 },
  ...overrides,
});

const setupDefaultMocks = () => {
  projectMock.findUnique.mockResolvedValue(makeProject());
  testCaseMock.count
    .mockResolvedValueOnce(5)   // automated
    .mockResolvedValueOnce(10)  // manual
    .mockResolvedValueOnce(3);  // toBeAutomated
  testRunMock.count.mockResolvedValue(2); // activeRuns
  testRunMock.findMany.mockResolvedValue([]);
};

describe("GET /api/projects/[code]/dashboard", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 404 when project is not found", async () => {
    projectMock.findUnique.mockResolvedValue(null);

    const response = await GET(new Request("http://localhost/api/projects/MISSING/dashboard"), routeParams("MISSING"));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toEqual({ error: "Project not found" });
  });

  it("returns 200 with correct metrics structure", async () => {
    setupDefaultMocks();

    const response = await GET(new Request("http://localhost/api/projects/PROJ/dashboard"), routeParams("PROJ"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.metrics).toEqual({
      totalSuites: 4,
      totalCases: 18,
      totalRuns: 7,
      activeRuns: 2,
    });
  });

  it("returns automation object with correct counts", async () => {
    setupDefaultMocks();

    const response = await GET(new Request("http://localhost/api/projects/PROJ/dashboard"), routeParams("PROJ"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.automation).toEqual({
      automated: 5,
      manual: 10,
      toBeAutomated: 3,
    });
  });

  it("formats recentRuns with correct metrics", async () => {
    projectMock.findUnique.mockResolvedValue(makeProject());
    testCaseMock.count
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(10)
      .mockResolvedValueOnce(3);
    testRunMock.count.mockResolvedValue(2);
    testRunMock.findMany.mockResolvedValue([
      {
        id: "run-1",
        title: "Sprint 1 Run",
        status: "COMPLETED",
        createdAt: new Date("2026-06-01T10:00:00Z"),
        results: [
          { status: "PASSED" },
          { status: "PASSED" },
          { status: "FAILED" },
          { status: "BLOCKED" },
          { status: "SKIPPED" },
          { status: "INVALID" },
          // "UNTESTED" used to be here, but TestResultStatus is a Postgres
          // enum of PASSED/FAILED/BLOCKED/SKIPPED/IN_PROGRESS/INVALID — the
          // database rejects anything else, so no row can ever carry it.
          // INVALID takes its place and covers the case that does exist.
          { status: "IN_PROGRESS" },
        ],
      },
    ]);

    const response = await GET(new Request("http://localhost/api/projects/PROJ/dashboard"), routeParams("PROJ"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.recentRuns).toHaveLength(1);
    expect(body.recentRuns[0]).toMatchObject({
      id: "run-1",
      title: "Sprint 1 Run",
      status: "COMPLETED",
      metrics: {
        total: 7,
        passed: 2,
        failed: 1,
        blocked: 1,
        skipped: 1,
        invalid: 1,
        // Only IN_PROGRESS is untested; skipped and invalid are verdicts.
        untested: 1,
        decided: 6,
      },
    });
  });

  it("returns empty recentRuns array when there are no runs", async () => {
    setupDefaultMocks();
    testRunMock.findMany.mockResolvedValue([]);

    const response = await GET(new Request("http://localhost/api/projects/PROJ/dashboard"), routeParams("PROJ"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.recentRuns).toEqual([]);
  });

  it("returns 500 when the database throws an error", async () => {
    projectMock.findUnique.mockRejectedValue(new Error("DB connection failed"));

    const response = await GET(new Request("http://localhost/api/projects/PROJ/dashboard"), routeParams("PROJ"));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ error: "Failed to fetch dashboard metrics" });
  });
});
