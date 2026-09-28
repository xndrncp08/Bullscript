import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import Navbar from "@/components/Navbar";

describe("Navbar", () => {
  it("renders the brand logo with correct src and alt text", () => {
    render(<Navbar activeSymbol="AAPL" onSymbolChange={vi.fn()} />);

    const logo = screen.getByAltText("BullScript logo");
    expect(logo).toBeInTheDocument();
    expect(logo).toHaveAttribute("src", "/logo.png");
  });

  it("renders the >_ terminal badge", () => {
    render(<Navbar activeSymbol="AAPL" onSymbolChange={vi.fn()} />);

    const badge = screen.getByTestId("terminal-badge");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent(">_");
  });

  it("renders the BullScript wordmark", () => {
    render(<Navbar activeSymbol="AAPL" onSymbolChange={vi.fn()} />);

    expect(screen.getByText("Bull")).toBeInTheDocument();
    expect(screen.getByText("Script")).toBeInTheDocument();
  });

  it("triggers onSymbolChange with the uppercased ticker on search submit", async () => {
    const user = userEvent.setup();
    const onSymbolChange = vi.fn();
    render(<Navbar activeSymbol="AAPL" onSymbolChange={onSymbolChange} />);

    const input = screen.getByPlaceholderText(/search ticker/i);
    await user.clear(input);
    await user.type(input, "tsla{enter}");

    expect(onSymbolChange).toHaveBeenCalledWith("TSLA");
  });

  it("does not trigger onSymbolChange for an empty search", async () => {
    const user = userEvent.setup();
    const onSymbolChange = vi.fn();
    render(<Navbar activeSymbol="AAPL" onSymbolChange={onSymbolChange} />);

    const input = screen.getByPlaceholderText(/search ticker/i);
    await user.clear(input);
    await user.type(input, "{enter}");

    expect(onSymbolChange).not.toHaveBeenCalled();
  });
});
