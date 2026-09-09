import { describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { handler } from "@/lib/api-v1";

const req = new Request("http://localhost/api/v1/case/PRO", { method: "POST" });
const run = (err: unknown) =>
  handler(async () => {
    throw err;
  })(req, {});

const knownError = (code: string, meta?: Record<string, unknown>) =>
  new Prisma.PrismaClientKnownRequestError("boom", {
    code,
    clientVersion: "6.19.3",
    meta,
  });

describe("handler error mapping", () => {
  it("passes a successful response straight through", async () => {
    const res = await handler(async () => NextResponse.json({ ok: true }))(req, {});
    expect(res.status).toBe(200);
  });

  it("reports a unique violation as 409 and names the fields", async () => {
    // The BCP case-create failure: a stale caseSequence counter handing back a
    // sequenceNumber that already exists. Used to surface as a bare 500.
    const res = await run(knownError("P2002", { target: ["projectId", "sequenceNumber"] }));

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      status: false,
      error: "Unique constraint violated on: projectId, sequenceNumber.",
    });
  });

  it("handles a unique violation with no target metadata", async () => {
    const res = await run(knownError("P2002"));

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      status: false,
      error: "Unique constraint violated.",
    });
  });

  it("reports a foreign key violation as 422", async () => {
    const res = await run(knownError("P2003"));

    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ error: "Referenced record does not exist." });
  });

  it("reports a missing record as 404", async () => {
    const res = await run(knownError("P2025"));

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: "Record not found." });
  });

  it("still returns an opaque 500 for anything unrecognised", async () => {
    const res = await run(new Error("kaboom"));

    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ error: "Internal server error." });
  });
});
