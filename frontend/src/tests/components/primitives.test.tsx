import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { DataStreamLoader } from "@/components/primitives/DataStreamLoader";
import { Delta } from "@/components/primitives/Delta";
import { FlashValue } from "@/components/primitives/FlashValue";
import { Panel } from "@/components/primitives/Panel";
import { SegmentedControl } from "@/components/primitives/SegmentedControl";
import { Sparkline } from "@/components/primitives/Sparkline";

function RangeHarness() {
  const [value, setValue] = useState<"1M" | "3M" | "1Y">("3M");
  return (
    <SegmentedControl
      label="Range"
      value={value}
      onChange={setValue}
      options={[
        { value: "1M", label: "1M" },
        { value: "3M", label: "3M" },
        { value: "1Y", label: "1Y" },
      ]}
    />
  );
}

describe("SegmentedControl", () => {
  it("exposes a labelled radio group with the selection checked", () => {
    render(<RangeHarness />);
    expect(screen.getByRole("radiogroup", { name: "Range" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "3M" })).toHaveAttribute("aria-checked", "true");
  });

  it("selects on click", async () => {
    const user = userEvent.setup();
    render(<RangeHarness />);
    await user.click(screen.getByRole("radio", { name: "1Y" }));
    expect(screen.getByRole("radio", { name: "1Y" })).toHaveAttribute("aria-checked", "true");
  });

  it("moves the selection and focus with arrow keys, wrapping at the ends", async () => {
    const user = userEvent.setup();
    render(<RangeHarness />);

    await user.click(screen.getByRole("radio", { name: "3M" }));
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("radio", { name: "1Y" })).toHaveFocus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("radio", { name: "1M" })).toHaveAttribute("aria-checked", "true");
    await user.keyboard("{End}");
    expect(screen.getByRole("radio", { name: "1Y" })).toHaveAttribute("aria-checked", "true");
  });

  it("keeps only the selected option in the tab order", () => {
    render(<RangeHarness />);
    expect(screen.getByRole("radio", { name: "3M" })).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("radio", { name: "1M" })).toHaveAttribute("tabindex", "-1");
  });
});

describe("Delta", () => {
  it("carries direction in a glyph and spoken text, not only color", () => {
    const { container } = render(<Delta value={0.0153} />);
    expect(container).toHaveTextContent("▲+1.53%up");
    expect(screen.getByText("up")).toHaveClass("sr-only");
  });

  it("renders falls and flat values", () => {
    const { container, rerender } = render(<Delta value={-2.5} kind="absolute" />);
    expect(container).toHaveTextContent("▼−2.50down");
    rerender(<Delta value={0} />);
    expect(container).toHaveTextContent("unchanged");
  });
});

describe("Sparkline", () => {
  it("draws a path for two or more points", () => {
    const { container } = render(<Sparkline values={[1, 3, 2]} direction="up" />);
    expect(container.querySelector("path")?.getAttribute("d")).toMatch(/^M.+L.+L/);
  });

  it("draws nothing for a single point", () => {
    const { container } = render(<Sparkline values={[1]} direction="up" />);
    expect(container.querySelector("path")).toBeNull();
  });
});

describe("Panel", () => {
  it("labels its region with the title", () => {
    render(
      <Panel title="Forecast" meta="AAPL">
        body
      </Panel>
    );
    expect(screen.getByRole("region", { name: /forecast/i })).toHaveTextContent("body");
  });
});

describe("DataStreamLoader", () => {
  it("announces itself and lists request states", () => {
    render(
      <DataStreamLoader
        title="loading AAPL"
        lines={[
          { label: "chart", status: "ok", detail: "42ms" },
          { label: "forecast", status: "pending" },
        ]}
      />
    );
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("loading AAPL");
    expect(status).toHaveTextContent(/chart.*ok.*42ms/);
    expect(status).toHaveTextContent(/forecast.*…/);
  });
});

describe("FlashValue", () => {
  it("flashes when the value moves for the same instrument", () => {
    const { rerender, container } = render(
      <FlashValue value={100} identity="AAPL">
        100
      </FlashValue>
    );
    expect(container.firstElementChild).not.toHaveClass("motion-flash-up");

    rerender(
      <FlashValue value={101} identity="AAPL">
        101
      </FlashValue>
    );
    expect(container.firstElementChild).toHaveClass("motion-flash-up");
  });

  it("does not flash when the instrument changes", () => {
    const { rerender, container } = render(
      <FlashValue value={100} identity="AAPL">
        100
      </FlashValue>
    );
    rerender(
      <FlashValue value={250} identity="MSFT">
        250
      </FlashValue>
    );
    expect(container.firstElementChild?.className).not.toMatch(/motion-flash/);
  });
});
