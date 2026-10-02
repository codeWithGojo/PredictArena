"use client";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { validatePicks, type SlipPick } from "@/lib/selections";

const KEY = "predictarena.slip.v1";
const EVENT = "predictarena-slip";
let memory = "";
function read() {
  try { return localStorage.getItem(KEY) ?? memory; } catch { return memory; }
}
function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(EVENT, callback);
  return () => { window.removeEventListener("storage", callback); window.removeEventListener(EVENT, callback); };
}
function parse(raw: string): SlipPick[] {
  try { return validatePicks(JSON.parse(raw), Date.now()); } catch { return []; }
}
function write(picks: SlipPick[]) {
  memory = JSON.stringify(picks);
  try { localStorage.setItem(KEY, memory); } catch { /* Keep selections during this session when storage is blocked. */ }
  window.dispatchEvent(new Event(EVENT));
}
export function useSlip() {
  const raw = useSyncExternalStore(subscribe, read, () => "");
  const [clock, setClock] = useState(0);
  useEffect(() => { const timer = setInterval(() => setClock(Date.now()), 60_000); return () => clearInterval(timer); }, []);
  const picks = useMemo(() => { void clock; return parse(raw); }, [raw, clock]);
  const setPicks = useCallback((next: SlipPick[] | ((current: SlipPick[]) => SlipPick[])) => {
    const current = parse(read());
    write(validatePicks(typeof next === "function" ? next(current) : next, Date.now()));
  }, []);
  const addPick = useCallback((pick: SlipPick) => setPicks((current) => [...current.filter((item) => item.fixtureId !== pick.fixtureId), pick].slice(-20)), [setPicks]);
  return { picks, setPicks, addPick };
}
