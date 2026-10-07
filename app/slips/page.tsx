"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Match } from "@/lib/sports";

import { choices, confidenceLabel } from "@/lib/selections";
import { bestOddsOption, estimatedOdds, estimatedTotal, generateForOdds, MAX_TARGET_ODDS } from "@/lib/odds-slip";
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
  const [targetOdds, setTargetOdds] = useState("5");
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
  const suggestedTotal = estimatedTotal(picks);
  const stakeNumber = Number(stake);
  const buildSlip = () => {
    const target = Number(targetOdds);
    if (!Number.isFinite(target) || target <= 1 || target > MAX_TARGET_ODDS) {
      setMessage("Enter target decimal odds greater than 1 and up to 10,000.");
      return;
    }
    const generated = generateForOdds(visible, target, minimum);
    if (!generated.length) {
      setMessage("No games have enough history and a market above your minimum probability in this view. Try another competition or probability filter. Your current slip has been kept.");
      return;
    }
    // Preserve actual prices only when the exact same market is selected again.
    setPicks(generated.map((pick) => ({ ...pick, odds: picks.find((saved) => saved.fixtureId === pick.fixtureId && saved.market === pick.market && saved.selection === pick.selection && saved.line === pick.line)?.odds ?? "" })));
    const total = estimatedTotal(generated)!;
    const close = Math.abs(total / target - 1) <= .05;
    setMessage(`${generated.length} selections · estimated total odds ${total.toFixed(2)}. ${close ? `Close to your ${target.toFixed(2)} target.` : `Closest combination found for your ${target.toFixed(2)} target; the strongest options may not reach it.`}`);
  };
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
    return `${index + 1}. ${match ? `${match.home.name} vs ${match.away.name}` : `${pick.home} vs ${pick.away}`} | ${pick.label} | Model ${Math.round(pick.probability * 100)}%${pick.odds && Number(pick.odds) > 1 && Number(pick.odds) <= 1000 ? ` | Bookmaker ${pick.odds}` : ` | Estimated odds ${estimatedOdds(pick).toFixed(2)}`}`;
  }).join("\n");
  const copy = async () => {
    try { await navigator.clipboard.writeText(`PredictArena slip (research picks)\n${slipText}${suggestedTotal ? `\nEstimated total odds: ${suggestedTotal.toFixed(2)} (model-implied, not bookmaker prices)` : ""}${combinedOdds ? `\nCombined bookmaker odds: ${combinedOdds.toFixed(2)}` : ""}`); setMessage("Slip copied."); }
    catch { setMessage("Copy is unavailable in this browser."); }
  };
  return <main className="slips-page">
    <header className="slips-header"><Link href="/" className="pa-brand"><span className="pa-brand-mark"><i/><i/><i/></span><span>Predict<span>Arena</span></span></Link><Link href="/">Back to predictions</Link></header>
    <div className="slips-intro"><h1>Build your slip</h1><p>Enter your target total odds. We’ll choose a combination of upcoming games using model probabilities and confidence.</p></div>
    <form className="slips-tools" noValidate onSubmit={(event) => { event.preventDefault(); buildSlip(); }}>
      <label>Sport<select value={sport} onChange={(event) => { setSport(event.target.value); setLeague("all"); setMessage(""); }}><option value="all">All sports</option><option value="football">Football</option><option value="basketball">Basketball</option><option value="tennis">Tennis</option></select></label>
      <label>Target total odds<input type="number" inputMode="decimal" min="1.01" max={MAX_TARGET_ODDS} step="0.01" value={targetOdds} placeholder="e.g. 5.00" onChange={(event) => { setTargetOdds(event.target.value); setMessage(""); }} aria-describedby="target-odds-help" required/></label>
      <label>Minimum model probability<select value={minimum} onChange={(event) => { setMinimum(Number(event.target.value)); setMessage(""); }}><option value="45">45%</option><option value="55">55%</option><option value="65">65%</option><option value="75">75%</option></select></label>
      <button type="submit" disabled={loading || !!error}>Find selections</button>
    </form>
    <p className="slips-hint" id="target-odds-help">Targets use estimated decimal odds (1 ÷ model probability), not live bookmaker prices. The number of games is chosen automatically, up to 20. Each game uses its highest-probability usable market. Confidence and history rank the combinations; games with thin history are excluded.</p>
    {message && <p className="slip-feedback" role="status">{message}</p>}
    <div className="slips-layout"><section className="slips-fixtures">
      <div className="slip-browse"><label>Competition<select value={league} onChange={(event) => setLeague(event.target.value)}><option value="all">All competitions</option>{competitions.map((name) => <option key={name}>{name}</option>)}</select></label><label>Search teams<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Team name"/></label></div>
      {loading ? <SlipSkeleton/> : error ? <p className="slips-state" role="alert">{error}</p> : !visible.length ? <p className="slips-state">No upcoming fixtures with model probabilities are available in this view.</p> : <div className="slips-list">{visible.map((match) => {
        const options = choices(match); const selected = picks.find((pick) => pick.fixtureId === match.id); const best = bestOddsOption(match, minimum);
        return <article className="slips-fixture" key={match.id}><div><small>{match.league} · {new Date(match.kickoffISO).toLocaleString("en-NG", { timeZone: "Africa/Lagos", dateStyle: "medium", timeStyle: "short" })} WAT</small><h2>{match.home.name} <span>vs</span> {match.away.name}</h2><p>{confidenceLabel(match)} · {match.confidence}/100</p>{best && <p className="slips-best">Best model option: <strong>{best.label}</strong> · {Math.round(best.probability * 100)}% · estimated odds {estimatedOdds(best).toFixed(2)}</p>}</div><label>Pick a market<select value={selected ? options.findIndex((option) => option.market === selected.market && option.selection === selected.selection && option.line === selected.line) : ""} onChange={(event) => add(match.id, Number(event.target.value))}><option value="" disabled>Select an option</option>{options.map((option, index) => <option key={`${option.market}-${option.selection}-${option.line}`} value={index}>{best && option.market === best.market && option.selection === best.selection && option.line === best.line ? "Best model option · " : ""}{option.label} · {Math.round(option.probability * 100)}%</option>)}</select></label></article>;
      })}</div>}
    </section><aside className="slip-paper"><div className="slip-paper-head"><span>MY SLIP</span><strong>{picks.length} {picks.length === 1 ? "selection" : "selections"}</strong></div>
      {!picks.length ? <p className="slip-empty">Enter your target odds and find selections, or choose markets yourself.</p> : <><div className="slip-legs">{picks.map((pick) => { const match = byId.get(pick.fixtureId); return <div className="slip-leg" key={pick.fixtureId}><button type="button" onClick={() => { setPicks((current) => current.filter((item) => item.fixtureId !== pick.fixtureId)); setMessage(""); }} aria-label={`Remove ${pick.label} for ${match?.home.name ?? "match"}`}>×</button><small>{match?.league ?? pick.league}</small><strong>{match ? `${match.home.name} vs ${match.away.name}` : `${pick.home} vs ${pick.away}`}</strong><span>{pick.label} <b>{Math.round(pick.probability * 100)}% model</b></span><small>Estimated odds {estimatedOdds(pick).toFixed(2)} · model-implied</small>{match && <small>Model confidence {match.confidence}/100 · {match.model.sampleSize} historical games</small>}<label>Bookmaker decimal odds (optional)<input inputMode="decimal" type="number" min="1.01" max="1000" step="0.01" placeholder="Enter actual odds" value={pick.odds} onChange={(event) => setPicks((current) => current.map((item) => item.fixtureId === pick.fixtureId ? { ...item, odds: event.target.value } : item))}/></label></div>; })}</div><label className="slip-stake">Stake (NGN, optional)<input inputMode="decimal" type="number" min="0" placeholder="Enter stake" value={stake} onChange={(event) => setStake(event.target.value)}/></label><div className="slip-summary"><span>Estimated total odds <strong>{suggestedTotal?.toFixed(2) ?? "—"}</strong></span><small>Model-implied odds; bookmaker prices can differ.</small><span>Estimated combined probability <strong>{combinedProbability ? `${(combinedProbability * 100).toFixed(1)}%` : "—"}</strong></span><small>Assumes matches are independent; actual outcomes can be correlated.</small><span>Combined bookmaker odds <strong>{combinedOdds && Number.isFinite(combinedOdds) ? combinedOdds.toFixed(2) : "Enter odds for every leg"}</strong></span><span>Potential return <strong>{combinedOdds && Number.isFinite(combinedOdds) && stakeNumber > 0 ? `₦${(stakeNumber * combinedOdds).toLocaleString("en-NG", { maximumFractionDigits: 2 })}` : "—"}</strong></span></div><button className="slip-copy" type="button" onClick={() => void copy()}>Copy slip</button><button className="slip-clear" type="button" onClick={() => { setPicks([]); setStake(""); setMessage(""); }}>Clear selections</button></>}
      <p className="slip-note">Model percentages are estimates, not bookmaker odds. Potential return uses only odds you enter and excludes fees, taxes and rule differences. Selections are saved on this device. Picks are removed after kickoff.</p>
    </aside></div>
  </main>;
}
