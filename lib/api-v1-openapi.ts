/**
 * The OpenAPI description of /api/v1.
 *
 * Written by hand, which is the honest trade: nothing here is derived from the
 * handlers, so it can drift. What stops it drifting silently is
 * tests/unit/api-v1-openapi.test.ts — it walks app/api/v1 for route files and
 * fails when an endpoint exists that this document does not describe, or the
 * other way round. Adding a route without describing it breaks the build.
 *
 * Served at /api/v1/openapi.json, with a reader at /api/v1/docs.
 */

const ENVELOPE_OK = (schema: object) => ({
  type: "object",
  required: ["status", "result"],
  properties: { status: { type: "boolean", const: true }, result: schema },
});

const listOf = (ref: string) =>
  ENVELOPE_OK({
    type: "object",
    properties: {
      total: { type: "integer", description: "Rows matching the filter, before paging." },
      count: { type: "integer" },
      filtered: { type: "integer" },
      limit: { type: "integer" },
      offset: { type: "integer" },
      entities: { type: "array", items: { $ref: `#/components/schemas/${ref}` } },
    },
  });

const one = (ref: string) => ENVELOPE_OK({ $ref: `#/components/schemas/${ref}` });

const json = (schema: object) => ({ content: { "application/json": { schema } } });

const PAGING = [
  {
    name: "limit",
    in: "query",
    schema: { type: "integer", default: 100, maximum: 100 },
  },
  { name: "offset", in: "query", schema: { type: "integer", default: 0 } },
];

const CODE_PARAM = {
  name: "code",
  in: "path",
  required: true,
  schema: { type: "string" },
  description: "Project code, e.g. PKL.",
};
const idParam = (name: string, description: string) => ({
  name,
  in: "path",
  required: true,
  schema: { type: "string" },
  description,
});

const ERRORS = {
  400: json({ $ref: "#/components/schemas/Error" }),
  401: json({ $ref: "#/components/schemas/Error" }),
  403: json({ $ref: "#/components/schemas/Error" }),
  404: json({ $ref: "#/components/schemas/Error" }),
  422: json({ $ref: "#/components/schemas/Error" }),
};
const withErrors = (ok: Record<string, unknown>) => ({
  ...ok,
  "400": { description: "A field in the body is not one this endpoint accepts.", ...ERRORS[400] },
  "401": { description: "Token missing, invalid, revoked or expired.", ...ERRORS[401] },
  "403": { description: "The token's user lacks the role for this.", ...ERRORS[403] },
  "404": { description: "Not found, or not visible to this token.", ...ERRORS[404] },
  "422": { description: "Validation failed.", ...ERRORS[422] },
});

const RESULT_STATUS = {
  type: "string",
  enum: ["PASSED", "FAILED", "BLOCKED", "SKIPPED", "INVALID", "IN_PROGRESS"],
};

