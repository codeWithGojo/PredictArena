"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Match, Prediction } from "@/lib/sports";

type Pick = { fixtureId: string; market: string; selection: string; line: number | null; label: string; probability: number; odds: string };
type Feed = { matches?: Match[]; generatedAt?: string; status?: string };

function choices(match: Match): Pick[] {
  if (!match.probabilities.length) return [];
  return match.predictions.flatMap((prediction: Prediction) => {
    const probability = prediction.probability ?? (prediction.value.endsWith("%") ? Number(prediction.value.slice(0, -1)) / 100 : NaN);
    if (!Number.isFinite(probability) || probability <= 0 || probability >= 1) return [];
    let market = prediction.market;
    let selection = prediction.selection;
    let line = prediction.line ?? null;
    // Legacy feeds still supply labels. Accept only known labels, never a scoreline or a heuristic.
    if (!market || !selection) {
      const label = prediction.label.toLowerCase();
      const outcome = match.sport === "football" ? ["1x2", "home", "draw", "away"] : ["winner", "home", "away"];
      if (label === `${match.home.name.toLowerCase()} win`) [market, selection] = [outcome[0], "home"];
      else if (label === `${match.away.name.toLowerCase()} win`) [market, selection] = [outcome[0], "away"];
      else if (label === "draw" && match.sport === "football") [market, selection] = ["1x2", "draw"];
      else if (match.sport === "football") {
        if (label === "home or draw") [market, selection] = ["double-chance", "home-draw"];
        else if (label === "away or draw") [market, selection] = ["double-chance", "away-draw"];
        else if (label === "both teams score") [market, selection] = ["btts", "yes"];
        else {
          const total = /^(over|under) (1\.5|2\.5|3\.5) goals$/.exec(label);
          if (total) { [market, selection] = ["total", total[1]]; line = Number(total[2]); }
        }
      }
    }
    if (!market || !selection || !["1x2", "winner", "double-chance", "total", "btts"].includes(market)) return [];
    return [{ fixtureId: match.id, market, selection, line, label: prediction.label, probability, odds: "" }];
  });
}

function generate(matches: Match[], count: number, minimum: number): Pick[] {
  const candidates = matches.flatMap((match) => choices(match).filter((pick) => pick.probability * 100 >= minimum && pick.probability <= 0.85)
    .map((pick) => ({ pick, confidence: match.confidence })));
  candidates.sort((a, b) => (b.pick.probability * b.confidence) - (a.pick.probability * a.confidence) || a.pick.fixtureId.localeCompare(b.pick.fixtureId));
  const seen = new Set<string>();
  return candidates.filter(({ pick }) => { if (seen.has(pick.fixtureId)) return false; seen.add(pick.fixtureId); return true; }).slice(0, count).map(({ pick }) => pick);
}

