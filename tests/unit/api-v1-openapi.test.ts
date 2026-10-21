import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildOpenApiDocument } from "@/lib/api-v1-openapi";

/**
 * The spec is written by hand, so the thing that matters is that it cannot
 * quietly fall behind the routes. This walks app/api/v1 and compares what is
 * actually served against what is described — in both directions. Adding an
 * endpoint without documenting it fails here.
 */
const V1 = join(process.cwd(), "app", "api", "v1");

type Op = string; // "GET /case/{code}"

function routeOperations(dir: string, prefix = ""): Op[] {
  const ops: Op[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      // [code] in the filesystem is {code} in a URL template.
      const segment = entry.replace(/^\[(?:\.\.\.)?(.+)\]$/, "{$1}");
      ops.push(...routeOperations(full, `${prefix}/${segment}`));
      continue;
    }
    if (entry !== "route.ts") continue;
    const src = readFileSync(full, "utf8");
    for (const m of src.matchAll(
      /^export\s+(?:const|async function)\s+(GET|POST|PATCH|PUT|DELETE)\b/gm,
    )) {
      ops.push(`${m[1]} ${prefix || "/"}`);
    }
  }
  return ops;
}

function specOperations(): Op[] {
  const doc = buildOpenApiDocument();
  const ops: Op[] = [];
  for (const [path, item] of Object.entries(doc.paths as Record<string, any>)) {
    for (const method of Object.keys(item)) {
      ops.push(`${method.toUpperCase()} ${path}`);
    }
  }
  return ops;
}

// The spec documents the API, not itself: these serve the document and would
// otherwise show up as undocumented endpoints forever.
const SELF_DESCRIBING = ["GET /openapi.json", "GET /docs"];

describe("the OpenAPI document matches the routes", () => {
  const served = routeOperations(V1)
    .filter((op) => !SELF_DESCRIBING.includes(op))
    .sort();
  const described = specOperations().sort();

  it("describes every endpoint that is served", () => {
    const missing = served.filter((op) => !described.includes(op));
    expect(missing, `Not in lib/api-v1-openapi.ts: ${missing.join(", ")}`).toEqual([]);
  });

  it("describes no endpoint that is not served", () => {
    const extra = described.filter((op) => !served.includes(op));
    expect(extra, `Described but not served: ${extra.join(", ")}`).toEqual([]);
  });

  it("found a realistic number of endpoints, so the walk itself is working", () => {
    // Guards against the directory walk silently returning nothing and both
    // checks above passing on two empty lists.
    expect(served.length).toBeGreaterThan(25);
  });
});

describe("the document is usable", () => {
  const doc = buildOpenApiDocument("https://tms.socket9.com/api/v1") as any;

  it("is OpenAPI 3.1 with a server and a title", () => {
    expect(doc.openapi).toBe("3.1.0");
    expect(doc.info.title).toBeTruthy();
    expect(doc.servers[0].url).toBe("https://tms.socket9.com/api/v1");
  });

  it("states how to authenticate", () => {
    expect(doc.components.securitySchemes.TokenHeader).toMatchObject({
      type: "apiKey",
      in: "header",
      name: "Token",
    });
    expect(doc.security).toEqual([{ TokenHeader: [] }]);
  });

  it("survives JSON serialisation, which is how it is served", () => {
    expect(() => JSON.stringify(doc)).not.toThrow();
  });

  it("resolves every $ref it uses", () => {
    const refs = new Set<string>();
    JSON.stringify(doc, (key, value) => {
      if (key === "$ref" && typeof value === "string") refs.add(value);
      return value;
    });
    const schemas = Object.keys(doc.components.schemas);
    const broken = [...refs].filter(
      (r) => !schemas.includes(r.replace("#/components/schemas/", "")),
    );
    expect(broken, `Dangling refs: ${broken.join(", ")}`).toEqual([]);
  });

  it("documents the fields the migration needed", () => {
    const result = doc.components.schemas.ResultInput.properties;
    expect(result.assignee_id).toBeTruthy();
    expect(result.steps.items.properties.step_id).toBeTruthy();
    // Unknown fields are rejected, and the schema says so.
    expect(doc.components.schemas.ResultInput.additionalProperties).toBe(false);

    const runPatch =
      doc.paths["/run/{code}/{id}"].patch.requestBody.content["application/json"].schema;
    expect(runPatch.properties.cases).toBeTruthy();
    expect(runPatch.additionalProperties).toBe(false);
  });
});
