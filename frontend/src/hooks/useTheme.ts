import { useCallback, useEffect, useState } from "react";

export type Theme = "dark" | "light";
export type Palette = "classic" | "cvd";

const THEME_KEY = "bullscript-theme";
const PALETTE_KEY = "bullscript-palette";

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // storage unavailable - preference just won't persist
  }
}

/** Theme (dark/light) and market-direction palette (classic red/green or
 * colorblind-safe blue/orange). index.html applies both before first paint. */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => (read(THEME_KEY) === "light" ? "light" : "dark"));
  const [palette, setPalette] = useState<Palette>(() => (read(PALETTE_KEY) === "cvd" ? "cvd" : "classic"));

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    write(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    if (palette === "cvd") document.documentElement.dataset.palette = "cvd";
    else delete document.documentElement.dataset.palette;
    write(PALETTE_KEY, palette);
  }, [palette]);

  const toggleTheme = useCallback(() => setTheme((t) => (t === "dark" ? "light" : "dark")), []);
  const togglePalette = useCallback(() => setPalette((p) => (p === "classic" ? "cvd" : "classic")), []);

  return { theme, palette, toggleTheme, togglePalette };
}
