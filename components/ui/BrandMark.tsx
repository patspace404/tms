import { cn } from "@/lib/utils";

/**
 * The Socket9 mark, as vectors rather than the raster logo in /public.
 *
 * Drawn from the artwork's own geometry so it stays crisp at the 24–30px the
 * app actually uses it at, where a JPEG shows its edges. The box is cropped
 * closer than the source file's generous margin, so a given size buys glyph
 * rather than air. The counter is knocked out rather than filled white, so the
 * mark sits on whatever surface it is placed on.
 */
const NAVY = "#20356E";
const BLUE = "#2D65B2";

const GLYPH =
  "M123 119 H228 V157 H266 V287 A36 36 0 0 1 230 323 H92 V286 H227 V240 H123 " +
  "A36 36 0 0 1 87 204 V155 A36 36 0 0 1 123 119 Z " +
  "M130 157 H224 A4 4 0 0 1 228 161 V198 A4 4 0 0 1 224 202 H130 " +
  "A4 4 0 0 1 126 198 V161 A4 4 0 0 1 130 157 Z";

const BRACKETS =
  "M228 62 H247 V81 H228 Z " +
  "M266 62 H323 V156 H304 V81 H266 Z " +
  "M228 100 H285 V156 H266 V119 H228 Z";

export function BrandMark({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="60 48 290 290"
      className={className}
      role="img"
      aria-label="Socket9"
    >
      <path fill={NAVY} fillRule="evenodd" d={GLYPH} />
      <path fill={BLUE} d={BRACKETS} />
    </svg>
  );
}

/**
 * The mark on its own tile, which is how it appears beside the product name.
 *
 * The tile is white in both themes: the artwork is two shades of navy, and on a
 * dark surface it would otherwise disappear.
 */
export function BrandTile({ size = 26, className }: { size?: number; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center bg-white ring-1 ring-black/[0.06] dark:ring-white/10",
        className,
      )}
      // The corner follows the box rather than a fixed radius, so the tile keeps
      // the same silhouette at every size it is used at.
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.27) }}
    >
      <BrandMark size={Math.round(size * 0.82)} />
    </span>
  );
}
