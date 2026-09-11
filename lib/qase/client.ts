/**
 * Minimal Qase.io REST v1 client.
 *
 * Extracted from `scripts/migrate-qase.ts` so the one-off migration and the
 * live webhook sync talk to Qase through exactly one implementation — a
 * pagination or auth quirk fixed here is fixed for both.
 */

const QASE_BASE = "https://api.qase.io/v1";

export function qaseToken(): string {
  const token = process.env.QASE_TOKEN || "";
  if (!token) throw new Error("QASE_TOKEN is not set.");
  return token;
}

/** GET a Qase endpoint. Returns null on 404 so callers can treat "gone" as data. */
export async function qaseGet(path: string): Promise<any | null> {
  const res = await fetch(`${QASE_BASE}${path}`, {
    headers: { Token: qaseToken(), "Content-Type": "application/json" },
    // Qase is a third party: never let a hung request pin a webhook handler open.
    signal: AbortSignal.timeout(20_000),
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Qase API ${path} → ${res.status} ${res.statusText} ${body.slice(0, 200)}`);
  }
  return res.json();
}

/** Fetch every page of a Qase list endpoint (100 per page). */
export async function qaseList(resource: string): Promise<any[]> {
  const out: any[] = [];
  let offset = 0;
  const limit = 100;
  while (true) {
    const sep = resource.includes("?") ? "&" : "?";
    const data = await qaseGet(`${resource}${sep}limit=${limit}&offset=${offset}`);
    const entities: any[] = data?.result?.entities || [];
    out.push(...entities);
    // A short page is the last page. `result.total` cannot be trusted for that
    // decision: on filtered endpoints Qase reports the *unfiltered* count —
    // `/result/STSD?run=10` answers total 1634 (the whole project) alongside 13
    // entities — so trusting it costs one wasted request per run, every night.
    if (entities.length < limit) break;
    offset += limit;
    await new Promise((r) => setTimeout(r, 150)); // be gentle on rate limits
  }
  return out;
}

/** A single entity, or null when Qase no longer has it. */
export async function qaseEntity(path: string): Promise<any | null> {
  const data = await qaseGet(path);
  return data?.result ?? null;
}
