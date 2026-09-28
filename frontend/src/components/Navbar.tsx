import { TerminalSquare } from "lucide-react";

import TickerSearch from "./TickerSearch";

interface NavbarProps {
  activeSymbol: string;
  onSymbolChange: (symbol: string) => void;
}

export default function Navbar({ activeSymbol, onSymbolChange }: NavbarProps) {
  return (
    <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-border bg-obsidian-deep/90 px-6 py-3 backdrop-blur">
      <div className="flex items-center gap-3">
        <img src="/logo.png" alt="BullScript logo" className="h-9 w-9 rounded-md object-cover" />
        <div className="flex items-baseline gap-1">
          <span className="text-lg font-bold text-white">Bull</span>
          <span className="text-lg font-bold text-bull">Script</span>
        </div>
        <span className="terminal-badge">
          <TerminalSquare className="h-3.5 w-3.5" />
          <span>live</span>
        </span>
      </div>

      <TickerSearch value={activeSymbol} onSubmit={onSymbolChange} />
    </header>
  );
}
