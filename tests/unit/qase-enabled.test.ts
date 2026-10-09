import { afterEach, describe, expect, it } from "vitest";
import { qaseSyncEnabled } from "@/lib/qase/enabled";

const original = process.env.QASE_SYNC_ENABLED;

afterEach(() => {
  if (original === undefined) delete process.env.QASE_SYNC_ENABLED;
  else process.env.QASE_SYNC_ENABLED = original;
});

describe("qaseSyncEnabled", () => {
  it("is off when the variable is not set", () => {
    // The point of the switch: nothing resumes on its own.
    delete process.env.QASE_SYNC_ENABLED;
    expect(qaseSyncEnabled()).toBe(false);
  });

  it("is on only for an explicit true", () => {
    process.env.QASE_SYNC_ENABLED = "true";
    expect(qaseSyncEnabled()).toBe(true);
  });

  it("accepts the casing and stray whitespace an env file tends to pick up", () => {
    for (const v of ["TRUE", "True", " true ", "true\n"]) {
      process.env.QASE_SYNC_ENABLED = v;
      expect(qaseSyncEnabled()).toBe(true);
    }
  });

  it("treats anything else as off, including values that look affirmative", () => {
    // "1" and "yes" read as on to a person, so they are exactly the values
    // someone might set and then wrongly believe sync is running.
    for (const v of ["false", "", "0", "1", "yes", "on", "enabled"]) {
      process.env.QASE_SYNC_ENABLED = v;
      expect(qaseSyncEnabled()).toBe(false);
    }
  });
});