export default function SlipsPage() {
  const [feed, setFeed] = useState<Feed | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sport, setSport] = useState("all");
  const [count, setCount] = useState(3);
  const [minimum, setMinimum] = useState(55);
  const [picks, setPicks] = useState<Pick[]>([]);
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
  const slipText = picks.map((pick, index) => {
    const match = byId.get(pick.fixtureId);
    return `${index + 1}. ${match ? `${match.home.name} vs ${match.away.name}` : pick.fixtureId} | ${pick.label} | Model ${Math.round(pick.probability * 100)}%${pick.odds ? ` | Bookmaker ${pick.odds}` : ""}`;
  }).join("\n");
  const copy = async () => {
    try { await navigator.clipboard.writeText(`PredictArena slip (research picks)\n${slipText}${combinedOdds ? `\nCombined bookmaker odds: ${combinedOdds.toFixed(2)}` : ""}`); setMessage("Slip copied."); }
    catch { setMessage("Copy is unavailable in this browser."); }
  };
  return <main className="slips-page">
    <header className="slips-header"><Link href="/" className="pa-brand"><span className="pa-brand-mark"><i/><i/><i/></span><span>Predict<span>Arena</span></span></Link><Link href="/">Back to predictions</Link></header>
    <div className="slips-intro"><span className="eyebrow">YOUR PICKS</span><h1>Slip generator</h1><p>Build a selection from upcoming modelled fixtures. Choose a market for each match or let the generator assemble one for you.</p></div>
    <div className="slips-layout"><section className="slips-fixtures">
      <div className="slips-tools"><label>Sport<select value={sport} onChange={(event) => setSport(event.target.value)}><option value="all">All sports</option><option value="football">Football</option><option value="basketball">Basketball</option><option value="tennis">Tennis</option></select></label><label>Legs<input type="number" min="1" max="20" value={count} onChange={(event) => setCount(Math.min(20, Math.max(1, Number(event.target.value) || 1)))}/></label><label>Minimum model probability<select value={minimum} onChange={(event) => setMinimum(Number(event.target.value))}><option value="45">45%</option><option value="55">55%</option><option value="65">65%</option><option value="75">75%</option></select></label><button type="button" onClick={() => { setPicks(generate(matches, count, minimum)); setMessage(""); }} disabled={!matches.length}>Generate slip</button></div>
      <p className="slips-hint">The generator selects at most one market per fixture and excludes outcomes above 85%. It ranks available choices by model probability and confidence, not expected betting value.</p>
      {loading ? <p className="slips-state">Loading upcoming fixtures…</p> : error ? <p className="slips-state" role="alert">{error}</p> : !matches.length ? <p className="slips-state">No upcoming fixtures with model probabilities are available in this view.</p> : <div className="slips-list">{matches.map((match) => {
        const options = choices(match); const selected = picks.find((pick) => pick.fixtureId === match.id);
        return <article className="slips-fixture" key={match.id}><div><small>{match.league} · {new Date(match.kickoffISO).toLocaleString("en-NG", { timeZone: "Africa/Lagos", dateStyle: "medium", timeStyle: "short" })} WAT</small><h2>{match.home.name} <span>vs</span> {match.away.name}</h2><p>Model confidence {match.confidence}%</p></div><label>Pick a market<select value={selected ? options.findIndex((option) => option.market === selected.market && option.selection === selected.selection && option.line === selected.line) : ""} onChange={(event) => add(match.id, Number(event.target.value))}><option value="" disabled>Select an option</option>{options.map((option, index) => <option key={`${option.market}-${option.selection}-${option.line}`} value={index}>{option.label} · {Math.round(option.probability * 100)}%</option>)}</select></label></article>;
      })}</div>}
    </section><aside className="slip-paper"><div className="slip-paper-head"><span>MY SLIP</span><strong>{picks.length} {picks.length === 1 ? "selection" : "selections"}</strong></div>
      {!picks.length ? <p className="slip-empty">Select a market or generate a slip to see your picks here.</p> : <><div className="slip-legs">{picks.map((pick) => { const match = byId.get(pick.fixtureId); return <div className="slip-leg" key={pick.fixtureId}><button type="button" onClick={() => setPicks((current) => current.filter((item) => item.fixtureId !== pick.fixtureId))} aria-label={`Remove ${pick.label} for ${match?.home.name ?? "match"}`}>×</button><small>{match?.league ?? "Fixture"}</small><strong>{match ? `${match.home.name} vs ${match.away.name}` : pick.fixtureId}</strong><span>{pick.label} <b>{Math.round(pick.probability * 100)}% model</b></span><label>Bookmaker decimal odds (optional)<input inputMode="decimal" type="number" min="1.01" max="1000" step="0.01" placeholder="Enter actual odds" value={pick.odds} onChange={(event) => setPicks((current) => current.map((item) => item.fixtureId === pick.fixtureId ? { ...item, odds: event.target.value } : item))}/></label></div>; })}</div><label className="slip-stake">Stake (NGN, optional)<input inputMode="decimal" type="number" min="0" placeholder="Enter stake" value={stake} onChange={(event) => setStake(event.target.value)}/></label><div className="slip-summary"><span>Combined bookmaker odds <strong>{combinedOdds && Number.isFinite(combinedOdds) ? combinedOdds.toFixed(2) : "Enter odds for every leg"}</strong></span><span>Potential return <strong>{combinedOdds && Number.isFinite(combinedOdds) && stakeNumber > 0 ? `₦${(stakeNumber * combinedOdds).toLocaleString("en-NG", { maximumFractionDigits: 2 })}` : "—"}</strong></span></div><button className="slip-copy" type="button" onClick={() => void copy()}>Copy slip</button><button className="slip-clear" type="button" onClick={() => { setPicks([]); setStake(""); }}>Clear selections</button>{message && <p role="status">{message}</p>}</>}
      <p className="slip-note">Model percentages are estimates, not bookmaker odds. Potential return uses only odds you enter and excludes fees, taxes and rule differences. Picks are kept on this page only.</p>
    </aside></div>
  </main>;
}
