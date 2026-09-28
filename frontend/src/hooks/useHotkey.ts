import { useEffect, useLayoutEffect, useRef } from "react";

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

/**
 * `combo` is "mod+k" (Cmd on macOS, Ctrl elsewhere) or a single key like "/".
 * Plain keys are ignored while the user is typing in a field; modifier combos
 * fire anywhere.
 */
export function useHotkey(combo: string, handler: (event: KeyboardEvent) => void) {
  const handlerRef = useRef(handler);
  useLayoutEffect(() => {
    handlerRef.current = handler;
  });

  useEffect(() => {
    const parts = combo.toLowerCase().split("+");
    const key = parts[parts.length - 1];
    const wantsMod = parts.includes("mod");

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== key) return;
      const mod = event.metaKey || event.ctrlKey;
      if (wantsMod !== mod) return;
      if (!wantsMod && isTypingTarget(event.target)) return;
      event.preventDefault();
      handlerRef.current(event);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [combo]);
}
