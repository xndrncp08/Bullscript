/** Live record of this client's own API traffic - what the NETWORK tab and
 * the boot sequence display. Real requests, real latencies; nothing mocked. */

import { useSyncExternalStore } from "react";

export type RequestStatus = "pending" | "ok" | "error" | "aborted";

export interface RequestEntry {
  id: number;
  method: string;
  path: string;
  status: RequestStatus;
  httpStatus?: number;
  startedAt: number;
  durationMs?: number;
  bytes?: number;
  error?: string;
}

const MAX_ENTRIES = 80;

let entries: RequestEntry[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

export const telemetry = {
  start(method: string, path: string): number {
    const id = nextId++;
    entries = [{ id, method, path, status: "pending" as const, startedAt: Date.now() }, ...entries].slice(
      0,
      MAX_ENTRIES
    );
    emit();
    return id;
  },

  finish(id: number, patch: Partial<Omit<RequestEntry, "id">>) {
    entries = entries.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry));
    emit();
  },

  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  getSnapshot(): RequestEntry[] {
    return entries;
  },

  reset() {
    entries = [];
    nextId = 1;
    emit();
  },
};

export function useTelemetry(): RequestEntry[] {
  return useSyncExternalStore(telemetry.subscribe, telemetry.getSnapshot, telemetry.getSnapshot);
}
