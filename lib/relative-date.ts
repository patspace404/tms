/**
 * How long ago, in the words a person would use.
 *
 * A run list is read by someone asking "is this the one I was on?", and an
 * absolute date makes them do the arithmetic. The recent days get names; past
 * that a date is clearer than "47 days ago". The year appears only when it is
 * not this one, so the common case stays short.
 */
export function relativeDate(
  value: string | Date,
  /** Injectable so the tests do not depend on the clock. */
  now: Date = new Date(),
): string {
  const then = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(then.getTime())) return "—";

  // Whole days apart by calendar date, not by elapsed hours: something at 11pm
  // is "Yesterday" at 1am, not "today".
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(then)) / 86_400_000);

  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days > 1 && days < 7) return `${days} days ago`;

  return then.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    ...(then.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}),
  });
}
