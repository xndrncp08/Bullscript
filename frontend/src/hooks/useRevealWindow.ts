import { useEffect, useState } from "react";

/** True for `ms` after `key` changes to a new non-null value. Used to play a
 * load-in once per dataset rather than on every re-render or range change.
 *
 * Derived synchronously so the very first frame with new data already carries
 * the animation - otherwise marks would paint at full size, then snap back
 * and animate one effect later. */
export function useRevealWindow(key: string | null, ms: number): boolean {
  const [expired, setExpired] = useState<string | null>(null);

  useEffect(() => {
    if (!key) return;
    const timer = setTimeout(() => setExpired(key), ms);
    return () => clearTimeout(timer);
  }, [key, ms]);

  return key != null && expired !== key;
}