export function buildOpenApiDocument(serverUrl = "https://tms.socket9.com/api/v1") {
  return {
    openapi: "3.1.0",
    info: {
      title: "QMaster REST API",
      version: "1.0.0",
      description:
        "Token-authenticated HTTP API for CI jobs and scripts, shaped like Qase's so " +
        "existing integrations port over with a base-URL and header change.\n\n" +
        "Every response carries a `status` boolean. A field this API does not act on " +
        "is rejected with 400 rather than accepted and ignored — a 2xx means the " +
        "change was applied.",
    },
    servers: [{ url: serverUrl }],
    security: [{ TokenHeader: [] }],
    tags: [
      { name: "Projects" },
      { name: "Members" },
      { name: "Suites" },
      { name: "Cases" },
      { name: "Runs" },
      { name: "Results" },
      { name: "Milestones" },
      { name: "Plans" },
      { name: "Environments" },
      { name: "Defects" },
      { name: "Attachments" },
    ],
    components: {
      securitySchemes: {
        TokenHeader: {
          type: "apiKey",
          in: "header",
          name: "Token",
          description:
            "Create one under your avatar menu → API tokens. The token acts as the " +
            "user who created it and inherits that user's project roles. " +
            "`Authorization: Bearer <token>` is accepted too.",
        },
      },
      schemas: {
        Error: {
          type: "object",
          required: ["status", "error"],
          properties: {
            status: { type: "boolean", const: false },
            error: { type: "string" },
          },
        },
        User: {
          type: "object",
          properties: {
            id: { type: "string" },
            name: { type: "string", nullable: true },
            email: { type: "string" },
          },
        },
        Member: {
          type: "object",
          properties: {
            id: { type: "string", description: "The id `assignee_id` takes." },
            name: { type: "string", nullable: true },
            email: { type: "string" },
            role: { type: "string", enum: ["VIEWER", "EDITOR", "ADMIN"] },
          },
        },
        Project: {
          type: "object",
          properties: {
            code: { type: "string" },
            title: { type: "string" },
            description: { type: "string", nullable: true },
            is_archived: { type: "boolean" },
            counts: {
              type: "object",
              properties: {
                cases: { type: "integer" },
                suites: { type: "integer" },
                runs: { type: "integer" },
              },
            },
            created_at: { type: "string", format: "date-time" },
          },
        },
        Suite: {
          type: "object",
          properties: {
            id: { type: "string" },
            title: { type: "string" },
            description: { type: "string", nullable: true },
            parent_id: { type: "string", nullable: true },
            position: { type: "integer" },
            cases_count: { type: "integer" },
            created_at: { type: "string", format: "date-time" },
            updated_at: { type: "string", format: "date-time" },
          },
        },
        Step: {
          type: "object",
          properties: {
            position: { type: "integer" },
            action: { type: "string" },
            expected_result: { type: "string", nullable: true },
          },
        },
        Case: {
          type: "object",
          properties: {
            id: { type: "string" },
            code: { type: "string", description: 'Human identifier, e.g. "PKL-42".' },
            position: { type: "integer", description: "The number in the code." },
            title: { type: "string" },
            description: { type: "string", nullable: true },
            preconditions: { type: "string", nullable: true },
            postconditions: { type: "string", nullable: true },
            severity: {
              type: "string",
              enum: ["NOT_SET", "BLOCKER", "CRITICAL", "MAJOR", "NORMAL", "MINOR", "TRIVIAL"],
            },
            priority: { type: "string", enum: ["NOT_SET", "HIGH", "MEDIUM", "LOW"] },
            automation: {
              type: "string",
              enum: ["MANUAL", "TO_BE_AUTOMATED", "AUTOMATED"],
            },
            suite_id: { type: "string", nullable: true },
            tags: { type: "array", items: { type: "string" } },
            steps: { type: "array", items: { $ref: "#/components/schemas/Step" } },
            author: { $ref: "#/components/schemas/User" },
            created_at: { type: "string", format: "date-time" },
            updated_at: { type: "string", format: "date-time" },
          },
        },
        CaseInput: {
          type: "object",
          required: ["title", "suite_id"],
          properties: {
            title: { type: "string" },
            description: { type: "string" },
            preconditions: { type: "string" },
            postconditions: { type: "string" },
            severity: { type: "string" },
            priority: { type: "string" },
            automation: { type: "string" },
            suite_id: { type: "string" },
            steps: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  action: { type: "string" },
                  expected_result: { type: "string" },
                },
              },
            },
          },
        },
        Run: {
          type: "object",
          properties: {
            id: { type: "string" },
            title: { type: "string" },
            description: { type: "string", nullable: true },
            status: { type: "string", enum: ["ACTIVE", "COMPLETED", "ABORTED"] },
            is_public: { type: "boolean" },
            plan_id: { type: "string", nullable: true },
            environment_id: { type: "string", nullable: true },
            milestone_id: { type: "string", nullable: true },
            stats: {
              type: "object",
              description: "Total, plus a count per status on the single-run read.",
              additionalProperties: { type: "integer" },
            },
            author: { $ref: "#/components/schemas/User" },
            created_at: { type: "string", format: "date-time" },
            updated_at: { type: "string", format: "date-time" },
          },
        },
        ResultStep: {
          type: "object",
          properties: {
            step_id: { type: "string" },
            position: {
              type: "integer",
              nullable: true,
              description:
                "Zero-based position in the case. Null for an outcome whose step was " +
                "edited away — those come last.",
            },
            status: { ...RESULT_STATUS, nullable: true },
            actual_result: { type: "string", nullable: true },
            attachments: {
              type: "array",
              items: {
                type: "object",
                properties: { name: { type: "string" }, url: { type: "string" } },
              },
            },
          },
        },
        Result: {
          type: "object",
          properties: {
            id: { type: "string" },
            run_id: { type: "string" },
            case_id: { type: "string" },
            status: RESULT_STATUS,
            time_spent_ms: { type: "integer", nullable: true },
            comment: { type: "string", nullable: true },
            error_message: { type: "string", nullable: true },
            steps: {
              type: "array",
              description: "In the case's own order.",
              items: { $ref: "#/components/schemas/ResultStep" },
            },
            attachments: { type: "array", items: { type: "object" } },
            assignee: { $ref: "#/components/schemas/User" },
            created_at: { type: "string", format: "date-time" },
            updated_at: { type: "string", format: "date-time" },
          },
        },
        ResultInput: {
          type: "object",
          required: ["case_id", "status"],
          additionalProperties: false,
          properties: {
            case_id: {
              oneOf: [{ type: "string" }, { type: "integer" }],
              description: "Case uuid, or its number — the 42 in PKL-42.",
            },
            case: { description: "Alias for case_id." },
            status: RESULT_STATUS,
            comment: { type: "string" },
            error_message: { type: "string" },
            time_spent_ms: { type: "integer" },
            time_ms: { type: "integer", description: "Alias for time_spent_ms." },
            assignee_id: {
              type: "string",
              description:
                "Who ran the test. Setting it to anyone other than the token's own " +
                "user requires ADMIN on the project, and the id must belong to a " +
                "member — GET /member/{code} lists them. Without it the result is " +
                "assigned to the token's user.",
            },
            steps: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  step_id: {
                    type: "string",
                    description:
                      "Which step this is for. Preferred: it survives the case being " +
                      "reordered between the read and the write.",
                  },
                  position: { type: "integer", description: "Alternative to step_id." },
                  status: {
                    ...RESULT_STATUS,
                    nullable: true,
                    description:
                      'Omit to leave as-is. `null` or "UNTESTED" clears it, keeping ' +
                      "notes and evidence.",
                  },
                  actual_result: { type: "string" },
                  attachments: { type: "array", items: { type: "object" } },
                },
              },
            },
          },
        },
        Milestone: {
          type: "object",
          properties: {
            id: { type: "string" },
            title: { type: "string" },
            description: { type: "string", nullable: true },
            status: { type: "string" },
            due_date: { type: "string", format: "date-time", nullable: true },
            created_at: { type: "string", format: "date-time" },
            updated_at: { type: "string", format: "date-time" },
          },
        },
        Plan: {
          type: "object",
          properties: {
            id: { type: "string" },
            title: { type: "string" },
            description: { type: "string", nullable: true },
            cases_count: { type: "integer" },
            case_ids: { type: "array", items: { type: "string" } },
            created_at: { type: "string", format: "date-time" },
            updated_at: { type: "string", format: "date-time" },
          },
        },
        Environment: {
          type: "object",
          properties: {
            id: { type: "string" },
            title: { type: "string" },
            slug: { type: "string" },
            description: { type: "string", nullable: true },
            created_at: { type: "string", format: "date-time" },
          },
        },
        Defect: {
          type: "object",
          properties: {
            id: { type: "string" },
            provider: { type: "string" },
            key: { type: "string" },
            url: { type: "string" },
            summary: { type: "string" },
            status: { type: "string", nullable: true },
            severity: { type: "string", nullable: true },
            case_id: { type: "string", nullable: true },
            result_id: { type: "string", nullable: true },
            created_at: { type: "string", format: "date-time" },
          },
        },
      },
    },
    paths: {
      "/projects": {
        get: {
          tags: ["Projects"],
          summary: "Projects this token can see",
          parameters: [
            ...PAGING,
            { name: "archived", in: "query", schema: { type: "boolean" } },
          ],
          responses: withErrors({ "200": { description: "OK", ...json(listOf("Project")) } }),
        },
      },
      "/projects/{code}": {
        get: {
          tags: ["Projects"],
          summary: "One project",
          parameters: [CODE_PARAM],
          responses: withErrors({ "200": { description: "OK", ...json(one("Project")) } }),
        },
      },
      "/member/{code}": {
        get: {
          tags: ["Members"],
          summary: "Who is on the project, with the ids assignee_id takes",
          description:
            "Workspace admins are listed too: they hold every project without a " +
            "membership row and are valid assignees.",
          parameters: [CODE_PARAM, ...PAGING],
          responses: withErrors({ "200": { description: "OK", ...json(listOf("Member")) } }),
        },
      },
      "/suite/{code}": {
        get: {
          tags: ["Suites"],
          summary: "Suites in a project",
          parameters: [CODE_PARAM, ...PAGING],
          responses: withErrors({ "200": { description: "OK", ...json(listOf("Suite")) } }),
        },
        post: {
          tags: ["Suites"],
          summary: "Create a suite",
          parameters: [CODE_PARAM],
          requestBody: {
            required: true,
            ...json({
              type: "object",
              required: ["title"],
              properties: {
                title: { type: "string" },
                description: { type: "string" },
                parent_id: { type: "string", nullable: true },
              },
            }),
          },
          responses: withErrors({ "201": { description: "Created", ...json(one("Suite")) } }),
        },
      },
      "/suite/{code}/{id}": {
        get: {
          tags: ["Suites"],
          summary: "One suite",
          parameters: [CODE_PARAM, idParam("id", "Suite uuid.")],
          responses: withErrors({ "200": { description: "OK", ...json(one("Suite")) } }),
        },
        patch: {
          tags: ["Suites"],
          summary: "Update a suite",
          parameters: [CODE_PARAM, idParam("id", "Suite uuid.")],
          requestBody: {
            required: true,
            ...json({
              type: "object",
              properties: {
                title: { type: "string" },
                description: { type: "string" },
                parent_id: { type: "string", nullable: true },
              },
            }),
          },
          responses: withErrors({ "200": { description: "OK", ...json(one("Suite")) } }),
        },
        delete: {
          tags: ["Suites"],
          summary: "Delete a suite",
          parameters: [CODE_PARAM, idParam("id", "Suite uuid.")],
          responses: withErrors({ "200": { description: "Deleted" } }),
        },
      },
      "/case/{code}": {
        get: {
          tags: ["Cases"],
          summary: "Cases in a project",
          parameters: [
            CODE_PARAM,
            ...PAGING,
            { name: "suite_id", in: "query", schema: { type: "string" } },
            { name: "priority", in: "query", schema: { type: "string" } },
            { name: "severity", in: "query", schema: { type: "string" } },
            { name: "automation", in: "query", schema: { type: "string" } },
            { name: "search", in: "query", schema: { type: "string" } },
          ],
          responses: withErrors({ "200": { description: "OK", ...json(listOf("Case")) } }),
        },
        post: {
          tags: ["Cases"],
          summary: "Create a case",
          parameters: [CODE_PARAM],
          requestBody: {
            required: true,
            ...json({ $ref: "#/components/schemas/CaseInput" }),
          },
          responses: withErrors({ "201": { description: "Created", ...json(one("Case")) } }),
        },
      },
      "/case/{code}/{id}": {
        get: {
          tags: ["Cases"],
          summary: "One case",
          parameters: [CODE_PARAM, idParam("id", "Case uuid, or its number.")],
          responses: withErrors({ "200": { description: "OK", ...json(one("Case")) } }),
        },
        patch: {
          tags: ["Cases"],
          summary: "Update a case",
          parameters: [CODE_PARAM, idParam("id", "Case uuid, or its number.")],
          requestBody: { required: true, ...json({ $ref: "#/components/schemas/CaseInput" }) },
          responses: withErrors({ "200": { description: "OK", ...json(one("Case")) } }),
        },
        delete: {
          tags: ["Cases"],
          summary: "Move a case to the trash",
          parameters: [CODE_PARAM, idParam("id", "Case uuid, or its number.")],
          responses: withErrors({ "200": { description: "Deleted" } }),
        },
      },
      "/run/{code}": {
        get: {
          tags: ["Runs"],
          summary: "Runs in a project",
          parameters: [
            CODE_PARAM,
            ...PAGING,
            { name: "status", in: "query", schema: { type: "string" } },
          ],
          responses: withErrors({ "200": { description: "OK", ...json(listOf("Run")) } }),
        },
        post: {
          tags: ["Runs"],
          summary: "Create a run",
          description: "Omit `cases` to include every case in the project.",
          parameters: [CODE_PARAM],
          requestBody: {
            required: true,
            ...json({
              type: "object",
              required: ["title"],
              properties: {
                title: { type: "string" },
                description: { type: "string" },
                cases: {
                  type: "array",
                  items: { oneOf: [{ type: "string" }, { type: "integer" }] },
                },
                plan_id: { type: "string" },
                environment_id: { type: "string" },
                milestone_id: { type: "string" },
              },
            }),
          },
          responses: withErrors({ "201": { description: "Created", ...json(one("Run")) } }),
        },
      },
      "/run/{code}/{id}": {
        get: {
          tags: ["Runs"],
          summary: "One run, with a status breakdown",
          parameters: [CODE_PARAM, idParam("id", "Run uuid.")],
          responses: withErrors({ "200": { description: "OK", ...json(one("Run")) } }),
        },
        patch: {
          tags: ["Runs"],
          summary: "Update a run, or change which cases it holds",
          description:
            "Send `cases` (the full list the run should end up with) or " +
            "`add_cases`/`remove_cases` (a change to it), not both. The run must be " +
            "ACTIVE. Removing a case discards the result recorded against it, so a " +
            "case that is not IN_PROGRESS needs `force: true`.",
          parameters: [CODE_PARAM, idParam("id", "Run uuid.")],
          requestBody: {
            required: true,
            ...json({
              type: "object",
              additionalProperties: false,
              properties: {
                title: { type: "string" },
                description: { type: "string" },
                status: { type: "string", enum: ["ACTIVE", "COMPLETED", "ABORTED"] },
                cases: {
                  type: "array",
                  items: { oneOf: [{ type: "string" }, { type: "integer" }] },
                },
                add_cases: {
                  type: "array",
                  items: { oneOf: [{ type: "string" }, { type: "integer" }] },
                },
                remove_cases: {
                  type: "array",
                  items: { oneOf: [{ type: "string" }, { type: "integer" }] },
                },
                force: { type: "boolean" },
              },
            }),
          },
          responses: withErrors({
            "200": {
              description:
                "OK. When cases changed, `result.cases` reports added, removed, " +
                "already_present and not_in_run.",
              ...json(one("Run")),
            },
            "409": {
              description: "Run is not ACTIVE, or a case to remove has a recorded result.",
              ...json({ $ref: "#/components/schemas/Error" }),
            },
          }),
        },
        delete: {
          tags: ["Runs"],
          summary: "Delete a run",
          parameters: [CODE_PARAM, idParam("id", "Run uuid.")],
          responses: withErrors({ "200": { description: "Deleted" } }),
        },
      },
      "/run/{code}/{id}/complete": {
        post: {
          tags: ["Runs"],
          summary: "Mark a run complete",
          parameters: [CODE_PARAM, idParam("id", "Run uuid.")],
          responses: withErrors({ "200": { description: "OK", ...json(one("Run")) } }),
        },
      },
      "/result/{code}/{runId}": {
        get: {
          tags: ["Results"],
          summary: "Results of a run",
          description:
            "Ordered by (created_at, id) — a total order, so paging by offset does " +
            "not repeat or skip rows.",
          parameters: [
            CODE_PARAM,
            idParam("runId", "Run uuid."),
            ...PAGING,
            { name: "status", in: "query", schema: RESULT_STATUS },
          ],
          responses: withErrors({ "200": { description: "OK", ...json(listOf("Result")) } }),
        },
        post: {
          tags: ["Results"],
          summary: "Record one case's outcome",
          description:
            "A run already holds a result row per case, so this updates that row. A " +
            "case that is not in the run is rejected rather than added.",
          parameters: [CODE_PARAM, idParam("runId", "Run uuid.")],
          requestBody: { required: true, ...json({ $ref: "#/components/schemas/ResultInput" }) },
          responses: withErrors({
            "201": { description: "Recorded", ...json(one("Result")) },
            "409": {
              description: "Run is not ACTIVE, or the case is not part of it.",
              ...json({ $ref: "#/components/schemas/Error" }),
            },
          }),
        },
      },
      "/result/{code}/{runId}/bulk": {
        post: {
          tags: ["Results"],
          summary: "Record many outcomes in one call",
          description:
            "Partial success is intentional: one bad item does not discard the rest. " +
            "Failures come back per item, by index. At most 500 per request.",
          parameters: [CODE_PARAM, idParam("runId", "Run uuid.")],
          requestBody: {
            required: true,
            ...json({
              type: "object",
              required: ["results"],
              additionalProperties: false,
              properties: {
                results: {
                  type: "array",
                  maxItems: 500,
                  items: { $ref: "#/components/schemas/ResultInput" },
                },
              },
            }),
          },
          responses: withErrors({
            "200": {
              description: "Applied, possibly in part",
              ...json(
                ENVELOPE_OK({
                  type: "object",
                  properties: {
                    submitted: { type: "integer" },
                    applied: { type: "integer" },
                    failed: { type: "integer" },
                    errors: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          index: { type: "integer" },
                          case_id: {},
                          error: { type: "string" },
                        },
                      },
                    },
                  },
                }),
              ),
            },
          }),
        },
      },
      "/milestone/{code}": {
        get: {
          tags: ["Milestones"],
          summary: "Milestones in a project",
          parameters: [CODE_PARAM, ...PAGING],
          responses: withErrors({ "200": { description: "OK", ...json(listOf("Milestone")) } }),
        },
        post: {
          tags: ["Milestones"],
          summary: "Create a milestone",
          parameters: [CODE_PARAM],
          requestBody: {
            required: true,
            ...json({
              type: "object",
              required: ["title"],
              properties: {
                title: { type: "string" },
                description: { type: "string" },
                status: { type: "string" },
                due_date: { type: "string", format: "date-time" },
              },
            }),
          },
          responses: withErrors({ "201": { description: "Created", ...json(one("Milestone")) } }),
        },
      },
      "/milestone/{code}/{id}": {
        get: {
          tags: ["Milestones"],
          summary: "One milestone",
          parameters: [CODE_PARAM, idParam("id", "Milestone uuid.")],
          responses: withErrors({ "200": { description: "OK", ...json(one("Milestone")) } }),
        },
        patch: {
          tags: ["Milestones"],
          summary: "Update a milestone",
          parameters: [CODE_PARAM, idParam("id", "Milestone uuid.")],
          requestBody: { required: true, ...json({ type: "object" }) },
          responses: withErrors({ "200": { description: "OK", ...json(one("Milestone")) } }),
        },
        delete: {
          tags: ["Milestones"],
          summary: "Delete a milestone",
          parameters: [CODE_PARAM, idParam("id", "Milestone uuid.")],
          responses: withErrors({ "200": { description: "Deleted" } }),
        },
      },
      "/plan/{code}": {
        get: {
          tags: ["Plans"],
          summary: "Test plans in a project",
          parameters: [CODE_PARAM, ...PAGING],
          responses: withErrors({ "200": { description: "OK", ...json(listOf("Plan")) } }),
        },
        post: {
          tags: ["Plans"],
          summary: "Create a plan",
          parameters: [CODE_PARAM],
          requestBody: {
            required: true,
            ...json({
              type: "object",
              required: ["title"],
              properties: {
                title: { type: "string" },
                description: { type: "string" },
                cases: {
                  type: "array",
                  items: { oneOf: [{ type: "string" }, { type: "integer" }] },
                },
              },
            }),
          },
          responses: withErrors({ "201": { description: "Created", ...json(one("Plan")) } }),
        },
      },
      "/plan/{code}/{id}": {
        get: {
          tags: ["Plans"],
          summary: "One plan",
          parameters: [CODE_PARAM, idParam("id", "Plan uuid.")],
          responses: withErrors({ "200": { description: "OK", ...json(one("Plan")) } }),
        },
        patch: {
          tags: ["Plans"],
          summary: "Update a plan",
          parameters: [CODE_PARAM, idParam("id", "Plan uuid.")],
          requestBody: { required: true, ...json({ type: "object" }) },
          responses: withErrors({ "200": { description: "OK", ...json(one("Plan")) } }),
        },
        delete: {
          tags: ["Plans"],
          summary: "Delete a plan",
          parameters: [CODE_PARAM, idParam("id", "Plan uuid.")],
          responses: withErrors({ "200": { description: "Deleted" } }),
        },
      },
      "/environment/{code}": {
        get: {
          tags: ["Environments"],
          summary: "Environments in a project",
          parameters: [CODE_PARAM, ...PAGING],
          responses: withErrors({ "200": { description: "OK", ...json(listOf("Environment")) } }),
        },
        post: {
          tags: ["Environments"],
          summary: "Create an environment",
          parameters: [CODE_PARAM],
          requestBody: {
            required: true,
            ...json({
              type: "object",
              required: ["title"],
              properties: {
                title: { type: "string" },
                slug: { type: "string" },
                description: { type: "string" },
              },
            }),
          },
          responses: withErrors({
            "201": { description: "Created", ...json(one("Environment")) },
          }),
        },
      },
      "/defect/{code}": {
        get: {
          tags: ["Defects"],
          summary: "Defects linked in a project",
          parameters: [
            CODE_PARAM,
            ...PAGING,
            { name: "case_id", in: "query", schema: { type: "string" } },
            { name: "result_id", in: "query", schema: { type: "string" } },
            { name: "provider", in: "query", schema: { type: "string" } },
          ],
          responses: withErrors({ "200": { description: "OK", ...json(listOf("Defect")) } }),
        },
      },
      "/attachment/{code}": {
        post: {
          tags: ["Attachments"],
          summary: "Upload evidence",
          description:
            "multipart/form-data with one or more `file` parts. Returns urls to put " +
            "in a result's `steps[].attachments`. 50 MB per file.",
          parameters: [CODE_PARAM],
          requestBody: {
            required: true,
            content: {
              "multipart/form-data": {
                schema: {
                  type: "object",
                  properties: {
                    file: {
                      type: "array",
                      items: { type: "string", format: "binary" },
                    },
                  },
                },
              },
            },
          },
          responses: withErrors({
            "200": { description: "Uploaded" },
            "413": {
              description: "A file exceeds 50 MB.",
              ...json({ $ref: "#/components/schemas/Error" }),
            },
            "415": {
              description: "Body was not multipart/form-data.",
              ...json({ $ref: "#/components/schemas/Error" }),
            },
          }),
        },
      },
    },
  };
}
