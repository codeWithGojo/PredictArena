"use client";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useAuth } from "@/hooks/use-auth";
type Prefs = { leagues: string[]; teams: string[] };
const EVENT = "predictarena-preferences", EMPTY = '{"leagues":[],"teams":[]}';
const memory = new Map<string, string>();
function read(key: string) { try { return localStorage.getItem(key) ?? memory.get(key) ?? EMPTY; } catch { return memory.get(key) ?? EMPTY; } }
function parse(raw: string): Prefs { try { const v = JSON.parse(raw); const clean = (a: unknown) => Array.isArray(a) ? a.filter((x): x is string => typeof x === "string").slice(0,30) : []; return { leagues: clean(v.leagues), teams: clean(v.teams) }; } catch { return { leagues: [], teams: [] }; } }
function write(key: string, next: Prefs) { const raw = JSON.stringify(next); memory.set(key, raw); try { localStorage.setItem(key, raw); } catch { /* Session memory remains available. */ } window.dispatchEvent(new Event(EVENT)); }
function subscribe(fn: () => void) { window.addEventListener(EVENT, fn); window.addEventListener("storage", fn); return () => { window.removeEventListener(EVENT, fn); window.removeEventListener("storage", fn); }; }
export function usePreferences() {
 const { user } = useAuth(); const userId = user?.id; const key = `predictarena.preferences.${userId ?? "guest"}`;
 const raw = useSyncExternalStore(subscribe, () => read(key), () => EMPTY);
 const prefs = parse(raw); const [loaded, setLoaded] = useState(""); const [error, setError] = useState("");
 const queue = useRef(Promise.resolve());
 useEffect(() => {
  if (!userId) { try { const old = JSON.parse(localStorage.getItem("predictarena.leagues.v1") ?? "[]"); if (read(key) === EMPTY && Array.isArray(old) && old.length) write(key, { leagues: old.filter(x => typeof x === "string").slice(0,30), teams: [] }); } catch {} return; }
  const controller = new AbortController();
  fetch("/api/preferences", { cache: "no-store", signal: controller.signal }).then(async r => { const b = await r.json(); if (!r.ok) throw new Error(b.error); return b; }).then(b => { if (controller.signal.aborted) return; write(key, b.preferences ?? parse(read("predictarena.preferences.guest"))); setLoaded(userId); setError(""); }).catch(e => { if (e.name !== "AbortError") { setError(e.message); setLoaded(userId); } });
  return () => controller.abort();
 }, [userId, key]);
 const update = useCallback((next: Prefs) => {
  write(key, next); if (!userId) return;
  queue.current = queue.current.then(async () => { try { const r = await fetch("/api/preferences", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...next, accountId: userId }) }); if (!r.ok) throw new Error("Saved on this device; account sync failed."); setError(""); } catch(e) { setError(e instanceof Error ? e.message : "Could not sync preferences."); } });
 }, [key, userId]);
 return { ...prefs, ready: !userId || loaded === userId, signedIn: !!userId, error,
  toggleLeague: (id: string) => update({ ...prefs, leagues: prefs.leagues.includes(id) ? prefs.leagues.filter(x => x !== id) : [...prefs.leagues, id].slice(-30) }),
  toggleTeam: (name: string) => update({ ...prefs, teams: prefs.teams.includes(name) ? prefs.teams.filter(x => x !== name) : [...prefs.teams, name].slice(-30) }) };
}
