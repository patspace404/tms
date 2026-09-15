/**
 * One ceiling for uploaded evidence, shared by the browser and both upload
 * endpoints.
 *
 * nginx has its own `client_max_body_size` in front of all of this and it wins:
 * when it is the smaller number it drops the request before any of this code
 * runs, and the browser sees an nginx error page rather than the message below.
 * Keep it above this limit.
 */
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // 50 MB — a short screen recording

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Why a file was turned away, in words worth showing someone. */
export function tooLargeMessage(name: string, size: number): string {
  return `${name} is ${formatBytes(size)} — the limit is ${formatBytes(MAX_UPLOAD_BYTES)}.`;
}
