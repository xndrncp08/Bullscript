import type { Direction } from "@/lib/format";

const REGIME_GLOW: Record<Direction, string> = {
  up: "rgb(var(--color-up))",
  down: "rgb(var(--color-down))",
  flat: "rgb(var(--color-accent))",
};

/**
 * Light behind the glass. One glow takes the current instrument's regime
 * color, so the room itself reads green or red before you read a number.
 * CSS-only: a slow breathe off the main thread, nothing under reduced motion,
 * and nothing at all in the light theme (--glow: 0).
 */
export function AmbientBackdrop({ regime }: { regime: Direction }) {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="dot-grid absolute inset-0 [mask-image:radial-gradient(ellipse_80%_60%_at_50%_0%,black,transparent)]" />
      <div className="absolute -right-40 -top-72 h-[44rem] w-[44rem]" style={{ opacity: "calc(0.13 * var(--glow))" }}>
        <div
          className="motion-breathe h-full w-full rounded-full blur-[140px]"
          style={{ backgroundColor: REGIME_GLOW[regime], transition: "background-color 1200ms ease" }}
          data-regime={regime}
        />
      </div>
      <div className="absolute -left-60 -top-80 h-[38rem] w-[38rem]" style={{ opacity: "calc(0.08 * var(--glow))" }}>
        <div className="motion-breathe h-full w-full rounded-full bg-accent blur-[160px]" style={{ animationDelay: "-4.5s" }} />
      </div>
    </div>
  );
}
