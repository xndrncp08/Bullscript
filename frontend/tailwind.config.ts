import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        obsidian: "rgb(var(--color-bg) / <alpha-value>)",
        "obsidian-deep": "rgb(var(--color-bg-deep) / <alpha-value>)",
        slate: {
          card: "rgb(var(--color-card) / <alpha-value>)",
          border: "rgb(var(--color-border) / <alpha-value>)",
          text: "rgb(var(--color-text-secondary) / <alpha-value>)",
        },
        primary: "rgb(var(--color-text-primary) / <alpha-value>)",
        bull: {
          DEFAULT: "#00E676",
          dark: "#00C853",
        },
        bear: {
          DEFAULT: "#FF3B30",
          light: "#FF5252",
        },
        cyan: {
          DEFAULT: "#00E5FF",
        },
      },
      fontFamily: {
        mono: ["JetBrains Mono", "Menlo", "monospace"],
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      backgroundImage: {
        "bull-gradient": "linear-gradient(135deg, #00E676 0%, #00C853 100%)",
        "bull-glow": "radial-gradient(circle, rgba(16,185,129,0.2) 0%, transparent 70%)",
        "bear-glow": "radial-gradient(circle, rgba(255,59,48,0.2) 0%, transparent 70%)",
        "cyan-glow": "radial-gradient(circle, rgba(0,229,255,0.18) 0%, transparent 70%)",
      },
      boxShadow: {
        "glow-bull": "0 0 24px rgba(0, 230, 118, 0.25)",
        "glow-bear": "0 0 24px rgba(255, 59, 48, 0.25)",
        "glow-cyan": "0 0 24px rgba(0, 229, 255, 0.25)",
      },
      backdropBlur: {
        xs: "2px",
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
