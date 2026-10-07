"use client";

import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MatchActions } from "@/components/growth/match-actions";
import { PremiumAnalysis } from "@/components/growth/premium-analysis";
import { usePreferences } from "@/hooks/use-preferences";
import { AuthControls } from "@/components/auth/auth-controls";
import { PremiumGate } from "@/components/auth/premium-gate";
import { useSlip } from "@/hooks/use-slip";
import { bestOddsOption, bookmakerOptions } from "@/lib/odds-slip";
import { canRecommend, choices, confidenceLabel, headlinePick, type SlipPick } from "@/lib/selections";
import type { Match, SportId, Team } from "@/lib/sports";
import { matchweekLabel, matchweekStart } from "@/lib/matchweeks";

type FeedPayload = {
  matches: Match[];
  generatedAt: string;
  provider: string;
  seasonSample: string;
  leagueCatalog: LeagueSummary[];
  liveCount: number;
  communityCount: number;
  status: "live" | "fallback";
  freshness?: { stale: boolean; fetchedAt: string; ageSeconds: number };
};

type LeagueSummary = {
  id: string;
  name: string;
  short: string;
  sport: Exclude<SportId, "all">;
  matchCount: number;
  available: boolean;
};

type IconName =
  | "arrow" | "basketball" | "bookmark" | "chart" | "check" | "chevron"
  | "clock" | "close" | "football" | "grid" | "lock" | "menu" | "model"
  | "refresh" | "search" | "shield" | "spark" | "target" | "tennis";

const sports: Array<{ id: "all" | "football" | "basketball" | "tennis"; label: string; icon: IconName }> = [
  { id: "all", label: "All sports", icon: "grid" },
  { id: "football", label: "Football", icon: "football" },
  { id: "basketball", label: "Basketball", icon: "basketball" },
  { id: "tennis", label: "Tennis", icon: "tennis" },
];

const defaultLeagueCatalog: LeagueSummary[] = [
  { id: "39", name: "Premier League", short: "PL", sport: "football", matchCount: 0, available: true },
  { id: "140", name: "La Liga", short: "LL", sport: "football", matchCount: 0, available: true },
  { id: "135", name: "Serie A", short: "SA", sport: "football", matchCount: 0, available: true },
  { id: "78", name: "Bundesliga", short: "BL", sport: "football", matchCount: 0, available: true },
  { id: "61", name: "Ligue 1", short: "L1", sport: "football", matchCount: 0, available: true },
  { id: "2", name: "Champions League", short: "UCL", sport: "football", matchCount: 0, available: true },
];

