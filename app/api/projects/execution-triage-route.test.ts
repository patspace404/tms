import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { generateObject } from "ai";
import { prisma } from "@/lib/prisma";
import { POST as executeScript } from "@/app/api/projects/[code]/runs/[runId]/results/[resultId]/execute/route";
import { POST as triageFailure } from "@/app/api/projects/[code]/runs/[runId]/results/[resultId]/triage/route";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    testRunResult: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    workspaceSetting: {
      findMany: vi.fn(),
    },
    testRun: {
      findFirst: vi.fn(async () => ({ id: "run-1", status: "ACTIVE" })),
    },
  },
}));

// Executing a script writes a result, so the route checks the run is still
// open first. Refusal on a closed run is covered in tests/unit/run-open.test.ts.
vi.mock("@/lib/run-open", () => ({
  requireOpenRun: vi.fn(async () => ({ ok: true, run: { id: "run-1", status: "ACTIVE" } })),
  isRunOpen: () => true,
  RUN_CLOSED_MESSAGE: "closed",
}));

vi.mock("fs", () => ({
  default: {
    writeFileSync: vi.fn(),
    unlinkSync: vi.fn(),
  },
}));

vi.mock("child_process", () => ({
  exec: vi.fn((_command: string, _options: unknown, callback: (error: unknown, stdout: string, stderr: string) => void) => {
    callback(null, "passed output", "");
  }),
}));

vi.mock("util", async (importOriginal) => {
  const actual = await importOriginal<typeof import("util")>();
  return {
    ...actual,
    default: {
      ...actual,
      promisify:
        (fn: unknown) =>
        (...args: unknown[]) =>
          new Promise((resolve, reject) => {
            (fn as (...innerArgs: unknown[]) => void)(...args, (error: unknown, stdout: string, stderr: string) => {
              if (error) reject(error);
              else resolve({ stdout, stderr });
            });
          }),
    },
  };
});

vi.mock("ai", () => ({
  generateObject: vi.fn(),
}));

vi.mock("@ai-sdk/openai", () => ({
  createOpenAI: () => () => "openai-model",
}));

vi.mock("@ai-sdk/google", () => ({
  createGoogleGenerativeAI: () => () => "gemini-model",
}));

vi.mock("@ai-sdk/anthropic", () => ({
  createAnthropic: () => () => "claude-model",
}));

const resultFindUnique = prisma.testRunResult.findUnique as unknown as Mock;
const resultUpdate = prisma.testRunResult.update as unknown as Mock;
const settingsFindMany = prisma.workspaceSetting.findMany as unknown as Mock;
const mockedGenerateObject = vi.mocked(generateObject);

const params = {
  params: Promise.resolve({ code: "PRO", runId: "run-1", resultId: "result-1" }),
};
const req = (body: unknown) =>
  new Request("http://qmaster.test/api/projects/PRO/runs/run-1/results/result-1", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
const json = async (response: Response) => response.json() as Promise<Record<string, unknown>>;

describe("execution and triage routes", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    delete process.env.NEXT_PUBLIC_IS_DEMO;
    resultFindUnique.mockResolvedValue({ executionHistory: [] });
    resultUpdate.mockResolvedValue({});
    settingsFindMany.mockResolvedValue([{ key: "OPENAI_API_KEY", value: "test-key" }]);
    mockedGenerateObject.mockResolvedValue({
      object: {
        summary: "ปุ่ม Login ใช้งานไม่ได้",
        severity: "MAJOR",
        rootCause: "API response ผิด",
        description: "ระบบแสดง error หลัง submit",
        stepsToReproduce: ["เปิดหน้า Login", "กด Submit"],
      },
    } as never);
  });

  it("requires a script before attempting execution", async () => {
    const response = await executeScript(req({}), params);

    expect(response.status).toBe(400);
    expect(await json(response)).toEqual({ error: "Script is required" });
    expect(resultUpdate).not.toHaveBeenCalled();
  });

  it("short-circuits execution in demo mode without touching the database", async () => {
    process.env.NEXT_PUBLIC_IS_DEMO = "true";

    const response = await executeScript(req({ script: "await page.goto('/')" }), params);

    expect(response.status).toBe(200);
    expect(await json(response)).toMatchObject({
      success: false,
      passed: false,
      logs: "Execution skipped (Demo Mode)",
    });
    expect(resultUpdate).not.toHaveBeenCalled();
  });

  it("updates result status and execution history after a passing script", async () => {
    const response = await executeScript(req({ script: "await page.goto('/')" }), params);

    expect(response.status).toBe(200);
    expect(await json(response)).toMatchObject({ success: true, passed: true });
    expect(resultUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "result-1" },
        data: expect.objectContaining({
          status: "PASSED",
          executionHistory: [
            expect.objectContaining({
              status: "PASSED",
              logs: expect.stringContaining("passed output"),
            }),
          ],
        }),
      }),
    );
  });

  it("returns 404 when triage targets a missing result", async () => {
    resultFindUnique.mockResolvedValue(null);

    const response = await triageFailure(req({}), params);

    expect(response.status).toBe(404);
    expect(await json(response)).toEqual({ error: "Test result not found" });
    expect(mockedGenerateObject).not.toHaveBeenCalled();
  });

  it("requires configured provider keys before AI triage", async () => {
    settingsFindMany.mockResolvedValue([]);

    const response = await triageFailure(req({ modelProvider: "openai" }), params);

    expect(response.status).toBe(500);
    expect(await json(response)).toEqual({
      error: "OpenAI API Key is not configured in Workspace Settings.",
    });
  });

  it("returns structured AI triage output", async () => {
    resultFindUnique.mockResolvedValue({
      status: "FAILED",
      comment: "Expected dashboard to load",
      errorMessage: null,
      stepResults: {
        "step-1": { status: "FAILED", actualResult: "Spinner stayed visible" },
      },
      testCase: {
        title: "Dashboard loads",
        preconditions: "",
        steps: [{ id: "step-1", action: "Open dashboard", expectedResult: "Dashboard visible" }],
      },
      testRun: {
        title: "Smoke",
        environment: { title: "Staging" },
      },
    });

    const response = await triageFailure(req({ modelProvider: "openai" }), params);

    expect(response.status).toBe(200);
    expect(await json(response)).toMatchObject({ severity: "MAJOR" });
    expect(mockedGenerateObject).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "openai-model",
      }),
    );
  });
});
