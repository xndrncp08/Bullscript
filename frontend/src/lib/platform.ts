const isApplePlatform =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/** The label for the platform's shortcut modifier. */
export const MOD_KEY = isApplePlatform ? "⌘" : "Ctrl";