function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, React.ReactNode> = {
    arrow: <><path d="M5 12h14M14 7l5 5-5 5"/></>,
    basketball: <><circle cx="12" cy="12" r="9"/><path d="M4.7 7c4.4 2.5 8.7 6.8 11.8 11.3M7.4 19.4c1.2-5.7 5.2-10.4 11-12.4M12 3v18M3 12h18"/></>,
    bookmark: <path d="M6 4.5A1.5 1.5 0 0 1 7.5 3h9A1.5 1.5 0 0 1 18 4.5V21l-6-3.7L6 21z"/>,
    chart: <><path d="M4 19V9M10 19V5M16 19v-7M22 19H2"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
    chevron: <path d="m9 18 6-6-6-6"/>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    close: <><path d="m6 6 12 12M18 6 6 18"/></>,
    football: <><circle cx="12" cy="12" r="9"/><path d="m9.5 9.2 2.5-1.8 2.5 1.8-.9 2.9h-3.2zM5.2 9l4.3.2M7.1 16.2l3.3-4.1M13.6 12.1l3.3 4.1M18.8 9l-4.3.2"/></>,
    grid: <><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></>,
    lock: <><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/></>,
    menu: <><path d="M4 7h16M4 12h16M4 17h16"/></>,
    model: <><path d="M12 3 4 7v10l8 4 8-4V7zM4 7l8 4 8-4M12 11v10"/></>,
    refresh: <><path d="M20 7v5h-5M4 17v-5h5"/><path d="M18.2 9A7 7 0 0 0 6.3 6.3L4 9M5.8 15A7 7 0 0 0 17.7 17.7L20 15"/></>,
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
    shield: <><path d="M12 3 5 6v5c0 4.6 2.8 8.3 7 10 4.2-1.7 7-5.4 7-10V6z"/><path d="m9 12 2 2 4-4"/></>,
    spark: <path d="m12 2 1.7 5.3L19 9l-5.3 1.7L12 16l-1.7-5.3L5 9l5.3-1.7zM19 16l.7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7z"/>,
    target: <><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/></>,
    tennis: <><circle cx="12" cy="12" r="9"/><path d="M5.7 5.7c4 4 8.6 8.6 12.6 12.6M18.3 5.7c-3 3-4.7 7.5-4.1 12.5M5.7 18.3c3-3 4.7-7.5 4.1-12.5"/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function Brand() {
  return <Link href="/" className="pa-brand" aria-label="PredictArena home"><span className="pa-brand-mark"><i/><i/><i/></span><span>Predict<span>Arena</span></span></Link>;
}

function Crest({ team, compact = false }: { team: Team; compact?: boolean }) {
  if (team.badge) return <span className={compact ? "team-crest compact" : "team-crest"}><Image src={team.badge} width={compact ? 34 : 54} height={compact ? 34 : 54} alt="" unoptimized /></span>;
  return <span className={compact ? "team-crest compact" : "team-crest"} style={{ "--crest-a": team.colors[0], "--crest-b": team.colors[1] } as React.CSSProperties}>{team.short.slice(0, 3)}</span>;
}

function outcomeLabels(match: Match) {
  return match.sport === "football" ? [match.home.short, "Draw", match.away.short] : [match.home.short, match.away.short];
}

function topRead(match: Match) {
  if (!match.probabilities.length) { const pick = bestOddsOption(match, 1, "bookmaker"); return { value: pick ? Math.round(pick.probability * 100) : 0, label: pick?.label ?? "Awaiting history" }; }
  const best = Math.max(...match.probabilities);
  const index = match.probabilities.indexOf(best);
  return { value: best, label: outcomeLabels(match)[index] ?? "Top outcome" };
}

function ProbabilityBar({ match }: { match: Match }) {
  if (!match.probabilities.length) return <div className="small-empty">History-model probabilities require completed results. {match.bookmakerInput ? "Captured bookmaker estimates are shown below." : "No captured bookmaker prices are available."}</div>;
  const labels = outcomeLabels(match);
  return <div className="probability-row" aria-label="Model outcome probabilities">{match.probabilities.map((probability, index) => <div className="probability-item" key={`${match.id}-${labels[index]}`}><div><span>{labels[index]}</span><strong>{probability}%</strong></div><div className="probability-track"><i style={{ width: `${probability}%` }}/></div></div>)}</div>;
}

function PredictionDrawer({ match, onClose, onAdd, picks, followedTeams, onFollowTeam, preferencesReady }: { followedTeams: string[]; onFollowTeam: (team: string) => void; preferencesReady: boolean; match: Match | null; onClose: () => void; onAdd: (pick: SlipPick) => void; picks: SlipPick[] }) {
  const drawerRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!match) return;
    const previous = document.activeElement as HTMLElement | null;
    const first = drawerRef.current?.querySelector<HTMLButtonElement>("button");
    first?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "Tab") {
        const items = Array.from(drawerRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), [tabindex="0"]') ?? []);
        const first = items[0], last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.body.classList.add("no-scroll");
    window.addEventListener("keydown", onKey);
    return () => { document.body.classList.remove("no-scroll"); window.removeEventListener("keydown", onKey); previous?.focus(); };
  }, [match, onClose]);
  if (!match) return null;
  const read = topRead(match);
  return <div className="drawer-layer" role="dialog" aria-modal="true" aria-label={`${match.home.name} versus ${match.away.name} analysis`}><button className="drawer-backdrop" onClick={onClose} aria-label="Close analysis"/><aside ref={drawerRef} className="prediction-drawer">
    <div className="drawer-head"><div><span className="eyebrow"><i/> Match intelligence</span><small>{match.model.version}</small></div><button onClick={onClose} aria-label="Close analysis"><Icon name="close"/></button></div>
    <div className="drawer-match"><div><Crest team={match.home}/><strong>{match.home.name}</strong><small>{match.home.short}</small></div><span><b>{match.time}</b><small>{match.date}</small></span><div><Crest team={match.away}/><strong>{match.away.name}</strong><small>{match.away.short}</small></div></div>
    <div className="drawer-lead"><span>{!match.probabilities.length && match.bookmakerInput ? "Market-only strongest read" : "Model’s strongest read"}</span><div><strong>{read.label}</strong>{read.value > 0 && <b>{read.value}%</b>}</div><p>{match.model.method} · {match.model.sampleSize} historical matches in the available sample</p></div>
    <div className="team-follow-row">{[match.home.name,match.away.name].map(name => <button key={name} disabled={!preferencesReady} aria-pressed={followedTeams.includes(name)} onClick={() => onFollowTeam(name)}>{followedTeams.includes(name) ? "Following" : "Follow"} {name}</button>)}</div>
    <ProbabilityBar match={match}/><MatchActions key={match.id} match={match}/>
    {match.probabilities.length > 0 && <div className="drawer-metrics"><div><span>Confidence</span><strong>{match.confidence}%</strong><small>{confidenceLabel(match)}</small></div>{match.model.expectedHome !== undefined && <div><span>{match.sport === "football" ? "Home xG" : "Home points"}</span><strong>{match.model.expectedHome}</strong><small>{match.sport === "football" ? "Expected goals" : "Projected points"}</small></div>}{match.model.expectedAway !== undefined && <div><span>{match.sport === "football" ? "Away xG" : "Away points"}</span><strong>{match.model.expectedAway}</strong><small>{match.sport === "football" ? "Expected goals" : "Projected points"}</small></div>}{match.model.expectedTotal !== undefined && <div><span>Total</span><strong>{match.model.expectedTotal}</strong><small>Model projection</small></div>}</div>}
    {choices(match).length > 0 && <section className="drawer-section"><h2>Choose a market</h2><div className="drawer-markets">{choices(match).map((pick) => { const added = picks.some((item) => samePick(item, pick)); return <button key={`${pick.market}-${pick.selection}-${pick.line}`} className={added ? "selected" : ""} onClick={() => onAdd(pick)}><span>{pick.label}</span><strong>{Math.round(pick.probability * 100)}%</strong><small>{added ? "In your slip" : "Add to slip"}</small></button>; })}</div><p className="feed-note">{confidenceLabel(match)} · Confidence is a data-quality score, not the chance of winning.</p></section>}
    {!match.probabilities.length && match.bookmakerInput && <section className="drawer-section"><h2>Captured 1X2 markets</h2><div className="drawer-markets">{bookmakerOptions(match).map(pick => <button key={pick.selection} onClick={() => onAdd(pick)}><span>{pick.label}</span><strong>{Number(pick.odds).toFixed(2)}</strong><small>{Math.round(pick.probability * 100)}% market · Add to slip</small></button>)}</div></section>}
    {match.probabilities.length > 0 && <PremiumGate title="Advanced model read"><PremiumAnalysis key={match.id} fixtureId={match.id}/></PremiumGate>}
    {match.fixtureCorrection && <p className="feed-note">Kickoff corrected from the reviewed SportyBet screenshot. Times are shown in WAT.</p>}
    {match.bookmakerInput && <section className="drawer-section" aria-label="Bookmaker model input">
      <div className="section-heading compact"><div><span className="eyebrow">Captured {match.bookmakerInput.capturedDate}</span><h2>Odds-informed 1X2 input</h2></div></div>
      <p>{match.bookmakerInput.bookmaker} screenshot prices converted to market probabilities after normalizing the bookmaker margin. The slip generator can use this bookmaker basis; the history model remains available separately.</p>
      <div className="market-grid">{["Home", "Draw", "Away"].map((label, i) => <div className="market-card" key={label}><span>{label}</span><strong>{(match.bookmakerInput!.probabilities[i] * 100).toFixed(1)}%</strong><p>Captured odds {match.bookmakerInput!.odds[i].toFixed(2)}</p></div>)}</div>
      <p>Captured prices are not live quotes. This market input has not been validated as an improvement to the history model.</p>
    </section>}
    {match.recordingContext && <section className="drawer-section" aria-label="Recorded match information">
      <div className="section-heading compact"><div><span className="eyebrow">Recorded {match.recordingContext.recordedDate}</span><h2>Bookmaker comparison</h2></div></div>
      <p>{match.recordingContext.bookmaker} odds from your FotMob recording. These market estimates do not change the model prediction.</p>
      <div className="market-grid">{["Home", "Draw", "Away"].map((label, i) => <div className="market-card" key={label}><span>{label}</span><strong>{(match.recordingContext!.marketProbabilities[i] * 100).toFixed(1)}%</strong><p>Decimal odds {match.recordingContext!.odds[i].toFixed(2)}</p></div>)}</div>
      {(match.recordingContext.goalsLastFive.home !== null || match.recordingContext.goalsLastFive.away !== null) && <p>Goals in the last five matches: {match.home.name} {match.recordingContext.goalsLastFive.home ?? "unknown"}; {match.away.name} {match.recordingContext.goalsLastFive.away ?? "unknown"}. This sample may include other competitions.</p>}
      <p>{match.recordingContext.stale ? "Historical snapshot; current odds and injuries may have changed." : "Date-only snapshot; exact capture time is unverified."} Historical match dates, confirmed lineups and match-level xG are missing.</p>
    </section>}
    <p className="drawer-disclaimer">Probabilities are analysis, not guarantees or betting advice.</p>
  </aside></div>;
}

