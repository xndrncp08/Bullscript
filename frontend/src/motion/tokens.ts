import type { Transition } from "motion/react";

/** Springs are reserved for motion that is interruptible or physical.
 * Everything predetermined (load-ins, loaders, marquee) is CSS in index.css. */
export const springs = {
  /** Segment and tab indicators: used tens of times a day, so quick with no
   * bounce - it should read as "moved", not "performed". */
  indicator: { type: "spring", duration: 0.28, bounce: 0 },
  /** Gauge needle: a physical instrument settling on a reading. */
  needle: { type: "spring", duration: 0.7, bounce: 0.15 },
  /** The one-time boot morph of the emblem into the command bar. */
  morph: { type: "spring", duration: 0.6, bounce: 0.1 },
} satisfies Record<string, Transition>;

export const easeOut = [0.23, 1, 0.32, 1] as const;
