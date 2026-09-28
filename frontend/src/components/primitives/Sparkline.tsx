import { extent, linePath } from "@/lib/chart-math";
import type { Direction } from "@/lib/format";

interface SparklineProps {
  values: number[];
  direction: Direction;
  width?: number;
  height?: number;
  className?: string;
}

const STROKE: Record<Direction, string> = {
  up: "rgb(var(--color-up))",
  down: "rgb(var(--color-down))",
  flat: "rgb(var(--color-text-muted))",
};

export function Sparkline({ values, direction, width = 64, height = 20, className = "" }: SparklineProps) {
  const range = extent(values);
  if (values.length < 2 || !range) {
    return <svg width={width} height={height} className={className} aria-hidden="true" />;
  }

  const [lo, hi] = range;
  const span = hi - lo || 1;
  const pad = 1.5;
  const d = linePath(
    values.map((v, i) => ({
      x: pad + (i / (values.length - 1)) * (width - pad * 2),
      y: height - pad - ((v - lo) / span) * (height - pad * 2),
    }))
  );

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      aria-hidden="true"
    >
      <path d={d} fill="none" stroke={STROKE[direction]} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
