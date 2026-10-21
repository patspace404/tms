import { beforeEach, describe, expect, it, vi } from "vitest";

const projectMock = vi.hoisted(() => ({ findUnique: vi.fn() }));
const suiteMock = vi.hoisted(() => ({ create: vi.fn() }));
const caseMock = vi.hoisted(() => ({ create: vi.fn() }));
const txMock = vi.hoisted(() => vi.fn());
const sessionMock = vi.hoisted(() => vi.fn());
const roleMock = vi.hoisted(() => vi.fn());
const allocateMock = vi.hoisted(() => vi.fn());
const auditMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: { project: projectMock, $transaction: txMock },
}));
vi.mock("next-auth/next", () => ({ getServerSession: sessionMock }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/project-auth", () => ({ requireProjectRole: roleMock }));
vi.mock("@/lib/case-sequence", () => ({ allocateSequenceNumber: allocateMock }));
vi.mock("@/lib/audit-logger", () => ({ logAudit: auditMock }));

import { POST } from "@/app/api/projects/[code]/import/route";

const params = (code = "PKL") => ({ params: Promise.resolve({ code }) });
const req = (body: unknown) =>
  new Request("http://qmaster.test/api/projects/PKL/import", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const twoCases = {
  payload: {
    suites: [
      {
        title: "Login",
        cases: [
          { title: "valid creds", steps: [{ action: "open", expected_result: "ok" }] },
          { title: "bad creds" },
        ],
      },
    ],
  },
};

describe("POST /api/projects/[code]/import", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    projectMock.findUnique.mockResolvedValue({ id: "proj-1", code: "PKL" });
    sessionMock.mockResolvedValue({ user: { id: "user-1", role: "EDITOR" } });
    roleMock.mockResolvedValue(true);
    suiteMock.create.mockResolvedValue({ id: "suite-new" });
    caseMock.create.mockResolvedValue({ id: "case-new" });
    // Each call hands back the next number, as the real allocator does.
    let n = 0;
    allocateMock.mockImplementation(async () => ++n);
    txMock.mockImplementation(async (fn: any) =>
      fn({ testSuite: suiteMock, testCase: caseMock }),
    );
  });

  it("gives every imported case its own number", async () => {
    // Without this each case took the column default of 0 and the second one
    // collided on @@unique([projectId, sequenceNumber]), rolling back the whole
    // import — the file simply would not load.
    const res = await POST(req(twoCases), params());

    expect(res.status).toBe(200);
    const numbers = caseMock.create.mock.calls.map((c) => c[0].data.sequenceNumber);
    expect(numbers).toEqual([1, 2]);
    expect(new Set(numbers).size).toBe(numbers.length);
  });

  it("reports how much it took in", async () => {
    const body = await (await POST(req(twoCases), params())).json();
    expect(body).toMatchObject({ success: true, cases: 2, suites: 1 });
  });

  it("records the import in the audit log", async () => {
    await POST(req(twoCases), params());
    expect(auditMock).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: "proj-1", userId: "user-1", action: "CREATED" }),
    );
  });

  it("refuses an anonymous caller", async () => {
    // The middleware requires a session; this is the route's own check, which
    // did not exist. The role test below is the one that actually mattered.
    sessionMock.mockResolvedValue(null);

    const res = await POST(req(twoCases), params());

    expect(res.status).toBe(401);
    expect(txMock).not.toHaveBeenCalled();
  });

  it("refuses someone without edit rights on the project", async () => {
    roleMock.mockResolvedValue(false);
    sessionMock.mockResolvedValue({ user: { id: "user-9", role: "USER" } });

    const res = await POST(req(twoCases), params());

    expect(res.status).toBe(403);
    expect(txMock).not.toHaveBeenCalled();
  });

  it("lets a workspace admin through without a project membership", async () => {
    roleMock.mockResolvedValue(false);
    sessionMock.mockResolvedValue({ user: { id: "boss", role: "ADMIN" } });

    expect((await POST(req(twoCases), params())).status).toBe(200);
  });

  it("rejects a file that is not the expected shape", async () => {
    const res = await POST(req({ payload: { nope: true } }), params());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/suites/i);
  });

  it("404s for a project that does not exist", async () => {
    projectMock.findUnique.mockResolvedValue(null);
    expect((await POST(req(twoCases), params())).status).toBe(404);
  });

  it("nests child suites under the suite that holds them", async () => {
    await POST(
      req({
        payload: {
          suites: [{ title: "parent", suites: [{ title: "child", cases: [] }] }],
        },
      }),
      params(),
    );

    const [parent, child] = suiteMock.create.mock.calls.map((c) => c[0].data);
    expect(parent).toMatchObject({ title: "parent", parentId: null });
    expect(child).toMatchObject({ title: "child", parentId: "suite-new" });
  });
});
