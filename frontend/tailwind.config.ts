import type { Config } from "tailwindcss";

const token = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  // hover: variants only apply where a real hover exists, so taps on touch
  // screens don't leave rows stuck in their hover state.
  future: { hoverOnlyWhenSupported: true },
  theme: {
    extend: {
      colors: {
        canvas: token("color-bg"),
        well: token("color-bg-deep"),
        surface: {
          DEFAULT: token("color-card"),
          raised: token("color-card-raised"),
        },
        line: {
          DEFAULT: token("color-border"),
          strong: token("color-border-strong"),
        },
        grid: token("color-grid"),
        ink: {
          DEFAULT: token("color-text-primary"),
          2: token("color-text-secondary"),
          3: token("color-text-muted"),
        },
        up: token("color-up"),
        down: token("color-down"),
        accent: token("color-accent"),
        warn: token("color-warn"),
        brand: token("color-brand"),
        series: {
          forecast: token("series-forecast"),
          ema20: token("series-ema20"),
          ema50: token("series-ema50"),
        },
      },
      fontFamily: {
        sans: ["Geist", "Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "Menlo", "monospace"],
      },
      fontSize: {
        "2xs": ["10px", { lineHeight: "14px" }],
      },
      transitionTimingFunction: {
        out: "cubic-bezier(0.23, 1, 0.32, 1)",
        "in-out": "cubic-bezier(0.77, 0, 0.175, 1)",
      },
      keyframes: {
        "pulse-dot": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.35" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
      animation: {
        "pulse-dot": "pulse-dot 1.8s ease-in-out infinite",
        shimmer: "shimmer 1.8s linear infinite",
      },
    },
  },
  plugins: [],
} satisfies Config;