function samePick(a: SlipPick, b: SlipPick) {
  return a.fixtureId === b.fixtureId && a.market === b.market && a.selection === b.selection && a.line === b.line;
}

function PickCard({ match, onOpen, onAdd, picks }: { match: Match; onOpen: (match: Match) => void; onAdd: (pick: SlipPick) => void; picks: SlipPick[] }) {
  const pick = headlinePick(match) ?? bestOddsOption(match, 1, "bookmaker");
  const qualified = canRecommend(match);
  const added = pick && picks.some((item) => samePick(item, pick));
  return <article className="pick-card">
    <div className="pick-meta"><span>{match.league}</span><time dateTime={match.kickoffISO}>{match.date} · {match.time} WAT</time></div>
    <button className="pick-match" onClick={() => onOpen(match)} aria-label={`Analyse ${match.home.name} vs ${match.away.name}`}><span><Crest team={match.home} compact/><strong>{match.home.name}</strong></span><span><Crest team={match.away} compact/><strong>{match.away.name}</strong></span></button>
    <div className="pick-details"><div><span>{pick?.probabilityBasis === "bookmaker" ? "Market-only estimate" : qualified ? "Suggested market" : "Model estimate"}</span><strong>{pick?.label ?? "Awaiting history"}</strong></div><div><span>Probability</span><strong>{pick ? `${Math.round(pick.probability * 100)}%` : "—"}</strong></div></div>
    <p className="pick-confidence">{confidenceLabel(match)}{match.probabilities.length ? ` · ${match.confidence}/100` : ""}</p>
    <div className="pick-actions"><button className="pick-add" disabled={!pick} onClick={() => pick && onAdd(pick)}>{added ? "In your slip" : "Add to slip"}</button><button className="pick-analysis" onClick={() => onOpen(match)}>Full analysis</button></div>
  </article>;
}

