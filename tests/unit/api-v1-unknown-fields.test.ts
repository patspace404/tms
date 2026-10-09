import { describe, expect, it } from "vitest";
import { rejectUnknownFields } from "@/lib/api-v1";

const body = async (res: Response | null) =>
  res ? ((await res.json()) as { status: boolean; error: string }) : null;

describe("rejectUnknownFields", () => {
  it("passes a body that only uses known fields", () => {
    expect(rejectUnknownFields({ case_id: 1, status: "PASSED" }, ["case_id", "status"])).toBeNull();
  });

  it("names the field it did not recognise", async () => {
    // The four names a migration tried in turn, each answered 201 and ignored.
    const res = rejectUnknownFields({ assigned_to: "nim" }, ["assignee_id"]);
    const json = await body(res);
    expect(res!.status).toBe(400);
    expect(json!.error).toContain("assigned_to");
  });

  it("lists what the endpoint does accept, so the next guess is not needed", async () => {
    const json = await body(rejectUnknownFields({ user_id: "x" }, ["assignee_id", "status"]));
    expect(json!.error).toContain("assignee_id");
    expect(json!.error).toContain("status");
  });

  it("reports every unknown field at once rather than one per round trip", async () => {
    const json = await body(
      rejectUnknownFields({ a: 1, b: 2 }, ["status"]),
    );
    expect(json!.error).toContain("a");
    expect(json!.error).toContain("b");
    expect(json!.error).toContain("fields");
  });

  it("treats an empty or missing body as nothing to complain about", () => {
    expect(rejectUnknownFields({}, ["status"])).toBeNull();
    expect(rejectUnknownFields(null, ["status"])).toBeNull();
    expect(rejectUnknownFields(undefined, ["status"])).toBeNull();
  });
});
