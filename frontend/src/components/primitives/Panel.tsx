import { useId, type ReactNode } from "react";

interface PanelProps {
  title: string;
  meta?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}

/** A glass surface with a terminal-style header: `// TITLE  meta ... actions`. */
export function Panel({ title, meta, actions, children, className = "", bodyClassName = "" }: PanelProps) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className={`panel flex min-h-0 flex-col ${className}`}>
      <header className="flex h-9 shrink-0 items-center gap-3 border-b border-line/70 px-3">
        <h2 id={headingId} className="label-caps flex shrink-0 items-center gap-1.5 text-ink-2">
          <span className="text-accent/70" aria-hidden="true">
            {"//"}
          </span>
          {title}
        </h2>
        {meta && <div className="min-w-0 truncate font-mono text-2xs text-ink-3">{meta}</div>}
        {actions && <div className="ml-auto flex shrink-0 items-center gap-1.5">{actions}</div>}
      </header>
      <div className={`min-h-0 flex-1 ${bodyClassName}`}>{children}</div>
    </section>
  );
}
