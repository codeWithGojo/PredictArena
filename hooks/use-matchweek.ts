"use client";

import { useCallback, useSyncExternalStore } from "react";
import { validMatchweek } from "@/lib/matchweeks";

// Carry the selected week between the match centre and slip builder. A new
// browser session starts at this week; no stale calendar date is persisted.
let selected = "this";
const EVENT = "predictarena-matchweek";
function subscribe(callback: () => void) {
  window.addEventListener(EVENT, callback);
  return () => window.removeEventListener(EVENT, callback);
}
export function useMatchweek() {
  const week = useSyncExternalStore(subscribe, () => selected, () => "this");
  const setWeek = useCallback((value: string) => {
    selected = validMatchweek(value) ? value : "this";
    window.dispatchEvent(new Event(EVENT));
  }, []);
  return { week, setWeek };
}
