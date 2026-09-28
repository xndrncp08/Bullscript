import { Search } from "lucide-react";
import { useState } from "react";

interface TickerSearchProps {
  value: string;
  onSubmit: (symbol: string) => void;
}

export default function TickerSearch({ value, onSubmit }: TickerSearchProps) {
  const [draft, setDraft] = useState(value);

  return (
    <form
      className="flex items-center gap-2 rounded-lg border border-slate-border bg-slate-card px-3 py-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        if (draft.trim()) onSubmit(draft.trim().toUpperCase());
      }}
    >
      <Search className="h-4 w-4 text-slate-text" />
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Search ticker (e.g. AAPL)"
        className="w-44 bg-transparent text-sm text-white placeholder:text-slate-text focus:outline-none"
      />
    </form>
  );
}
