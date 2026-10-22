import { beforeEach, describe, expect, it, vi } from "vitest";

const runResultMock = vi.hoisted(() => ({
  findUnique: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { testRunResult: runResultMock },
}));

// The closed-run guard has its own tests; here it only needs to let the
// script through.
vi.mock("@/lib/run-open", () => ({
  requireOpenRun: vi.fn(async () => ({ ok: true, run: { id: "run1", status: "ACTIVE" } })),
  isRunOpen: () => true,
  RUN_CLOSED_MESSAGE: "closed",
}));

// Mock fs and child_process to avoid actual file writes and shell execution
vi.mock("fs", () => ({
  default: {
    writeFileSync: vi.fn(),
    unlinkSync: vi.fn(),
  },
}));

const execMock = vi.hoisted(() => vi.fn());
vi.mock("util", () => ({
  default: { promisify: () => execMock },
}));

import { POST } from "@/app/api/projects/[code]/runs/[runId]/results/[resultId]/execute/route";

const routeParams = (code: string, runId: string, resultId: string) => ({
  params: Promise.resolve({ code, runId, resultId }),
});

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/projects/FIN/runs/run-001/results/result-001/execute", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

const fakeResult = { id: "result-001", executionHistory: null };

describe("POST /runs/[runId]/results/[resultId]/execute", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runResultMock.findUnique.mockResolvedValue(fakeResult);
    runResultMock.update.mockResolvedValue(fakeResult);
  });

  it("returns 400 when script is missing", async () => {
    const res = await POST(jsonRequest({}), routeParams("FIN", "run-001", "result-001"));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/Script is required/);
    expect(execMock).not.toHaveBeenCalled();
  });

  it("marks result as PASSED when playwright exits successfully", async () => {
    execMock.mockResolvedValue({ stdout: "1 passed", stderr: "" });

    const res = await POST(
      jsonRequest({ script: "await page.goto('/')" }),
      routeParams("FIN", "run-001", "result-001")
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.passed).toBe(true);
    expect(runResultMock.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "PASSED" }) })
    );
  });

  it("marks result as FAILED when playwright exits with non-zero", async () => {
    execMock.mockRejectedValue({ stdout: "", stderr: "1 failed", message: "Command failed" });

    const res = await POST(
      jsonRequest({ script: "await page.goto('/')" }),
      routeParams("FIN", "run-001", "result-001")
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.passed).toBe(false);
    expect(runResultMock.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "FAILED" }) })
    );
  });

  it("skips execution and returns disabled message in demo mode", async () => {
    process.env.NEXT_PUBLIC_IS_DEMO = "true";

    const res = await POST(
      jsonRequest({ script: "await page.goto('/')" }),
      routeParams("FIN", "run-001", "result-001")
    );
    const body = await res.json();

    expect(body.success).toBe(false);
    expect(body.logs).toMatch(/Demo Mode/);
    expect(execMock).not.toHaveBeenCalled();

    delete process.env.NEXT_PUBLIC_IS_DEMO;
  });

  it("wraps unwrapped script in a playwright test block before executing", async () => {
    execMock.mockResolvedValue({ stdout: "1 passed", stderr: "" });

    await POST(
      jsonRequest({ script: "await page.goto('/')" }),
      routeParams("FIN", "run-001", "result-001")
    );

    const fs = await import("fs");
    const writtenContent = (fs.default.writeFileSync as any).mock.calls[0][1] as string;
    expect(writtenContent).toContain("test('Automated Test Case'");
    expect(writtenContent).toContain("await page.goto('/')");
  });
});
