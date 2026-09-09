/**
 * Serialises webhook processing per project.
 *
 * Qase delivers related events back to back — `run.completed` and the
 * `result.created` events for the same run arrive together. Handling them
 * concurrently makes every "does this exist yet?" check race its neighbour:
 * two handlers both find no run, and both create one, leaving duplicate rows
 * with the same `externalId`. Observed in testing, not hypothetical.
 *
 * Events for one project therefore run one at a time, in arrival order, which
 * also means a run is fully created before its results look for it. Different
 * projects still run in parallel.
 *
 * This is an in-process queue, which is sufficient because the app runs as a
 * single pm2 instance in fork mode. If it is ever scaled to multiple workers
 * this must become a database-level lock (e.g. `pg_advisory_lock` keyed on the
 * project) or the same race returns across processes.
 */

const chains = new Map<string, Promise<unknown>>();

export function runSerially<T>(key: string, task: () => Promise<T>): Promise<T> {
  const previous = chains.get(key) ?? Promise.resolve();
  // Swallow the predecessor's rejection so one failure cannot poison the chain.
  const next = previous.catch(() => {}).then(task);

  chains.set(key, next);
  // Drop the entry once it is the last one, so the map cannot grow forever.
  next.catch(() => {}).finally(() => {
    if (chains.get(key) === next) chains.delete(key);
  });

  return next;
}

/** Queue depth per key — exposed for debugging, not used in the request path. */
export function pendingKeys(): string[] {
  return [...chains.keys()];
}
