import { useEffect, useState } from "react";

import { readStored, writeStored } from "@/lib/storage";

export function usePersistentState<T>(
  key: string,
  fallback: T,
  validate?: (value: unknown) => value is T
) {
  const [value, setValue] = useState<T>(() => readStored(key, fallback, validate));

  useEffect(() => {
    writeStored(key, value);
  }, [key, value]);

  return [value, setValue] as const;
}
