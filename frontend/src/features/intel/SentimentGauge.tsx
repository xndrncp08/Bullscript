import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from "motion/react";
import { useEffect, useId } from "react";

const CX = 60;
const CY = 58;
const R = 46;
const NEEDLE = 38;

/** A semicircle instrument for a score in [-1, 1]. The arc is diverging -
 * bearish hue, neutral gray midpoint, bullish hue - and the needle settles
 * on a spring, like a physical gauge taking a reading. */
export function SentimentGauge({ score, label }: { score: number; label: string }) {
  const gradientId = useId();
  const reduceMotion = useReducedMotion();
  const clamped = Math.max(-1, Math.min(1, score));
  const target = clamped * 90;

  const angle = useMotionValue(target);
  const sprung = useSpring(angle, { duration: 0.7, bounce: 0.15 });
  const source = reduceMotion ? angle : sprung;

  useEffect(() => {
    angle.set(target);
  }, [angle, target]);

  const x2 = useTransform(source, (a) => CX + NEEDLE * Math.sin((a * Math.PI) / 180));
  const y2 = useTransform(source, (a) => CY - NEEDLE * Math.cos((a * Math.PI) / 180));

  return (
    <svg viewBox="0 0 120 66" className="h-20 w-36" role="img" aria-label={`Sentiment ${label}, score ${clamped.toFixed(2)} on a scale from -1 to 1`}>
      <defs>
        <linearGradient id={gradientId} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" style={{ stopColor: "rgb(var(--color-down))" }} />
          <stop offset="50%" style={{ stopColor: "rgb(var(--color-text-muted))" }} />
          <stop offset="100%" style={{ stopColor: "rgb(var(--color-up))" }} />
        </linearGradient>
      </defs>
      <path d={`M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`} fill="none" stroke="rgb(var(--color-border))" strokeWidth={8} strokeLinecap="round" />
      <path
        d={`M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`}
        fill="none"
        stroke={`url(#${gradientId})`}
        strokeWidth={8}
        strokeLinecap="round"
        opacity={0.85}
      />
      {[-90, -45, 0, 45, 90].map((tick) => {
        const rad = (tick * Math.PI) / 180;
        return (
          <line
            key={tick}
            x1={CX + (R - 9) * Math.sin(rad)}
            y1={CY - (R - 9) * Math.cos(rad)}
            x2={CX + (R - 6) * Math.sin(rad)}
            y2={CY - (R - 6) * Math.cos(rad)}
            stroke="rgb(var(--color-text-muted))"
            strokeWidth={1}
          />
        );
      })}
      <motion.line x1={CX} y1={CY} x2={x2} y2={y2} stroke="rgb(var(--color-text-primary))" strokeWidth={2.5} strokeLinecap="round" />
      <circle cx={CX} cy={CY} r={4} fill="rgb(var(--color-text-primary))" stroke="rgb(var(--color-card))" strokeWidth={2} />
    </svg>
  );
}
