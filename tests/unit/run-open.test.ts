import { beforeEach, describe, expect, it, vi } from "vitest";

const runMock = vi.hoisted(() => ({ findFirst: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { testRun: runMock } }));

import { isRunOpen, requireOpenRun, RUN_CLOSED_MESSAGE } from "@/lib/run-open";

describe("isRunOpen", () => {
  it("only an active run takes result changes", () => {
    expect(isRunOpen("ACTIVE")).toBe(true);
  });

  it("a completed or aborted run does not", () => {
    // Both are settled: the numbers have been reported and read.
    expect(isRunOpen("COMPLETED")).toBe(false);
    expect(isRunOpen("ABORTED")).toBe(false);
  });

  it("treats a missing status as closed rather than open", () => {
    // Failing open here would let a caller through on a lookup that returned
    // nothing useful, which is the wrong way round.
    expect(isRunOpen(null)).toBe(false);
    expect(isRunOpen(undefined)).toBe(false);
    expect(isRunOpen("")).toBe(false);
  });
});

describe("requireOpenRun", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lets an active run through", async () => {
    runMock.findFirst.mockResolvedValue({ id: "run-1", status: "ACTIVE" });
    await expect(requireOpenRun("run-1")).resolves.toMatchObject({ ok: true });
  });

  it("refuses a completed run with 409 and says how to proceed", async () => {
    runMock.findFirst.mockResolvedValue({ id: "run-1", status: "COMPLETED" });

    const out = await requireOpenRun("run-1");

    expect(out).toMatchObject({ ok: false, status: 409 });
    expect((out as any).error).toBe(RUN_CLOSED_MESSAGE);
    expect((out as any).error).toMatch(/reopen/i);
  });

  it("refuses an aborted run the same way", async () => {
    runMock.findFirst.mockResolvedValue({ id: "run-1", status: "ABORTED" });
    await expect(requireOpenRun("run-1")).resolves.toMatchObject({ ok: false, status: 409 });
  });

  it("404s when the run does not exist", async () => {
    runMock.findFirst.mockResolvedValue(null);
    await expect(requireOpenRun("nope")).resolves.toMatchObject({ ok: false, status: 404 });
  });

  it("scopes the lookup to the project when one is given", async () => {
    // Otherwise a run id from another project would pass the check.
    runMock.findFirst.mockResolvedValue({ id: "run-1", status: "ACTIVE" });

    await requireOpenRun("run-1", "proj-9");

    expect(runMock.findFirst.mock.calls[0][0].where).toMatchObject({
      id: "run-1",
      projectId: "proj-9",
    });
  });

  it("does not filter by project when none is given", async () => {
    runMock.findFirst.mockResolvedValue({ id: "run-1", status: "ACTIVE" });
    await requireOpenRun("run-1");
    expect(runMock.findFirst.mock.calls[0][0].where).not.toHaveProperty("projectId");
  });
});
