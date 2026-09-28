import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        obsidian: "#0B0E11",
        "obsidian-deep": "#0D0F12",
        slate: {
          card: "#161A22",
          border: "#1E262C",
          text: "#8A99AD",
        },
        bull: {
          DEFAULT: "#00E676",
          dark: "#00C853",
        },
        bear: {
          DEFAULT: "#FF3B30",
          light: "#FF5252",
        },
      },
      fontFamily: {
        mono: ["JetBrains Mono", "Menlo", "monospace"],
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      backgroundImage: {
        "bull-gradient": "linear-gradient(135deg, #00E676 0%, #00C853 100%)",
      },
      boxShadow: {
        "glow-bull": "0 0 24px rgba(0, 230, 118, 0.25)",
        "glow-bear": "0 0 24px rgba(255, 59, 48, 0.25)",
      },
    },
  },
  plugins: [],
} satisfies Config;
