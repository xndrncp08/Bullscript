import { vi } from "vitest";

import "@testing-library/jest-dom/vitest";

// Recharts' ResponsiveContainer relies on ResizeObserver + real element
// dimensions, neither of which jsdom provides. Stub both so charts render
// their SVG tree during tests instead of staying empty.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal("ResizeObserver", ResizeObserverStub);

Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
  configurable: true,
  value: 800,
});
Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
  configurable: true,
  value: 400,
});

HTMLElement.prototype.getBoundingClientRect = vi.fn(() => ({
  width: 800,
  height: 400,
  top: 0,
  left: 0,
  bottom: 400,
  right: 800,
  x: 0,
  y: 0,
  toJSON() {
    return this;
  },
}));
