/**
 * Render a millisecond span as "2h 7m 10s".
 *
 * Rolls up to hours: a full regression run passes 60 minutes easily, and
 * "127m 10s" makes the reader do the division.
 *
 * @param zero what to render for 0 / missing — a summary tile wants "0s",
 *             a per-row cell wants an em dash.
 */
export function formatDuration(ms: number, zero = "—"): string {
  if (!ms || ms < 0) return zero;
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}