function LoadingCards() {
  return <div className="pick-grid" role="status" aria-label="Loading predictions">{[0, 1, 2, 3].map((index) => <div className="pick-card skeleton-card" aria-hidden="true" key={index}><i/><i/><i/><i/><i/></div>)}</div>;
}

export default function Home() {
  const [feed, setFeed] = useState<FeedPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeSport, setActiveSport] = useState<"all" | "football" | "basketball" | "tennis">("football");
  const [activeLeague, setActiveLeague] = useState("all");
  const [selectedWeek, setSelectedWeek] = useState("first");
  const [view, setView] = useState<"all" | "following">("all");
  const [query, setQuery] = useState("");
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const preferences = usePreferences();
  const following = preferences.leagues;
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [now, setNow] = useState(0);
  const [notice, setNotice] = useState("");
  const { picks, addPick } = useSlip();
  const lastLoadRef = useRef(0);
  const requestRef = useRef<AbortController | null>(null);

  const loadMatches = useCallback(async (force = false) => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setLoading(true);
    setError("");
    try {
      const bypass = force && Date.now() - lastLoadRef.current > 60_000;
      const response = await fetch(bypass ? `/api/matches?refresh=${Date.now()}` : "/api/matches", { signal: controller.signal, cache: bypass ? "no-store" : "default" });
      if (!response.ok) throw new Error("Feed unavailable");
      setFeed(await response.json() as FeedPayload);
      lastLoadRef.current = Date.now();
    } catch (cause) {
      if (cause instanceof Error && cause.name === "AbortError") return;
      setError("We couldn’t refresh the fixtures. Please try again.");
    } finally { if (!controller.signal.aborted) setLoading(false); }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadMatches();
      setNow(Date.now());

    }, 0);
    const clock = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => { window.clearTimeout(timer); window.clearInterval(clock); requestRef.current?.abort(); };
  }, [loadMatches]);

  const supportedMatches = useMemo(() => (feed?.matches ?? []).filter((match) => ["football", "basketball", "tennis"].includes(match.sport) && Date.parse(match.kickoffISO) > now), [feed, now]);
  const filteredMatches = useMemo(() => supportedMatches.filter((match) => {
    if (activeSport !== "all" && match.sport !== activeSport) return false;
    if (activeSport === "football" && activeLeague !== "all" && match.leagueId !== activeLeague) return false;
    if (view === "following" && (!match.leagueId || !following.includes(match.leagueId)) && !preferences.teams.includes(match.home.name) && !preferences.teams.includes(match.away.name)) return false;
    const search = query.trim().toLowerCase();
    return !search || [match.home.name, match.away.name, match.league].some((value) => value.toLowerCase().includes(search));
  }), [activeLeague, activeSport, following, preferences.teams, query, supportedMatches, view]);
  const weeks = useMemo(() => [...new Set(filteredMatches.map((match) => matchweekStart(match.kickoffISO)).filter(Boolean))].sort(), [filteredMatches]);
  const activeWeek = selectedWeek === "all" ? "all" : weeks.includes(selectedWeek) ? selectedWeek : weeks[0];
  const visibleMatches = useMemo(() => filteredMatches.filter((match) => activeWeek === "all" || matchweekStart(match.kickoffISO) === activeWeek), [activeWeek, filteredMatches]);
  const weeklyGroups = useMemo(() => {
    const groups = new Map<string, Match[]>();
    for (const match of visibleMatches) { const key = matchweekStart(match.kickoffISO); groups.set(key, [...(groups.get(key) ?? []), match]); }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [visibleMatches]);
  const standout = useMemo(() => filteredMatches.filter(canRecommend).sort((a, b) => b.confidence - a.confidence).slice(0, 2), [filteredMatches]);
  const leagues = feed?.leagueCatalog ?? defaultLeagueCatalog;
  const updated = feed?.generatedAt ? new Date(feed.generatedAt).toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lagos" }) : null;
  const selectSport = (sport: typeof activeSport) => { setActiveSport(sport); setActiveLeague("all"); setSelectedWeek("first"); };
  const toggleLeague = preferences.toggleLeague;
  const add = (pick: SlipPick) => { addPick(pick); setNotice(`${pick.label} added to your slip.`); };
  const closeAnalysis = useCallback(() => setSelectedMatch(null), []);

  return <div className="pa-app clean-app">
    <a className="skip-link" href="#board">Skip to predictions</a>
    <header className="top-nav"><div className="nav-left"><Brand/><nav aria-label="Main navigation"><a href="#board">Predictions</a><Link href="/slips">My slip <span className="nav-count">{picks.length}</span></Link><Link href="/performance">Results</Link><Link href="/premium">Premium</Link></nav></div><div className="nav-right"><AuthControls/></div></header>
    <main className="dashboard-main" id="board">
      <section className="dashboard-intro"><div><h1>Find your next pick</h1><p>Football, basketball and tennis. The numbers, with the context.</p></div><div className="board-actions"><span>{updated ? `Last checked ${updated} WAT` : "Fetching fixtures"}</span><button onClick={() => void loadMatches(true)} disabled={loading} aria-label="Refresh fixtures"><Icon name="refresh" size={16}/>{loading ? "Updating" : "Refresh"}</button></div></section>
      {(feed?.freshness?.stale || leagues.some(l => !l.available)) && <p className="freshness-warning" role="status">{feed?.freshness?.stale ? "The feed is over an hour old. Showing the last available fixtures." : "Some competitions could not refresh. Their last available fixtures are retained."} Check kickoff times before relying on a forecast.</p>}
      <section className="feed-controls" aria-label="Prediction filters">
        <div className="feed-control-top"><div className="view-tabs" aria-label="Feed view"><button aria-pressed={view === "all"} onClick={() => setView("all")}>All predictions</button><button aria-pressed={view === "following"} onClick={() => setView("following")}>For you</button></div><button className="manage-leagues" aria-expanded={preferencesOpen} aria-controls="league-preferences" onClick={() => setPreferencesOpen(!preferencesOpen)}>Your leagues{following.length ? ` (${following.length})` : ""}</button></div>
        {preferencesOpen && <div id="league-preferences" className="league-preferences"><p>{preferences.signedIn ? "Choose competitions for your feed. Synced with your account." : "Choose competitions for your feed. Saved on this device; sign in to sync."}</p><div>{leagues.filter((league) => league.sport === "football").map((league) => <label key={league.id}><input type="checkbox" checked={following.includes(league.id)} disabled={!preferences.ready} onChange={() => toggleLeague(league.id)}/>{league.name}</label>)}</div><p>Open a match to follow either team.{preferences.teams.length ? ` Following ${preferences.teams.length} teams.` : ""}</p>{!!preferences.teams.length && <div className="team-follow-row">{preferences.teams.map(name => <button key={name} disabled={!preferences.ready} onClick={() => preferences.toggleTeam(name)} aria-label={`Unfollow ${name}`}>{name} ×</button>)}</div>}{preferences.error && <p role="alert">{preferences.error}</p>}</div>}
        <div className="browse-controls"><div className="filter-row" aria-label="Sport">{sports.map((sport) => <button aria-pressed={activeSport === sport.id} key={sport.id} onClick={() => selectSport(sport.id)}>{sport.label}</button>)}</div><div className="search-and-league"><label className="league-select"><span className="sr-only">Competition</span><select value={activeLeague} disabled={activeSport !== "football"} onChange={(event) => { setActiveLeague(event.target.value); setSelectedWeek("first"); }}><option value="all">All competitions</option>{leagues.filter((league) => league.sport === "football").map((league) => <option value={league.id} key={league.id}>{league.name}</option>)}</select></label><label className="global-search"><Icon name="search" size={17}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search teams" aria-label="Search team or league"/></label></div></div>
      </section>
      {error && <p className="feed-error" role="alert">{error}{feed && " Showing the last available fixtures."} <button onClick={() => void loadMatches(true)}>Try again</button></p>}
      {view === "following" && !following.length && !preferences.teams.length ? <section className="feed-empty"><h2>Which leagues do you follow?</h2><p>Choose your competitions to build your feed.</p><button onClick={() => setPreferencesOpen(true)}>Choose leagues</button></section> : <>
        {!!standout.length && <section className="standout-section"><div className="section-heading"><h2>Worth a closer look</h2><span>Across upcoming weeks</span></div><div className="pick-grid">{standout.map((match) => <PickCard match={match} onOpen={setSelectedMatch} onAdd={add} picks={picks} key={match.id}/>)}</div></section>}
        <section className="all-predictions"><div className="section-heading"><h2>{view === "following" ? "Your competitions" : "Upcoming matches"}</h2><span>{loading && !feed ? "Loading" : `${visibleMatches.length} matches`}</span></div>
          {!!weeks.length && <label className="week-select">Matchweek<select value={activeWeek ?? "all"} onChange={(event) => setSelectedWeek(event.target.value)}><option value="all">All upcoming weeks</option>{weeks.map((week) => <option value={week} key={week}>{matchweekLabel(week)}</option>)}</select></label>}
          {loading && !feed ? <LoadingCards/> : weeklyGroups.length ? weeklyGroups.map(([week, matches]) => <section className="week-group" key={week}><div className="week-heading"><h3>{matchweekLabel(week)}</h3><span>Kickoffs in WAT</span></div><div className="pick-grid">{matches.map((match) => <PickCard match={match} onOpen={setSelectedMatch} onAdd={add} picks={picks} key={match.id}/>)}</div></section>) : <div className="feed-empty"><h3>No upcoming matches in this view</h3><p>Try another competition or clear your search.</p><button onClick={() => { setQuery(""); setActiveLeague("all"); setView("all"); setSelectedWeek("all"); }}>Reset filters</button></div>}
          {!!visibleMatches.length && <p className="feed-note">Lower-confidence estimates remain available for analysis. Featured picks and automatic slips require at least 62/100 confidence and sufficient history.</p>}
        </section>
      </>}
      <section className="performance-section" id="performance"><div className="performance-copy"><h2>How the model measures up</h2><p>The bookmaker benchmark still outperforms our current football model on the historical test set. These results cover 4,560 predictions across the Premier League and La Liga.</p><Link href="/performance">View the published forecast record</Link></div><div className="benchmark-card"><div className="benchmark-head"><strong>Historical log loss</strong><span>Lower is better</span></div><dl className="benchmark-results"><div><dt>Bookmaker closing probabilities</dt><dd>0.963</dd></div><div><dt>50:50 model and market blend</dt><dd>0.974</dd></div><div><dt>PredictArena default</dt><dd>0.999</dd></div></dl><p className="feed-note">Historical benchmark, not a record of today’s published picks. Confidence scores are not measured win rates.</p></div></section>
      <section className="membership-note" id="plans"><div><h2>Free to explore</h2><p>Save forecasts to your account and check every published result. Premium early access is open.</p></div><Link className="growth-link" href="/premium">Explore Premium</Link></section>
    </main>
    <footer className="pa-footer"><Brand/><p>Statistical estimates. No guaranteed outcomes.</p><div><a href="#performance">Method</a><Link href="/tracker">Saved forecasts</Link><span>© 2026</span></div></footer>
    <nav className="mobile-dock" aria-label="Mobile navigation"><a href="#board" className="active"><Icon name="football"/><span>Predictions</span></a><Link href="/slips"><Icon name="bookmark"/><span>My slip ({picks.length})</span></Link><Link href="/performance"><Icon name="chart"/><span>Results</span></Link><Link href="/tracker"><Icon name="target"/><span>Saved</span></Link></nav>
    {notice && <div className="slip-notice" role="status"><span>{notice}</span><Link href="/slips">View slip ({picks.length})</Link><button aria-label="Dismiss notification" onClick={() => setNotice("")}>×</button></div>}
    <PredictionDrawer match={selectedMatch} onClose={closeAnalysis} onAdd={add} picks={picks} followedTeams={preferences.teams} onFollowTeam={preferences.toggleTeam} preferencesReady={preferences.ready}/>
  </div>;
}
