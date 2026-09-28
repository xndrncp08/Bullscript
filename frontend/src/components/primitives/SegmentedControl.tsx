import { motion } from "motion/react";
import { useId, useRef, type KeyboardEvent, type ReactNode } from "react";

import { springs } from "@/motion/tokens";

export interface SegmentOption<T extends string> {
  value: T;
  label: ReactNode;
  title?: string;
}

interface SegmentedControlProps<T extends string> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  className?: string;
}

/** A radio group whose selection indicator slides between options. Arrow keys
 * move and select, per the WAI-ARIA radio group pattern. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  className = "",
}: SegmentedControlProps<T>) {
  const pillId = useId();
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  const select = (index: number) => {
    const option = options[(index + options.length) % options.length];
    onChange(option.value);
    buttons.current[options.indexOf(option)]?.focus();
  };

  const onKeyDown = (event: KeyboardEvent, index: number) => {
    const moves: Record<string, number> = {
      ArrowRight: index + 1,
      ArrowDown: index + 1,
      ArrowLeft: index - 1,
      ArrowUp: index - 1,
      Home: 0,
      End: options.length - 1,
    };
    if (!(event.key in moves)) return;
    event.preventDefault();
    select(moves[event.key]);
  };

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={`relative inline-flex items-center rounded-md border border-line bg-well/80 p-0.5 ${className}`}
    >
      {options.map((option, index) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            ref={(el) => {
              buttons.current[index] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            title={option.title}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={`press relative h-6 rounded-[5px] px-2 font-mono text-2xs font-medium uppercase tracking-wider ${
              selected ? "text-ink" : "text-ink-3 hover:text-ink-2"
            }`}
          >
            {selected && (
              <motion.span
                layoutId={pillId}
                transition={springs.indicator}
                className="absolute inset-0 rounded-[5px] bg-surface-raised ring-1 ring-line-strong"
                aria-hidden="true"
              />
            )}
            <span className="relative">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
