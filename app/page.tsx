"use client";

import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AuthControls } from "@/components/auth/auth-controls";
import { PremiumGate } from "@/components/auth/premium-gate";
import { useAuth } from "@/hooks/use-auth";
import type { Match, SportId, Team } from "@/lib/sports";

type FeedPayload = {
  matches: Match[];
  generatedAt: string;
  provider: string;
  seasonSample: string;
  leagueCatalog: LeagueSummary[];
  liveCount: number;
  communityCount: number;
  status: "live" | "fallback";
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
  { id: "all", label: "All markets", icon: "grid" },
  { id: "football", label: "Football", icon: "football" },
  { id: "basketball", label: "Basketball", icon: "basketball" },
  { id: "tennis", label: "Tennis", icon: "tennis" },
];

const defaultLeagueCatalog: LeagueSummary[] = [
  { id: "4328", name: "Premier League", short: "PL", sport: "football", matchCount: 0, available: true },
  { id: "4335", name: "La Liga", short: "LL", sport: "football", matchCount: 0, available: true },
  { id: "4332", name: "Serie A", short: "SA", sport: "football", matchCount: 0, available: true },
  { id: "4331", name: "Bundesliga", short: "BL", sport: "football", matchCount: 0, available: true },
  { id: "4334", name: "Ligue 1", short: "L1", sport: "football", matchCount: 0, available: true },
  { id: "4480", name: "Champions League", short: "UCL", sport: "football", matchCount: 0, available: true },
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
  if (!match.probabilities.length) return { value: 0, label: "Awaiting history" };
  const best = Math.max(...match.probabilities);
  const index = match.probabilities.indexOf(best);
  return { value: best, label: outcomeLabels(match)[index] ?? "Top outcome" };
}

function confidenceTone(confidence: number) {
  if (confidence >= 75) return { label: "High confidence", tone: "high" };
  if (confidence >= 62) return { label: "Measured confidence", tone: "medium" };
  return { label: "Low sample", tone: "low" };
}

function ProbabilityBar({ match }: { match: Match }) {
  if (!match.probabilities.length) return <div className="small-empty">No model probabilities yet. Historical completed results are required.</div>;
  const labels = outcomeLabels(match);
  return <div className="probability-row" aria-label="Model outcome probabilities">{match.probabilities.map((probability, index) => <div className="probability-item" key={`${match.id}-${labels[index]}`}><div><span>{labels[index]}</span><strong>{probability}%</strong></div><div className="probability-track"><i style={{ width: `${probability}%` }}/></div></div>)}</div>;
}

function MatchRow({ match, onOpen }: { match: Match; onOpen: (match: Match) => void }) {
  const read = topRead(match);
  const confidence = confidenceTone(match.confidence);
  return <article className="match-row">
    <div className="match-competition"><span>{match.leagueShort}</span><div><strong>{match.league}</strong><small>{match.date} · {match.time} WAT</small></div></div>
    <div className="match-teams"><div><Crest team={match.home} compact/><strong>{match.home.name}</strong></div><span>vs</span><div><Crest team={match.away} compact/><strong>{match.away.name}</strong></div></div>
    <div className="match-probabilities">{match.probabilities.length ? match.probabilities.map((value, index) => <span className={value === read.value ? "top" : ""} key={`${match.id}-p-${index}`}><small>{outcomeLabels(match)[index]}</small><strong>{value}%</strong></span>) : <span><small>Model status</small><strong>Awaiting history</strong></span>}</div>
    <div className="match-confidence"><span className={`confidence-dot ${confidence.tone}`}/><div><strong>{match.probabilities.length ? `${match.confidence}%` : "—"}</strong><small>{match.probabilities.length ? confidence.label : "Not rated"}</small></div></div>
    <button className="row-action" onClick={() => onOpen(match)} aria-label={`Open ${match.home.name} versus ${match.away.name} analysis`}><Icon name="chevron" size={18}/></button>
  </article>;
}

