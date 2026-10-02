"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Match } from "@/lib/sports";

import { choices, generate, confidenceLabel } from "@/lib/selections";
import { useSlip } from "@/hooks/use-slip";
function SlipSkeleton() {
  return <div className="skeleton-card" role="status" aria-label="Loading upcoming fixtures">{[0, 1, 2, 3].map((i) => <i aria-hidden="true" key={i}/>)}</div>;
}
type Feed = { matches?: Match[]; generatedAt?: string; status?: string };

export default function SlipsPage() {
  const [feed, setFeed] = useState<Feed | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sport, setSport] = useState("football");
  const [league, setLeague] = useState("all");
  const [search, setSearch] = useState("");
  const [count, setCount] = useState(3);
  const [minimum, setMinimum] = useState(55);
  const { picks, setPicks } = useSlip();
  const [stake, setStake] = useState("");
  const [message, setMessage] = useState("");
  const [now, setNow] = useState(0);
  useEffect(() => { const update = () => setNow(Date.now()); update(); const timer = window.setInterval(update, 60_000); return () => window.clearInterval(timer); }, []);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/matches", { signal: controller.signal }).then((response) => {
      if (!response.ok) throw new Error("The fixture feed is unavailable. Try again shortly.");
      return response.json() as Promise<Feed>;
    }).then(setFeed).catch((cause: Error) => { if (cause.name !== "AbortError") setError(cause.message); }).finally(() => setLoading(false));
    return () => controller.abort();
  }, []);
  const matches = useMemo(() => (feed?.matches ?? []).filter((match) =>
    ["football", "basketball", "tennis"].includes(match.sport) && (sport === "all" || sport === match.sport) &&
    Number.isFinite(Date.parse(match.kickoffISO)) && Date.parse(match.kickoffISO) > now && choices(match).length), [feed, sport, now]);
  const competitions = useMemo(() => [...new Set((feed?.matches ?? []).filter((match) => sport === "all" || match.sport === sport).map((match) => match.league))].sort(), [feed, sport]);
  const visible = matches.filter((match) => (league === "all" || match.league === league) && (!search.trim() || `${match.home.name} ${match.away.name}`.toLowerCase().includes(search.trim().toLowerCase())));
  const byId = useMemo(() => new Map((feed?.matches ?? []).map((match) => [match.id, match])), [feed]);
  const validOdds = picks.length > 0 && picks.every((pick) => Number.isFinite(Number(pick.odds)) && Number(pick.odds) > 1 && Number(pick.odds) <= 1000);
  const combinedOdds = validOdds ? picks.reduce((product, pick) => product * Number(pick.odds), 1) : null;
  const stakeNumber = Number(stake);
  const add = (fixtureId: string, index: number) => {
    const match = byId.get(fixtureId);
    const pick = match && choices(match)[index];
    if (!pick) return;
    setPicks((current) => [...current.filter((item) => item.fixtureId !== fixtureId), pick].slice(-20));
    setMessage("");
  };
  const combinedProbability = picks.length ? picks.reduce((product, pick) => product * pick.probability, 1) : null;
  const slipText = picks.map((pick, index) => {
    const match = byId.get(pick.fixtureId);
    return `${index + 1}. ${match ? `${match.home.name} vs ${match.away.name}` : `${pick.home} vs ${pick.away}`} | ${pick.label} | Model ${Math.round(pick.probability * 100)}%${pick.odds ? ` | Bookmaker ${pick.odds}` : ""}`;
  }).join("\n");
  const copy = async () => {
    try { await navigator.clipboard.writeText(`PredictArena slip (research picks)\n${slipText}${combinedOdds ? `\nCombined bookmaker odds: ${combinedOdds.toFixed(2)}` : ""}`); setMessage("Slip copied."); }
    catch { setMessage("Copy is unavailable in this browser."); }
  };
  return <main className="slips-page">
    <header className="slips-header"><Link href="/" className="pa-brand"><span className="pa-brand-mark"><i/><i/><i/></span><span>Predict<span>Arena</span></span></Link><Link href="/">Back to predictions</Link></header>
    <div className="slips-intro"><h1>Your slip</h1><p>Choose your markets or generate a slip from eligible upcoming matches.</p></div>
    <div className="slips-layout"><section className="slips-fixtures">
      <div className="slips-tools"><label>Sport<select value={sport} onChange={(event) => { setSport(event.target.value); setLeague("all"); }}><option value="all">All sports</option><option value="football">Football</option><option value="basketball">Basketball</option><option value="tennis">Tennis</option></select></label><label>Legs<input type="number" min="1" max="20" value={count} onChange={(event) => setCount(Math.min(20, Math.max(1, Number(event.target.value) || 1)))}/></label><label>Minimum model probability<select value={minimum} onChange={(event) => setMinimum(Number(event.target.value))}><option value="45">45%</option><option value="55">55%</option><option value="65">65%</option><option value="75">75%</option></select></label><button type="button" onClick={() => { const generated = generate(visible, count, minimum); setPicks(generated); setMessage(generated.length < count ? `Only ${generated.length} of ${count} selections met your filters and the confidence threshold. No lower-quality picks were added.` : "Slip generated."); }} disabled={!visible.length || loading}>Generate slip</button></div>
      <p className="slips-hint">Automatic picks need at least 62/100 confidence and sufficient history. One market per match, with estimated probabilities up to 85%. No bookmaker value is assumed.</p>
      <div className="slip-browse"><label>Competition<select value={league} onChange={(event) => setLeague(event.target.value)}><option value="all">All competitions</option>{competitions.map((name) => <option key={name}>{name}</option>)}</select></label><label>Search teams<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Team name"/></label></div>
      {message && <p className="slip-feedback" role="status">{message}</p>}
      {loading ? <SlipSkeleton/> : error ? <p className="slips-state" role="alert">{error}</p> : !visible.length ? <p className="slips-state">No upcoming fixtures with model probabilities are available in this view.</p> : <div className="slips-list">{visible.map((match) => {
        const options = choices(match); const selected = picks.find((pick) => pick.fixtureId === match.id);
        return <article className="slips-fixture" key={match.id}><div><small>{match.league} · {new Date(match.kickoffISO).toLocaleString("en-NG", { timeZone: "Africa/Lagos", dateStyle: "medium", timeStyle: "short" })} WAT</small><h2>{match.home.name} <span>vs</span> {match.away.name}</h2><p>{confidenceLabel(match)} · {match.confidence}/100</p></div><label>Pick a market<select value={selected ? options.findIndex((option) => option.market === selected.market && option.selection === selected.selection && option.line === selected.line) : ""} onChange={(event) => add(match.id, Number(event.target.value))}><option value="" disabled>Select an option</option>{options.map((option, index) => <option key={`${option.market}-${option.selection}-${option.line}`} value={index}>{option.label} · {Math.round(option.probability * 100)}%</option>)}</select></label></article>;
      })}</div>}
    </section><aside className="slip-paper"><div className="slip-paper-head"><span>MY SLIP</span><strong>{picks.length} {picks.length === 1 ? "selection" : "selections"}</strong></div>
      {!picks.length ? <p className="slip-empty">Select a market or generate a slip to see your picks here.</p> : <><div className="slip-legs">{picks.map((pick) => { const match = byId.get(pick.fixtureId); return <div className="slip-leg" key={pick.fixtureId}><button type="button" onClick={() => setPicks((current) => current.filter((item) => item.fixtureId !== pick.fixtureId))} aria-label={`Remove ${pick.label} for ${match?.home.name ?? "match"}`}>×</button><small>{match?.league ?? pick.league}</small><strong>{match ? `${match.home.name} vs ${match.away.name}` : `${pick.home} vs ${pick.away}`}</strong><span>{pick.label} <b>{Math.round(pick.probability * 100)}% model</b></span><label>Bookmaker decimal odds (optional)<input inputMode="decimal" type="number" min="1.01" max="1000" step="0.01" placeholder="Enter actual odds" value={pick.odds} onChange={(event) => setPicks((current) => current.map((item) => item.fixtureId === pick.fixtureId ? { ...item, odds: event.target.value } : item))}/></label></div>; })}</div><label className="slip-stake">Stake (NGN, optional)<input inputMode="decimal" type="number" min="0" placeholder="Enter stake" value={stake} onChange={(event) => setStake(event.target.value)}/></label><div className="slip-summary"><span>Estimated combined probability <strong>{combinedProbability ? `${(combinedProbability * 100).toFixed(1)}%` : "—"}</strong></span><small>Assumes matches are independent; actual outcomes can be correlated.</small><span>Combined bookmaker odds <strong>{combinedOdds && Number.isFinite(combinedOdds) ? combinedOdds.toFixed(2) : "Enter odds for every leg"}</strong></span><span>Potential return <strong>{combinedOdds && Number.isFinite(combinedOdds) && stakeNumber > 0 ? `₦${(stakeNumber * combinedOdds).toLocaleString("en-NG", { maximumFractionDigits: 2 })}` : "—"}</strong></span></div><button className="slip-copy" type="button" onClick={() => void copy()}>Copy slip</button><button className="slip-clear" type="button" onClick={() => { setPicks([]); setStake(""); }}>Clear selections</button></>}
      <p className="slip-note">Model percentages are estimates, not bookmaker odds. Potential return uses only odds you enter and excludes fees, taxes and rule differences. Selections are saved on this device. Picks are removed after kickoff.</p>
    </aside></div>
  </main>;
}
