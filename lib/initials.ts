/**
 * Avatar initials from a person's name.
 *
 * Eight copies of this had grown across the app and six were wrong, because
 * they split on a single space and trusted the result. Half this workspace's
 * names arrive from Microsoft SSO with a doubled space — `"Supat   Torsakun
 * (Nui)"` — so `split(" ")` yields empty strings in the middle:
 *
 *   parts[1][0]            → undefined → "Supat" + undefined → "SUNDEFINED"
 *   parts[parts.length-1]  → "(Nui)"   → "S("
 *
 * Both were on screen. Splitting on whitespace runs and dropping empties fixes
 * it; a trailing nickname in brackets is skipped so "Supat Torsakun (Nui)"
 * reads ST rather than S(.
 */

/** Nicknames like "(Nui)" are not part of the name for initials purposes. */
const isNickname = (word: string) => word.startsWith("(") || word.startsWith("[");

export function initialsOf(
  name?: string | null,
  fallbackEmail?: string | null,
): string {
  const source = (name || "").trim() || (fallbackEmail || "").split("@")[0] || "";
  if (!source) return "?";

  const words = source.split(/\s+/).filter((w) => w && !isNickname(w));

  // A single word (or only a nickname) — take its first two characters, which
  // is also the sensible answer for a Thai name written without spaces.
  if (words.length < 2) {
    const only = words[0] ?? source.replace(/[()[\]]/g, "");
    return only.slice(0, 2).toUpperCase() || "?";
  }

  return (words[0][0] + words[1][0]).toUpperCase();
}

/** The name to show beside the avatar, falling back to the email's local part. */
export function displayNameOf(
  name?: string | null,
  fallbackEmail?: string | null,
): string {
  return (name || "").trim() || (fallbackEmail || "").split("@")[0] || "Unknown";
}