function FeaturedSignal({ match, onOpen }: { match: Match; onOpen: (match: Match) => void }) {
  const read = topRead(match);
  const confidence = confidenceTone(match.confidence);
  return <section className="featured-signal">
    <div className="featured-top"><div><span className="eyebrow"><i/> Prime signal</span><p>{match.league} · {match.date}</p></div><span className={`confidence-pill ${confidence.tone}`}>{confidence.label}</span></div>
    <div className="featured-matchup">
      <div className="featured-team"><Crest team={match.home}/><strong>{match.home.name}</strong><span>Home</span></div>
      <div className="featured-time"><small>{match.time}</small><b>WAT</b><span>{match.model.topScoreline ? `Model score ${match.model.topScoreline}` : "Pre-match"}</span></div>
      <div className="featured-team away"><Crest team={match.away}/><strong>{match.away.name}</strong><span>Away</span></div>
    </div>
    <ProbabilityBar match={match}/>
    <div className="featured-bottom"><div><span>Strongest outcome</span><strong>{read.label} · {read.value}%</strong></div><div><span>Model confidence</span><strong>{match.confidence}%</strong></div><button onClick={() => onOpen(match)}>Open full analysis <Icon name="arrow" size={16}/></button></div>
  </section>;
}

function SignalStack({ matches, onOpen }: { matches: Match[]; onOpen: (match: Match) => void }) {
  return <section className="signal-stack"><div className="section-heading compact"><div><span className="eyebrow">Signal queue</span><h2>Next best reads</h2></div><span>{matches.length} ranked</span></div><div className="signal-list">{matches.slice(0, 4).map((match, index) => { const read = topRead(match); return <button onClick={() => onOpen(match)} className="signal-item" key={match.id}><span className="signal-rank">0{index + 1}</span><div className="signal-crests"><Crest team={match.home} compact/><Crest team={match.away} compact/></div><div className="signal-copy"><strong>{match.home.short} <span>vs</span> {match.away.short}</strong><small>{match.leagueShort} · {match.time}</small></div><div className="signal-read"><strong>{read.value}%</strong><small>{read.label}</small></div><Icon name="chevron" size={15}/></button>; })}{!matches.length && <div className="small-empty">Signals appear when fixtures are available.</div>}</div></section>;
}

function SideRail({ activeSport, onSport, leagues, activeLeague, onLeague, open, onClose }: { activeSport: string; onSport: (sport: "all" | "football" | "basketball" | "tennis") => void; leagues: LeagueSummary[]; activeLeague: string; onLeague: (league: string) => void; open: boolean; onClose: () => void }) {
  return <><button className={open ? "rail-scrim open" : "rail-scrim"} onClick={onClose} aria-label="Close navigation"/><aside className={open ? "side-rail open" : "side-rail"}>
    <div className="mobile-rail-head"><Brand/><button onClick={onClose} aria-label="Close navigation"><Icon name="close"/></button></div>
    <nav><p>Markets</p>{sports.map((sport) => <button className={activeSport === sport.id ? "active" : ""} onClick={() => { onSport(sport.id); onClose(); }} key={sport.id}><Icon name={sport.icon}/><span>{sport.label}</span>{sport.id !== "all" && <i/>}</button>)}</nav>
    <nav className="league-nav"><p>Football leagues</p><button className={activeLeague === "all" ? "active" : ""} onClick={() => onLeague("all")}><span className="league-code">ALL</span><span>All competitions</span></button>{leagues.filter((league) => league.sport === "football").map((league) => <button className={activeLeague === league.id ? "active" : ""} onClick={() => { onSport("football"); onLeague(league.id); onClose(); }} key={league.id}><span className="league-code">{league.short}</span><span>{league.name}</span><b>{league.matchCount}</b></button>)}</nav>
    <div className="rail-spacer"/>
    <div className="model-health"><div><span><Icon name="shield" size={16}/></span><div><strong>Model status</strong><small>Checks passing</small></div></div><i><b/></i><p>Predictions are versioned and evaluated before promotion.</p></div>
    <div className="rail-links"><Link href="/slips"><Icon name="bookmark" size={17}/> Saved reads</Link><Link href="/tracker"><Icon name="chart" size={17}/> Performance tracker</Link></div>
  </aside></>;
}

