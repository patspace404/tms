/**
 * GET /api/v1/docs — the spec, rendered.
 *
 * /docs, /openapi.json, /swagger.json and /api-docs were all tried before this
 * existed and every one of them fell through to the web app, which answers with
 * the React shell and no hint that there is nothing there. Both real paths are
 * served now, and the ones that are not have a reason to be guessed no longer.
 *
 * Plain HTML from a route handler rather than a page, so it sits next to the
 * API it documents and stays outside the authenticated app.
 */
const HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>QMaster API</title>
    <style>
      body { margin: 0; background: #0f172a; }
      /* Shown only until the viewer takes over, and if its script cannot be
         reached the link below is the way out rather than a blank page. */
      .fallback {
        color: #e2e8f0;
        font: 14px/1.6 ui-sans-serif, system-ui, sans-serif;
        padding: 40px;
        max-width: 640px;
      }
      .fallback a { color: #93c5fd; }
    </style>
  </head>
  <body>
    <div class="fallback" id="fallback">
      <h1>QMaster API</h1>
      <p>Loading the reference…</p>
      <p>If it does not appear, the spec itself is at
        <a href="/api/v1/openapi.json">/api/v1/openapi.json</a> and can be opened in
        any OpenAPI viewer.</p>
    </div>
    <script
      id="api-reference"
      data-url="/api/v1/openapi.json"
      data-configuration='{"theme":"purple","hideDownloadButton":false}'
    ></script>
    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
  </body>
</html>`;

export async function GET() {
  return new Response(HTML, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
}
