import { NextResponse } from "next/server";
import { buildOpenApiDocument } from "@/lib/api-v1-openapi";

/**
 * GET /api/v1/openapi.json
 *
 * Deliberately unauthenticated: it describes the API, it carries no data, and
 * a spec you need a token to read is no help to the person trying to work out
 * what to send. Not in the middleware matcher, so it stays reachable.
 *
 * The server url follows the request, so a staging host documents itself
 * rather than pointing clients at production.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const doc = buildOpenApiDocument(`${url.protocol}//${url.host}/api/v1`);

  return NextResponse.json(doc, {
    headers: { "Cache-Control": "public, max-age=300" },
  });
}