function PredictionDrawer({ match, onClose }: { match: Match | null; onClose: () => void }) {
  useEffect(() => {
    if (!match) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.body.classList.add("no-scroll");
    window.addEventListener("keydown", onKey);
    return () => { document.body.classList.remove("no-scroll"); window.removeEventListener("keydown", onKey); };
  }, [match, onClose]);
  if (!match) return null;
  const read = topRead(match);
  return <div className="drawer-layer" role="dialog" aria-modal="true" aria-label={`${match.home.name} versus ${match.away.name} analysis`}><button className="drawer-backdrop" onClick={onClose} aria-label="Close analysis"/><aside className="prediction-drawer">
    <div className="drawer-head"><div><span className="eyebrow"><i/> Match intelligence</span><small>{match.model.version}</small></div><button onClick={onClose} aria-label="Close analysis"><Icon name="close"/></button></div>
    <div className="drawer-match"><div><Crest team={match.home}/><strong>{match.home.name}</strong><small>{match.home.short}</small></div><span><b>{match.time}</b><small>{match.date}</small></span><div><Crest team={match.away}/><strong>{match.away.name}</strong><small>{match.away.short}</small></div></div>
    <div className="drawer-lead"><span>Model&apos;s strongest read</span><div><strong>{read.label}</strong>{match.probabilities.length > 0 && <b>{read.value}%</b>}</div><p>{match.model.method} · {match.model.sampleSize} historical matches in the available sample</p></div>
    <ProbabilityBar match={match}/>
    {match.probabilities.length > 0 && <div className="drawer-metrics"><div><span>Confidence</span><strong>{match.confidence}%</strong><small>{confidenceTone(match.confidence).label}</small></div>{match.model.expectedHome !== undefined && <div><span>Home xG</span><strong>{match.model.expectedHome}</strong><small>Expected goals</small></div>}{match.model.expectedAway !== undefined && <div><span>Away xG</span><strong>{match.model.expectedAway}</strong><small>Expected goals</small></div>}{match.model.expectedTotal !== undefined && <div><span>Total</span><strong>{match.model.expectedTotal}</strong><small>Model projection</small></div>}</div>}
    {match.predictions.length > 0 && <div className="drawer-section"><div className="section-heading compact"><div><span className="eyebrow">Outcome map</span><h2>Additional probabilities</h2></div></div><div className="market-grid">{match.predictions.slice(0, 6).map((prediction) => <div className={prediction.featured ? "market-card featured" : "market-card"} key={prediction.label}><span>{prediction.label}</span><strong>{prediction.value}</strong><p>{prediction.explanation}</p></div>)}</div></div>}
    {match.probabilities.length > 0 && <PremiumGate title="Advanced model read"><div className="premium-read"><div className="premium-read-head"><span><Icon name="spark"/></span><div><small>PREMIUM ANALYSIS</small><strong>Why the model leans {read.label}</strong></div></div><div className="factor-grid">{match.model.factors.map((factor) => <div key={factor.label}><span>{factor.label}</span><strong>{factor.value}</strong><i><b className={factor.tone} style={{ width: `${factor.strength}%` }}/></i><p>{factor.detail}</p></div>)}</div><div className="model-limit"><Icon name="shield" size={17}/><p><strong>Known limitation:</strong> {match.model.caveat}</p></div></div></PremiumGate>}
    <p className="drawer-disclaimer">Probabilities are analysis, not guarantees or betting advice.</p>
  </aside></div>;
}

function EmptyBoard({ loading, onRefresh, unrated = false }: { loading: boolean; onRefresh: () => void; unrated?: boolean }) {
  return <div className="board-empty"><span><Icon name={loading ? "refresh" : "clock"} size={24}/></span><h3>{loading ? "Loading the model board" : unrated ? "Fixtures awaiting history" : "No fixtures in this view"}</h3><p>{loading ? "Fetching the latest available fixtures and model outputs." : unrated ? "The listed fixtures need completed historical results before the model can publish probabilities." : "Try another sport, competition, or refresh the feed."}</p>{!loading && <button onClick={onRefresh}>Refresh feed <Icon name="refresh" size={15}/></button>}</div>;
}

