import { motion } from "motion/react";

import { DataStreamLoader } from "@/components/primitives/DataStreamLoader";
import { BrandEmblem, EMBLEM_LAYOUT_ID } from "@/features/command/CommandBar";
import { requestLines } from "@/features/telemetry/requestLines";
import { useTelemetry } from "@/lib/telemetry";
import { easeOut, springs } from "@/motion/tokens";

/**
 * First visit per session only. Shows while the first symbol's bars load -
 * the log lines are the real requests - then fades while the emblem morphs
 * into its place in the command bar.
 */
export function BootSequence({ symbol }: { symbol: string }) {
  const telemetry = useTelemetry();
  const lines = requestLines(telemetry, symbol);

  return (
    <motion.div
      className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-canvas"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.28, ease: easeOut }}
      data-testid="boot-sequence"
    >
      <motion.span layoutId={EMBLEM_LAYOUT_ID} transition={springs.morph} className="block h-[127px] w-40">
        <BrandEmblem className="h-full w-full" />
      </motion.span>
      <p className="mt-5 text-2xl font-semibold tracking-tight">
        <span className="text-ink">Bull</span>
        <span className="text-brand">Script</span>
      </p>
      <p className="label-caps mt-1.5">market intelligence terminal</p>
      <div className="mt-2 w-80">
        <DataStreamLoader title={`boot · ${symbol}`} lines={lines} />
      </div>
    </motion.div>
  );
}
