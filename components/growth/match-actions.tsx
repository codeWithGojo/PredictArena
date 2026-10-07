"use client";
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { matchCalendar } from "@/lib/archive";
import type { Match } from "@/lib/sports";
export function MatchActions({ match }: { match: Match }) {
 const { user, signIn } = useAuth(); const [savedFor, setSavedFor] = useState(""), [busy, setBusy] = useState(false), [message, setMessage] = useState(""); const saved = !!user && savedFor === user.id;
 async function save() { if (!user) { await signIn(); return; } if (!match.archiveId) return; setBusy(true); setMessage(""); try { const r = await fetch("/api/saved", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fixtureId: match.archiveId }) }); const b = await r.json(); if (!r.ok) throw new Error(b.error); setSavedFor(user.id); setMessage("First published 1X2 forecast saved to your account."); } catch(e) { setMessage(e instanceof Error ? e.message : "Could not save this forecast."); } finally { setBusy(false); } }
 function remind() { const url = URL.createObjectURL(new Blob([matchCalendar(match)], { type: "text/calendar;charset=utf-8" })); const a = document.createElement("a"); a.href = url; a.download = `${match.id}-reminder.ics`; a.click(); window.setTimeout(() => URL.revokeObjectURL(url),1000); setMessage("Open the calendar file to add a reminder 30 minutes before kickoff."); }
 async function share() { try { await navigator.clipboard.writeText(`${match.home.name} vs ${match.away.name}\n${match.league}\n1X2: home ${match.probabilities[0]}%, draw ${match.probabilities[1]}%, away ${match.probabilities[2]}%\n${window.location.origin}/performance\nStatistical estimates; no guaranteed outcome.`); setMessage("Match summary copied."); } catch { setMessage("Copy is unavailable in this browser."); } }
 return <div className="match-keep"><div className="growth-actions"><button onClick={() => void save()} disabled={busy || saved || !match.archiveId}>{saved ? "Saved to your account" : busy ? "Saving…" : match.archiveId ? "Save forecast" : "Awaiting archive"}</button><button onClick={remind}>Add match reminder</button>{match.sport === "football" && match.probabilities.length === 3 && <button onClick={() => void share()}>Copy match summary</button>}</div>{message && <p role="status">{message}</p>}</div>;
}
