import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CommandPalette, type PaletteAction } from "@/features/command/CommandPalette";
import type { QuotesState } from "@/hooks/useQuotes";

import { makeQuote } from "../fixtures";

const quotes: QuotesState = { quotes: new Map([["MSFT", makeQuote("MSFT", 511.75, -0.0086)]]), status: "ready", updatedAt: 0 };

function setup({ actions = [] as PaletteAction[], recents = ["NVDA", "AAPL", "TSLA"] } = {}) {
  const props = {
    onClose: vi.fn(),
    onSelectSymbol: vi.fn(),
    actions,
    recents,
    currentSymbol: "AAPL",
    quotes,
  };
  render(<CommandPalette {...props} />);
  return { ...props, user: userEvent.setup(), input: screen.getByRole("combobox") };
}

describe("CommandPalette", () => {
  it("opens as a modal dialog with the search field focused", () => {
    const { input } = setup();
    expect(screen.getByRole("dialog", { name: "Command palette" })).toHaveAttribute("aria-modal", "true");
    expect(input).toHaveFocus();
  });

  it("lists recent symbols (minus the current one) before anything is typed", () => {
    setup();
    const options = screen.getAllByRole("option").map((o) => o.textContent);
    expect(options[0]).toMatch(/^NVDA/);
    expect(options.some((o) => o?.startsWith("AAPL"))).toBe(false);
  });

  it("finds symbols by company name and shows live quotes inline", async () => {
    const { user, input } = setup();
    await user.type(input, "microsoft");

    const option = screen.getByRole("option", { name: /MSFT/ });
    expect(option).toHaveTextContent("Microsoft");
    expect(option).toHaveTextContent("511.75");
  });

  it("opens any well-formed symbol that isn't in the directory", async () => {
    const { user, input, onSelectSymbol, onClose } = setup();
    await user.type(input, "rivn{Enter}");

    expect(onClose).toHaveBeenCalled();
    expect(onSelectSymbol).toHaveBeenCalledWith("RIVN");
  });

  it("offers nothing to open for input that can't be a symbol", async () => {
    const { user, input } = setup();
    await user.type(input, "../etc");
    expect(screen.queryByRole("option", { name: /Open/ })).toBeNull();
    expect(screen.getByText(/No matches/)).toBeInTheDocument();
  });

  it("moves the active option with the arrow keys and runs it with Enter", async () => {
    const { user, input, onSelectSymbol } = setup();

    expect(screen.getAllByRole("option")[0]).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{ArrowDown}");
    const second = screen.getAllByRole("option")[1];
    expect(second).toHaveAttribute("aria-selected", "true");
    expect(input).toHaveAttribute("aria-activedescendant", second.id);

    await user.keyboard("{Enter}");
    expect(onSelectSymbol).toHaveBeenCalledWith("TSLA");
  });

  it("wraps from the first option to the last", async () => {
    const { user } = setup();
    await user.keyboard("{ArrowUp}");
    const options = screen.getAllByRole("option");
    expect(options[options.length - 1]).toHaveAttribute("aria-selected", "true");
  });

  it("matches actions on every word of the query", async () => {
    const run = vi.fn();
    const { user, input } = setup({
      actions: [
        { id: "range-1y", label: "Chart range · 1Y", keywords: "range period", run },
        { id: "theme", label: "Switch to light theme", run: vi.fn() },
      ],
    });

    await user.type(input, "range 1y");
    const results = screen.getByRole("listbox");
    expect(within(results).getAllByRole("option")).toHaveLength(1);

    await user.keyboard("{Enter}");
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape and on a click outside the panel", async () => {
    const { user, onClose } = setup();
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("dialog").parentElement!);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("keeps focus inside the dialog on Tab", async () => {
    const { user, input } = setup();
    await user.tab();
    expect(input).toHaveFocus();
  });
});
