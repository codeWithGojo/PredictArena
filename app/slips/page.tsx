"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Match } from "@/lib/sports";

import { confidenceLabel } from "@/lib/selections";
import { ALL_MARKETS, MARKET_GROUPS, bestOddsOption, selectionOptions, estimatedOdds, estimatedTotal, generateForOdds, MAX_TARGET_ODDS, targetTotal, type MarketGroup, type PredictionBasis } from "@/lib/odds-slip";
import { useSlip } from "@/hooks/use-slip";
import { MatchSummary } from "@/components/match-summary";
import { WeekTabs } from "@/components/week-tabs";
import { SiteHeader } from "@/components/site-header";
import { inMatchweek, matchweekLabel, relativeMatchweekStart, type MatchweekScope } from "@/lib/matchweeks";
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
  const [basis, setBasis] = useState<PredictionBasis>("auto");
  const [minimum, setMinimum] = useState(55);
  const [week, setWeek] = useState<MatchweekScope>("this");
  const [markets, setMarkets] = useState<MarketGroup[]>(ALL_MARKETS);
  const [filtersOpen, setFiltersOpen] = useState(false);
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
    Number.isFinite(Date.parse(match.kickoffISO)) && Date.parse(match.kickoffISO) > now && inMatchweek(match.kickoffISO, week, now) && selectionOptions(match, basis, markets).length), [feed, sport, now, basis, week, markets]);
  const competitions = useMemo(() => [...new Set((feed?.matches ?? []).filter((match) => sport === "all" || match.sport === sport).map((match) => match.league))].sort(), [feed, sport]);
  const visible = matches.filter((match) => (league === "all" || match.league === league) && (!search.trim() || `${match.home.name} ${match.away.name}`.toLowerCase().includes(search.trim().toLowerCase())));
  const byId = useMemo(() => new Map((feed?.matches ?? []).map((match) => [match.id, match])), [feed]);
  useEffect(() => {
    setPicks(current => current.map(pick => {
      const match = byId.get(pick.fixtureId);
      return match && match.kickoffISO !== pick.kickoffISO ? { ...pick, kickoffISO: match.kickoffISO } : pick;
    }));
  }, [byId, setPicks]);
  const validOdds = picks.length > 0 && picks.every((pick) => Number.isFinite(Number(pick.odds)) && Number(pick.odds) > 1 && Number(pick.odds) <= 1000);
  const combinedOdds = validOdds ? picks.reduce((product, pick) => product * Number(pick.odds), 1) : null;
  const suggestedTotal = estimatedTotal(picks);
  const selectionTotal = targetTotal(picks);
  const hasEstimates = picks.some(pick => !pick.odds);
  const weekRange = (offset: number) => now ? matchweekLabel(relativeMatchweekStart(now, offset)) : "";
  const weekTitle = week === "all" ? "all upcoming weeks" : `${week === "this" ? "this week" : "next week"} (${weekRange(week === "next" ? 1 : 0)})`;
  const outsideWeek = week !== "all" && picks.some(pick => !inMatchweek(pick.kickoffISO, week, now));
  const stakeNumber = Number(stake);
  const buildSlip = () => {
    const target = Number(targetOdds);
    if (!Number.isFinite(target) || target <= 1 || target > MAX_TARGET_ODDS) {
      setMessage("Enter target decimal odds greater than 1 and up to 10,000.");
      return;
    }
    if (!markets.length) { setMessage("Choose at least one market type."); return; }
    const generated = generateForOdds(visible, target, minimum, Date.now(), basis, markets);
    if (!generated.length) {
      setMessage(`No eligible selections for ${weekTitle} with these market and probability filters. Try another filter. Your current slip has been kept.`);
      return;
    }
    // Preserve actual prices only when the exact same market is selected again.
    setPicks(generated.map((pick) => ({ ...pick, odds: pick.odds || (picks.find((saved) => saved.fixtureId === pick.fixtureId && saved.market === pick.market && saved.selection === pick.selection && saved.line === pick.line)?.odds ?? "") })));
    const total = targetTotal(generated)!;
    const close = Math.abs(total / target - 1) <= .05;
    setMessage(`${generated.length} selections · ${generated.every(pick => pick.odds) ? "captured bookmaker" : "target total (includes estimates)"} odds ${total.toFixed(2)} · ${weekTitle}. ${close ? `Close to your ${target.toFixed(2)} target.` : `Closest combination found for your ${target.toFixed(2)} target; the strongest options may not reach it.`}`);
  };
  const add = (fixtureId: string, index: number) => {
    const match = byId.get(fixtureId);
    const pick = match && selectionOptions(match, basis, markets)[index];
    if (!pick) return;
    setPicks((current) => [...current.filter((item) => item.fixtureId !== fixtureId), pick].slice(-20));
    setMessage("");
  };
  const combinedProbability = picks.length ? picks.reduce((product, pick) => product * pick.probability, 1) : null;
  const slipText = picks.map((pick, index) => {
    const match = byId.get(pick.fixtureId);
    return `${index + 1}. ${match ? `${match.home.name} vs ${match.away.name}` : `${pick.home} vs ${pick.away}`} | ${new Date(pick.kickoffISO).toLocaleString("en-NG", { timeZone: "Africa/Lagos", dateStyle: "medium", timeStyle: "short" })} WAT | ${pick.label} | ${pick.probabilityBasis === "bookmaker" ? "Market estimate" : "Model"} ${Math.round(pick.probability * 100)}%${pick.odds && Number(pick.odds) > 1 && Number(pick.odds) <= 1000 ? ` | Bookmaker ${pick.odds}${pick.oddsSource && pick.oddsCapturedDate ? ` (captured ${pick.oddsCapturedDate})` : ""}` : ` | Estimated odds ${estimatedOdds(pick).toFixed(2)}`}`;
  }).join("\n");
  const copy = async () => {
    try { await navigator.clipboard.writeText(`PredictArena slip (research picks)\n${slipText}${hasEstimates ? `\nTarget total odds: ${selectionTotal?.toFixed(2)} (includes estimated odds, not a bookmaker quote)` : ""}${suggestedTotal && picks.every(p => !p.probabilityBasis) ? `\nEstimated total odds: ${suggestedTotal.toFixed(2)} (model-implied, not bookmaker prices)` : ""}${combinedOdds ? `\nCombined bookmaker odds: ${combinedOdds.toFixed(2)}` : ""}`); setMessage("Slip copied."); }
    catch { setMessage("Copy is unavailable in this browser."); }
  };
  return <><SiteHeader/><main className="slips-page compact-slips">
    <div className="slips-intro"><h1>Build your slip</h1><p>Set your target odds. We’ll compare the strongest options in your matchweek.</p></div>
    <WeekTabs value={week} onChange={value => { setWeek(value); setMessage(""); }} now={now}/>
    <form className="slips-tools slip-builder" noValidate onSubmit={event => { event.preventDefault(); buildSlip(); }}>
      <div className="slip-build-main">      <label>Target total odds<input type="number" inputMode="decimal" min="1.01" max={MAX_TARGET_ODDS} step="0.01" value={targetOdds} placeholder="e.g. 5.00" onChange={(event) => { setTargetOdds(event.target.value); setMessage(""); }} aria-describedby="target-odds-help" required/></label><button type="submit" disabled={loading || !!error}>Find selections</button></div>
      <div className="slip-filter-summary"><span>{sport === "all" ? "All sports" : sport[0].toUpperCase() + sport.slice(1)} · {markets.length === ALL_MARKETS.length ? "All markets" : `${markets.length} market types`} · {minimum}% minimum</span><button type="button" className="filters-toggle" aria-expanded={filtersOpen} aria-controls="slip-filters" onClick={() => setFiltersOpen(!filtersOpen)}>Filters {filtersOpen ? "−" : "+"}</button></div>
      {filtersOpen && <div id="slip-filters" className="slip-expanded-filters">
      <label>Sport<select value={sport} onChange={(event) => { setSport(event.target.value); setLeague("all"); if (["basketball", "tennis"].includes(event.target.value)) setBasis("model"); setMessage(""); }}><option value="all">All sports</option><option value="football">Football</option><option value="basketball">Basketball</option><option value="tennis">Tennis</option></select></label><label>Competition<select value={league} onChange={event => { setLeague(event.target.value); setMessage(""); }}><option value="all">All competitions</option>{competitions.map(name => <option key={name}>{name}</option>)}</select></label>      <label>Prediction basis<select value={basis} onChange={(event) => { setBasis(event.target.value as PredictionBasis); setMessage(""); }}><option value="auto">All available markets</option><option value="bookmaker">Captured prices only (1X2)</option><option value="model">History model (estimated odds)</option></select></label>
      <label>Minimum probability<select value={minimum} onChange={(event) => { setMinimum(Number(event.target.value)); setMessage(""); }}><option value="45">45%</option><option value="55">55%</option><option value="65">65%</option><option value="75">75%</option></select></label>      <fieldset className="slip-market-types"><legend>Market types</legend><div>{MARKET_GROUPS.map(group => <label key={group.id}><input type="checkbox" checked={markets.includes(group.id)} onChange={(event) => { setMarkets(current => event.target.checked ? [...current, group.id] : current.filter(id => id !== group.id)); setMessage(""); }}/>{group.label}</label>)}</div></fieldset>
      </div>}
    </form>
    <p className="slips-hint" id="target-odds-help">Only {weekTitle}. One pick per game. Missing prices use estimated odds.</p>
    <details className="odds-explainer"><summary>How the odds work</summary><p className="slips-hint" >{basis === "auto" ? "Compares all enabled market types. Captured 1X2 prices supply match-result and double-chance probabilities; goals and both-teams-to-score require history-model data. Unpriced selections use estimated odds (1 ÷ probability), not bookmaker quotes. Captured prices are from 7 October 2026 and are not live quotes." : basis === "bookmaker" ? "Uses SportyBet 1X2 prices captured on 7 October 2026. Probabilities come from the odds after normalizing the bookmaker margin. These snapshots are not live prices; check current odds before using a slip. Unpriced goals and double-chance markets are excluded." : "Uses estimated decimal odds (1 ÷ history-model probability). Confidence and history rank combinations; games with thin history are excluded."} One strongest eligible market per game, up to 20 games. Only {weekTitle}; Monday–Sunday in WAT.</p></details>
    {message && <p className="slip-feedback" role="status">{message}</p>}
    {outsideWeek && <p className="slips-hint">Your saved slip includes games outside this matchweek. Find selections to replace it with games from {weekTitle}.</p>}
    <div className="slips-layout"><section className="slips-fixtures">
      <div className="slip-browse"><div><h2>Choose your games</h2><small>{visible.length} available in this view</small></div><label><span className="sr-only">Search teams</span><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search teams"/></label></div>
      {loading ? <SlipSkeleton/> : error ? <p className="slips-state" role="alert">{error}</p> : !visible.length ? <p className="slips-state">No upcoming fixtures are available for this prediction basis and filter.</p> : <div className="slips-list">{visible.map((match) => {
        const options = selectionOptions(match, basis, markets); const selected = picks.find((pick) => pick.fixtureId === match.id); const best = bestOddsOption(match, minimum, basis, markets); const selectedIndex = selected ? options.findIndex(option => option.market === selected.market && option.selection === selected.selection && option.line === selected.line) : -1;
        const bestIndex = best ? options.findIndex(option => option.market === best.market && option.selection === best.selection && option.line === best.line) : -1;
        return <article className="slips-fixture match-row" key={match.id}>
          <MatchSummary match={match} pick={best}/>
          <div className="match-row-pick"><span>{best?.probabilityBasis === "bookmaker" ? "Market pick" : "Model pick"}</span><strong>{best?.label ?? "No option above your minimum"}</strong>{best && <b>{Math.round(best.probability * 100)}%</b>}</div>
          <div className="match-row-actions"><small>{best ? best.odds ? `Captured odds ${Number(best.odds).toFixed(2)}` : `Estimated odds ${estimatedOdds(best).toFixed(2)}` : "Adjust your filters"}{match.bookmakerInput && !match.probabilities.length ? " · Market only" : ` · ${confidenceLabel(match)}`}</small><button type="button" className="row-add" disabled={!best} onClick={() => bestIndex >= 0 && add(match.id, bestIndex)}>{selectedIndex === bestIndex && selectedIndex >= 0 ? "Added" : "Add pick"}</button></div>
          <details className="slip-market-picker"><summary>Other markets <span>{options.length} options</span></summary><label>Pick a market<select value={selectedIndex >= 0 ? selectedIndex : ""} onChange={event => add(match.id, Number(event.target.value))}><option value="" disabled>Select an option</option>{options.map((option, index) => <option key={`${option.market}-${option.selection}-${option.line}`} value={index}>{option.label} · {Math.round(option.probability * 100)}% · {option.odds ? `odds ${Number(option.odds).toFixed(2)}` : `est. ${estimatedOdds(option).toFixed(2)}`}</option>)}</select></label></details>
        </article>;

      })}</div>}
    </section><aside className="slip-paper"><div className="slip-paper-head"><span>MY SLIP</span><strong>{picks.length} {picks.length === 1 ? "selection" : "selections"}</strong></div>
      {!picks.length ? <p className="slip-empty">Enter your target odds and find selections, or choose markets yourself.</p> : <><div className="slip-legs">{picks.map((pick) => { const match = byId.get(pick.fixtureId); return <div className="slip-leg" key={pick.fixtureId}><button type="button" onClick={() => { setPicks((current) => current.filter((item) => item.fixtureId !== pick.fixtureId)); setMessage(""); }} aria-label={`Remove ${pick.label} for ${match?.home.name ?? "match"}`}>×</button><small>{match?.league ?? pick.league}</small><strong>{match ? `${match.home.name} vs ${match.away.name}` : `${pick.home} vs ${pick.away}`}</strong><small>{new Date(pick.kickoffISO).toLocaleString("en-NG", { timeZone: "Africa/Lagos", dateStyle: "medium", timeStyle: "short" })} WAT</small><span>{pick.label} <b>{Math.round(pick.probability * 100)}% {pick.probabilityBasis === "bookmaker" ? "market" : "model"}</b></span>{pick.probabilityBasis === "bookmaker" ? <small>{match?.bookmakerInput?.bookmaker ?? "Bookmaker"} probability input · captured {pick.oddsCapturedDate}{!pick.odds ? ` · estimated odds ${estimatedOdds(pick).toFixed(2)}` : ""}</small> : <small>Estimated odds {estimatedOdds(pick).toFixed(2)} · model-implied</small>}{match && match.probabilities.length > 0 && <small>Model confidence {match.confidence}/100 · {match.model.sampleSize} historical games</small>}<label>Bookmaker decimal odds (optional)<input inputMode="decimal" type="number" min="1.01" max="1000" step="0.01" placeholder="Enter actual odds" value={pick.odds} onChange={(event) => setPicks((current) => current.map((item) => item.fixtureId === pick.fixtureId ? { ...item, odds: event.target.value, oddsSource: undefined } : item))}/></label></div>; })}</div><label className="slip-stake">Stake (NGN, optional)<input inputMode="decimal" type="number" min="0" placeholder="Enter stake" value={stake} onChange={(event) => setStake(event.target.value)}/></label><div className="slip-summary">{hasEstimates && <><span>Target total odds <strong>{selectionTotal?.toFixed(2) ?? "—"}</strong></span><small>Includes estimated odds for unpriced markets; this is not a bookmaker quote.</small></>}{picks.every(p => !p.probabilityBasis) && <><span>Estimated total odds <strong>{suggestedTotal?.toFixed(2) ?? "—"}</strong></span><small>Model-implied odds; bookmaker prices can differ.</small></>}<span>Combined probability estimate <strong>{combinedProbability ? `${(combinedProbability * 100).toFixed(1)}%` : "—"}</strong></span><small>Assumes matches are independent; actual outcomes can be correlated.</small><span>Combined bookmaker odds <strong>{combinedOdds && Number.isFinite(combinedOdds) ? combinedOdds.toFixed(2) : "Enter odds for every leg"}</strong></span><span>Potential return <strong>{combinedOdds && Number.isFinite(combinedOdds) && stakeNumber > 0 ? `₦${(stakeNumber * combinedOdds).toLocaleString("en-NG", { maximumFractionDigits: 2 })}` : "—"}</strong></span></div><button className="slip-copy" type="button" onClick={() => void copy()}>Copy slip</button><button className="slip-clear" type="button" onClick={() => { setPicks([]); setStake(""); setMessage(""); }}>Clear selections</button></>}
      <p className="slip-note">Model and market percentages are estimates, not guarantees. Potential return uses captured or entered bookmaker prices and excludes fees, taxes and rule differences. Selections are saved on this device. Picks are removed after kickoff.</p>
    </aside></div>
  </main></>;
}