export default function Home() {
  const { plan } = useAuth();
  const [feed, setFeed] = useState<FeedPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeSport, setActiveSport] = useState<"all" | "football" | "basketball" | "tennis">("all");
  const [activeLeague, setActiveLeague] = useState("all");
  const [query, setQuery] = useState("");
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [railOpen, setRailOpen] = useState(false);
  const lastLoadRef = useRef(0);

  const loadMatches = useCallback(async (force = false) => {
    setLoading(true);
    try {
      const bypass = force && Date.now() - lastLoadRef.current > 60_000;
      const response = await fetch(bypass ? `/api/matches?refresh=${Date.now()}` : "/api/matches", { cache: bypass ? "no-store" : "default" });
      if (!response.ok) throw new Error("Feed unavailable");
      setFeed(await response.json() as FeedPayload);
      lastLoadRef.current = Date.now();
    } catch {
      setFeed((current) => current ?? { matches: [], generatedAt: new Date().toISOString(), provider: "Unavailable", seasonSample: "Unavailable", leagueCatalog: defaultLeagueCatalog, liveCount: 0, communityCount: 0, status: "fallback" });
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadMatches(); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadMatches]);

  const supportedMatches = useMemo(() => (feed?.matches ?? []).filter((match) => match.sport === "football" || match.sport === "basketball" || match.sport === "tennis"), [feed]);
  const visibleMatches = useMemo(() => supportedMatches.filter((match) => {
    if (activeSport !== "all" && match.sport !== activeSport) return false;
    if (activeSport === "football" && activeLeague !== "all" && match.leagueId !== activeLeague) return false;
    const search = query.trim().toLowerCase();
    return !search || [match.home.name, match.away.name, match.league].some((value) => value.toLowerCase().includes(search));
  }), [activeLeague, activeSport, query, supportedMatches]);
  const rankedMatches = useMemo(() => visibleMatches.filter((match) => match.probabilities.length > 0).sort((a, b) => b.confidence - a.confidence), [visibleMatches]);
  const featured = rankedMatches[0] ?? null;
  const queue = featured ? rankedMatches.slice(1) : rankedMatches;
  const leagues = feed?.leagueCatalog ?? defaultLeagueCatalog;
  const strongSignals = supportedMatches.filter((match) => match.confidence >= 70).length;
  const updated = feed?.generatedAt ? new Date(feed.generatedAt).toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lagos" }) : "--:--";

  const selectSport = (sport: "all" | "football" | "basketball" | "tennis") => { setActiveSport(sport); if (sport !== "football") setActiveLeague("all"); };

  return <div className="pa-app">
    <header className="top-nav"><div className="nav-left"><button className="menu-button" onClick={() => setRailOpen(true)} aria-label="Open navigation"><Icon name="menu"/></button><Brand/><nav><a href="#board">Predictions</a><a href="#performance">Performance</a><a href="#plans">Plans</a></nav></div><div className="nav-right"><div className="global-search"><Icon name="search" size={17}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search team or league" aria-label="Search team or league"/></div><span className={`plan-chip ${plan}`}>{plan === "premium" ? "Pro active" : "Free plan"}</span><AuthControls/></div></header>
    <SideRail activeSport={activeSport} onSport={selectSport} leagues={leagues} activeLeague={activeLeague} onLeague={setActiveLeague} open={railOpen} onClose={() => setRailOpen(false)}/>
    <main className="dashboard-main">
      <section className="dashboard-intro" id="board"><div><span className="eyebrow"><i/> Live model board</span><h1>Today&apos;s predictions</h1><p>Fixture probabilities ranked by model confidence, with every assumption visible.</p></div><div className="board-actions"><span><i className={feed?.status === "live" ? "live" : ""}/>{feed?.status === "live" ? "Feed connected" : "Fallback mode"}<small>Updated {updated} WAT</small></span><button onClick={() => void loadMatches(true)} disabled={loading}><Icon name="refresh" size={16}/>{loading ? "Updating" : "Refresh"}</button></div></section>

      <section className="metric-strip"><div><span><Icon name="target"/></span><div><small>Fixtures scanned</small><strong>{supportedMatches.length}</strong></div><em>Current board</em></div><div><span><Icon name="spark"/></span><div><small>Strong signals</small><strong>{strongSignals}</strong></div><em>70%+ confidence</em></div><div><span><Icon name="model"/></span><div><small>Models running</small><strong>3</strong></div><em>Football · NBA · ATP</em></div><div><span><Icon name="shield"/></span><div><small>Research policy</small><strong>Open</strong></div><em>Losses published</em></div></section>

      <section className="primary-grid">{featured ? <FeaturedSignal match={featured} onOpen={setSelectedMatch}/> : <EmptyBoard loading={loading} unrated={visibleMatches.length > 0} onRefresh={() => void loadMatches(true)}/>}<SignalStack matches={queue} onOpen={setSelectedMatch}/></section>

      <section className="all-predictions"><div className="section-heading"><div><span className="eyebrow">Full board</span><h2>Every available fixture</h2><p>Sort by sport or competition. Open any fixture for the full probability map.</p></div><span>{visibleMatches.length} matches</span></div><div className="filter-row">{sports.map((sport) => <button className={activeSport === sport.id ? "active" : ""} key={sport.id} onClick={() => selectSport(sport.id)}><Icon name={sport.icon} size={16}/>{sport.label}</button>)}</div><div className="match-table-head"><span>Competition</span><span>Fixture</span><span>Outcome probability</span><span>Confidence</span><span/></div><div className="match-list">{visibleMatches.length ? visibleMatches.map((match) => <MatchRow match={match} onOpen={setSelectedMatch} key={match.id}/>) : <EmptyBoard loading={loading} onRefresh={() => void loadMatches(true)}/>}</div></section>

      <section className="performance-section" id="performance"><div className="performance-copy"><span className="eyebrow"><i/> Measured, not marketed</span><h2>We publish when the model loses.</h2><p>On our multi-season football benchmark, the market&apos;s de-vigged closing probabilities still outperform the current PredictArena football default. The stronger experimental model was not promoted because it failed the untouched later-season test.</p><div className="performance-notes"><span><Icon name="check" size={16}/> 4,560 walk-forward predictions</span><span><Icon name="check" size={16}/> Premier League and La Liga</span><span><Icon name="check" size={16}/> Test seasons kept untouched</span></div><Link href="#plans">How premium works <Icon name="arrow" size={16}/></Link></div><div className="benchmark-card"><div className="benchmark-head"><div><small>FOOTBALL BENCHMARK</small><strong>Log loss · lower is better</strong></div><span>Research set</span></div><div className="benchmark-bars"><div><span>Bookmaker close</span><i><b style={{ width: "96.3%" }}/></i><strong>0.963</strong></div><div><span>50:50 blend</span><i><b style={{ width: "97.4%" }}/></i><strong>0.974</strong></div><div><span>PA default</span><i><b style={{ width: "99.9%" }}/></i><strong>0.999</strong></div></div><div className="benchmark-foot"><Icon name="shield" size={17}/><p>The premium product will launch around richer, fresher inputs and strict holdout testing, not inflated accuracy claims.</p></div></div></section>

      <section className="plans-section" id="plans"><div className="section-heading"><div><span className="eyebrow">Membership</span><h2>Start free. Upgrade for depth.</h2><p>The same honest probabilities, with more context and tools when premium billing goes live.</p></div></div><div className="plan-grid"><article><span>Free</span><h3>Read the board</h3><p>For checking today&apos;s fixtures and seeing how the model leans.</p><strong>₦0<small>/month</small></strong><ul><li><Icon name="check" size={15}/> Headline probabilities</li><li><Icon name="check" size={15}/> Model confidence</li><li><Icon name="check" size={15}/> Public performance record</li></ul><button className="secondary-plan">Current plan</button></article><article className="pro-plan"><div className="plan-badge">COMING NEXT</div><span>PredictArena Pro</span><h3>Understand every read</h3><p>For members who want full factors, saved selections and personal tracking.</p><strong>Premium<small>billing in Phase 2</small></strong><ul><li><Icon name="check" size={15}/> Full factor breakdowns</li><li><Icon name="check" size={15}/> Saved prediction workspace</li><li><Icon name="check" size={15}/> Personal performance tracker</li><li><Icon name="check" size={15}/> Model update history</li></ul><button className="primary-plan" disabled><Icon name="lock" size={15}/> Payments being connected</button></article></div></section>
    </main>
    <footer className="pa-footer"><Brand/><p>Transparent sports prediction research. No stakes, payouts or guaranteed outcomes.</p><div><a href="#performance">Method</a><Link href="/tracker">Tracker</Link><span>© 2026</span></div></footer>
    <nav className="mobile-dock"><a href="#board" className="active"><Icon name="grid"/><span>Board</span></a><Link href="/slips"><Icon name="bookmark"/><span>Saved</span></Link><Link href="/tracker"><Icon name="chart"/><span>Tracker</span></Link><a href="#plans"><Icon name="spark"/><span>Pro</span></a></nav>
    <PredictionDrawer match={selectedMatch} onClose={() => setSelectedMatch(null)}/>
  </div>;
}
