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
  // Behind nginx, `req.url` is the internal address the proxy dialled —
  // localhost:3000 — which would hand every reader a server url they cannot
  // reach. The forwarded headers carry what the client actually asked for.
  const url = new URL(req.url);
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || url.host;

  // nginx forwards Host but not X-Forwarded-Proto, and `req.url` is always
  // http here because the proxy terminates TLS. Trust the header when it is
  // there; otherwise anything that is not a local address is being served over
  // https, and handing out an http:// server url would send readers somewhere
  // that only redirects.
  const isLocal = /^(localhost|127\.0\.0\.1|\[::1\])(:|$)/.test(host);
  const proto = req.headers.get("x-forwarded-proto") || (isLocal ? "http" : "https");

  const doc = buildOpenApiDocument(`${proto}://${host}/api/v1`);

  return NextResponse.json(doc, {
    headers: { "Cache-Control": "public, max-age=300" },
  });
}
