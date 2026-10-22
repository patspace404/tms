import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const testRunResultMock = vi.hoisted(() => ({ findUnique: vi.fn(), update: vi.fn() }));
const execMock = vi.hoisted(() => vi.fn());
const fsMock = vi.hoisted(() => ({ writeFileSync: vi.fn(), unlinkSync: vi.fn() }));

vi.mock("@/lib/prisma", () => ({ prisma: { testRunResult: testRunResultMock } }));
vi.mock("@/lib/run-open", () => ({
  requireOpenRun: vi.fn(async () => ({ ok: true, run: { id: "run1", status: "ACTIVE" } })),
  isRunOpen: () => true,
  RUN_CLOSED_MESSAGE: "closed",
}));
vi.mock("child_process", () => ({ exec: vi.fn() }));
vi.mock("util", () => ({ default: { promisify: () => execMock }, promisify: () => execMock }));
vi.mock("fs", () => ({ default: fsMock, ...fsMock }));

import { POST } from "@/app/api/projects/[code]/runs/[runId]/results/[resultId]/execute/route";

const routeParams = (code: string, runId: string, resultId: string) => ({
  params: Promise.resolve({ code, runId, resultId }),
});

const makeRequest = (body: unknown) =>
  new Request("http://localhost/api/projects/proj/runs/run1/results/r1/execute", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

describe("POST /api/projects/[code]/runs/[runId]/results/[resultId]/execute", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testRunResultMock.findUnique.mockResolvedValue({ id: "r1", executionHistory: [] });
    testRunResultMock.update.mockResolvedValue({});
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_IS_DEMO;
  });

  it("returns 400 when script is missing", async () => {
    const req = makeRequest({});
    const res = await POST(req, routeParams("proj", "run1", "r1"));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("Script is required");
    expect(execMock).not.toHaveBeenCalled();
  });

  it("returns demo mode response and skips exec when NEXT_PUBLIC_IS_DEMO=true", async () => {
    process.env.NEXT_PUBLIC_IS_DEMO = "true";

    const req = makeRequest({ script: "await page.goto('https://example.com');" });
    const res = await POST(req, routeParams("proj", "run1", "r1"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(false);
    expect(json.passed).toBe(false);
    expect(json.logs).toBe("Execution skipped (Demo Mode)");
    expect(execMock).not.toHaveBeenCalled();
    expect(fsMock.writeFileSync).not.toHaveBeenCalled();
  });

  it("returns passed=true when playwright exits successfully", async () => {
    execMock.mockResolvedValue({ stdout: "1 passed", stderr: "" });

    const req = makeRequest({ script: "test('my test', async ({ page }) => { await page.goto('https://example.com'); });" });
    const res = await POST(req, routeParams("proj", "run1", "r1"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.passed).toBe(true);
    expect(json.logs).toContain("1 passed");
    expect(testRunResultMock.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "r1" },
        data: expect.objectContaining({ status: "PASSED" }),
      })
    );
  });

  it("returns passed=false when playwright exits with error", async () => {
    execMock.mockRejectedValue({
      stdout: "0 passed, 1 failed",
      stderr: "Error: Test failed",
      message: "Process exited with code 1",
    });

    const req = makeRequest({ script: "test('my test', async ({ page }) => { await page.goto('https://example.com'); });" });
    const res = await POST(req, routeParams("proj", "run1", "r1"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.passed).toBe(false);
    expect(json.logs).toContain("0 passed, 1 failed");
    expect(testRunResultMock.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "r1" },
        data: expect.objectContaining({ status: "FAILED" }),
      })
    );
  });

  it("wraps bare script in a test() block before writing to file", async () => {
    execMock.mockResolvedValue({ stdout: "1 passed", stderr: "" });

    const bareScript = "await page.goto('https://example.com');";
    const req = makeRequest({ script: bareScript });
    await POST(req, routeParams("proj", "run1", "r1"));

    expect(fsMock.writeFileSync).toHaveBeenCalledOnce();
    const writtenContent: string = fsMock.writeFileSync.mock.calls[0][1] as string;
    expect(writtenContent).toContain("test(");
    expect(writtenContent).toContain("import { test, expect } from '@playwright/test'");
    expect(writtenContent).toContain(bareScript);
  });
});
