import { describe, expect, it } from "vitest";
import { serializeResult } from "@/lib/api-v1-serializers";

/**
 * The read side of the step-ordering bug: GET returned step outcomes in
 * whatever order the stored JSON object happened to be keyed, which is not the
 * order the case runs them in. A client that read them and wrote them back
 * landed each value on a different step.
 */
const result = (stepResults: Record<string, any>, steps?: { id: string; position: number }[]) => ({
  id: "res-1",
  runId: "run-1",
  caseId: "case-1",
  status: "PASSED",
  stepResults,
  ...(steps ? { testCase: { steps } } : {}),
});

describe("serializeResult — step order", () => {
  const steps = [
    { id: "s1", position: 0 },
    { id: "s2", position: 1 },
    { id: "s3", position: 2 },
  ];

  it("returns steps in the case's order, not the stored key order", () => {
    // Stored back to front, as a JSON object keyed by uuid easily is.
    const out = serializeResult(
      result({ s3: { actualResult: "สาม" }, s1: { actualResult: "หนึ่ง" } }, steps),
    );

    expect(out.steps!.map((s: any) => s.step_id)).toEqual(["s1", "s2", "s3"]);
    expect(out.steps!.map((s: any) => s.actual_result)).toEqual(["หนึ่ง", null, "สาม"]);
  });

  it("carries the position, so a caller can check the order it got", () => {
    const out = serializeResult(result({ s1: {} }, steps));
    expect(out.steps!.map((s: any) => s.position)).toEqual([0, 1, 2]);
  });

  it("includes a step with no outcome rather than leaving a gap", () => {
    const out = serializeResult(result({ s2: { status: "PASSED" } }, steps));
    expect(out.steps).toHaveLength(3);
    expect(out.steps![0]).toMatchObject({ step_id: "s1", status: null });
    expect(out.steps![1]).toMatchObject({ step_id: "s2", status: "PASSED" });
  });

  it("keeps an outcome whose step was edited away, after the live ones", () => {
    const out = serializeResult(
      result({ s1: { status: "PASSED" }, "gone-step": { status: "FAILED" } }, steps),
    );

    expect(out.steps!.map((s: any) => s.step_id)).toEqual(["s1", "s2", "s3", "gone-step"]);
    // Nothing to place it against, so the position is not invented.
    expect(out.steps!.at(-1)).toMatchObject({ position: null, status: "FAILED" });
  });

  it("still returns the outcomes when the case's steps were not fetched", () => {
    const out = serializeResult(result({ s1: { status: "PASSED" } }));
    expect(out.steps).toHaveLength(1);
    expect(out.steps![0]).toMatchObject({ step_id: "s1", position: null });
  });

  it("omits steps entirely when nothing was ever recorded", () => {
    const out = serializeResult({ id: "r", runId: "run", caseId: "c", status: "IN_PROGRESS" });
    expect(out.steps).toBeUndefined();
  });
});
