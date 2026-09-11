import { describe, expect, it, vi } from "vitest";

// The module reaches for Prisma and the S3 client at import time; neither is
// touched by the pure function under test.
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/s3", () => ({ s3Client: {}, S3_BUCKET: "test" }));

import { deriveStepVerdicts } from "@/lib/qase/sync";

describe("deriveStepVerdicts", () => {
  it("marks every step passed when the case passed and Qase recorded nothing", () => {
    // STSD-774's shape: the case has steps, Qase sent status 0 for all of them.
    const stepResults: Record<string, any> = {};
    const changed = deriveStepVerdicts("PASSED", stepResults, ["s1", "s2", "s3"]);

    expect(changed).toBe(true);
    expect(Object.keys(stepResults)).toHaveLength(3);
    for (const id of ["s1", "s2", "s3"]) {
      expect(stepResults[id]).toEqual({ status: "PASSED", derivedFrom: "case-result" });
    }
  });

  it("flags the inference so it is never mistaken for a recorded verdict", () => {
    const stepResults: Record<string, any> = {};
    deriveStepVerdicts("PASSED", stepResults, ["s1"]);
    expect(stepResults.s1.derivedFrom).toBe("case-result");
  });

  it("keeps notes and screenshots already attached to the step", () => {
    const stepResults: Record<string, any> = {
      s1: { actualResult: "looked right", attachments: [{ url: "/a.png", name: "a.png" }] },
    };
    deriveStepVerdicts("PASSED", stepResults, ["s1"]);

    expect(stepResults.s1.actualResult).toBe("looked right");
    expect(stepResults.s1.attachments).toHaveLength(1);
    expect(stepResults.s1.status).toBe("PASSED");
  });

  it.each(["FAILED", "BLOCKED", "SKIPPED", "INVALID", "IN_PROGRESS"])(
    "infers nothing for a %s case — the data never says which step broke",
    (status) => {
      const stepResults: Record<string, any> = {};
      expect(deriveStepVerdicts(status, stepResults, ["s1", "s2"])).toBe(false);
      expect(stepResults).toEqual({});
    },
  );

  it("leaves a partially stamped case alone rather than finishing someone's work", () => {
    const stepResults: Record<string, any> = { s1: { status: "PASSED" } };
    expect(deriveStepVerdicts("PASSED", stepResults, ["s1", "s2"])).toBe(false);
    expect(stepResults.s2).toBeUndefined();
  });

  it("does nothing when the case has no steps", () => {
    const stepResults: Record<string, any> = {};
    expect(deriveStepVerdicts("PASSED", stepResults, [])).toBe(false);
    expect(stepResults).toEqual({});
  });

  it("does nothing when the case status is unknown", () => {
    const stepResults: Record<string, any> = {};
    expect(deriveStepVerdicts(undefined, stepResults, ["s1"])).toBe(false);
  });
});
