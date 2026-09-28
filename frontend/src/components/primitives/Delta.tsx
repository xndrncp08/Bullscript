import { directionOf, formatPercent, formatSigned } from "@/lib/format";

interface DeltaProps {
  value: number | null | undefined;
  /** "percent" treats value as a fraction (0.0153 -> +1.53%). */
  kind?: "percent" | "absolute";
  digits?: number;
  className?: string;
}

const GLYPH = { up: "▲", down: "▼", flat: "•" } as const;
const TONE = { up: "text-up", down: "text-down", flat: "text-ink-3" } as const;
const SPOKEN = { up: "up", down: "down", flat: "unchanged" } as const;

/** A signed change. Direction is carried by the glyph and the sign as well as
 * the color, so it survives colorblindness, grayscale, and forced colors. */
export function Delta({ value, kind = "percent", digits = 2, className = "" }: DeltaProps) {
  const direction = directionOf(value);
  const text = kind === "percent" ? formatPercent(value, { digits }) : formatSigned(value, digits);

  return (
    <span className={`tabular inline-flex items-baseline gap-1 ${TONE[direction]} ${className}`}>
      <span aria-hidden="true" className="text-[0.7em]">
        {GLYPH[direction]}
      </span>
      <span>{text}</span>
      <span className="sr-only">{SPOKEN[direction]}</span>
    </span>
  );
}
