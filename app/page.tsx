"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Match, SportId, Team } from "../lib/sports";
import {
  getQuizQuestions,
  QUESTION_POOL_SIZES,
  type QuizSport,
} from "../lib/question-engine";

type ViewId = "predictions" | "knowledge";
type ModelTab = "why" | "matrix" | "markets";

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

type LeaderboardEntry = {
  id: string;
  name: string;
  score: number;
  total: number;
  category: QuizSport;
  date: string;
};

const sportOptions: Array<{ id: SportId; label: string; icon: string }> = [
  { id: "all", label: "All sports", icon: "grid" },
  { id: "football", label: "Football", icon: "football" },
  { id: "basketball", label: "Basketball", icon: "basketball" },
  { id: "tennis", label: "Tennis", icon: "tennis" },
  { id: "codm", label: "CODM Africa", icon: "crosshair" },
  { id: "eafc", label: "EA FC Africa", icon: "controller" },
];

const defaultLeagueCatalog: LeagueSummary[] = [
  { id: "4328", name: "Premier League", short: "PL", sport: "football", matchCount: 0, available: true },
  { id: "4335", name: "La Liga", short: "LL", sport: "football", matchCount: 0, available: true },
  { id: "4332", name: "Serie A", short: "SA", sport: "football", matchCount: 0, available: true },
  { id: "4331", name: "Bundesliga", short: "BL", sport: "football", matchCount: 0, available: true },
  { id: "4334", name: "Ligue 1", short: "L1", sport: "football", matchCount: 0, available: true },
  { id: "4480", name: "Champions League", short: "UCL", sport: "football", matchCount: 0, available: true },
];

const quizSports: Array<{ id: QuizSport; icon: string; copy: string }> = [
  { id: "Football", icon: "football", copy: "World Cups, Champions League, Premier League and the rules." },
  { id: "Basketball", icon: "basketball", copy: "NBA champions, MVPs, Finals MVPs and basketball history." },
  { id: "Tennis", icon: "tennis", copy: "Grand Slam champions, eras, surfaces and record-book moments." },
  { id: "CODM", icon: "crosshair", copy: "Competitive formats, map pools, modes and the growing scene." },
  { id: "EA FC", icon: "controller", copy: "FC Pro rules, game modes, partner leagues and competition." },
];

const initialLeaders: LeaderboardEntry[] = [
  { id: "demo-1", name: "Kenny", score: 10, total: 10, category: "Football", date: "Today" },
  { id: "demo-2", name: "Zara", score: 9, total: 10, category: "CODM", date: "Today" },
  { id: "demo-3", name: "Tobi", score: 8, total: 10, category: "Basketball", date: "Yesterday" },
];

function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const paths: Record<string, React.ReactNode> = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></>,
    football: <><circle cx="12" cy="12" r="9"/><path d="m9.6 9.2 2.4-1.7 2.4 1.7-.9 2.8h-3zM5.1 9l4.5.2M7.2 16l2.4-4M14.4 12l2.4 4M18.9 9l-4.5.2M8.4 4.8 12 7.5l3.6-2.7"/></>,
    basketball: <><circle cx="12" cy="12" r="9"/><path d="M4.6 6.8c4.6 2.7 8.8 7.1 11.9 11.5M7.4 19.5c1.1-5.7 5.3-10.6 11-12.5M12 3v18M3 12h18"/></>,
    tennis: <><circle cx="12" cy="12" r="9"/><path d="M5.5 5.5c4.2 4.2 8.8 8.8 13 13M18.5 5.5c-3.1 3.1-4.7 7.7-4.2 12.7M5.5 18.5c3.1-3.1 4.7-7.7 4.2-12.7"/></>,
    crosshair: <><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></>,
    controller: <><path d="M8.2 7h7.6c2.1 0 3.8 1.4 4.2 3.5l1 5.4c.3 1.6-1 3.1-2.6 3.1-.7 0-1.4-.3-1.9-.9l-1.4-1.7H8.9l-1.4 1.7c-.5.6-1.2.9-1.9.9-1.6 0-2.9-1.5-2.6-3.1l1-5.4C4.4 8.4 6.1 7 8.2 7Z"/><path d="M7 11v4M5 13h4M16.5 11.5h.01M18.5 14h.01"/></>,
    trophy: <><path d="M8 4h8v5a4 4 0 0 1-8 0V4Z"/><path d="M8 6H4v2a4 4 0 0 0 4 4M16 6h4v2a4 4 0 0 1-4 4M12 13v4M8 21h8M9 17h6"/></>,
    chart: <><path d="M4 19V9M10 19V5M16 19v-7M22 19H2"/></>,
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
    database: <><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/></>,
    refresh: <><path d="M20 7v5h-5M4 17v-5h5"/><path d="M6.1 8.3A7 7 0 0 1 18.7 7M17.9 15.7A7 7 0 0 1 5.3 17"/></>,
    info: <><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></>,
    chevron: <path d="m9 18 6-6-6-6"/>,
    arrow: <><path d="M5 12h14M13 6l6 6-6 6"/></>,
    close: <path d="m6 6 12 12M18 6 6 18"/>,
    menu: <path d="M4 7h16M4 12h16M4 17h16"/>,
    check: <path d="m5 12 4 4L19 6"/>,
    spark: <><path d="m12 3 1.4 4.1L17.5 8.5l-4.1 1.4L12 14l-1.4-4.1-4.1-1.4 4.1-1.4L12 3Z"/><path d="m18.5 14 .8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z"/></>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name] ?? paths.grid}
    </svg>
  );
}

function Crest({ team, size = "md" }: { team: Team; size?: "sm" | "md" | "lg" }) {
  if (team.badge) {
    return (
      <span className={`crest crest-${size} has-image`} title={team.name}>
        {/* The API supplies the official team artwork URL. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={team.badge} alt={`${team.name} badge`}/>
      </span>
    );
  }
  return (
    <span
      className={`crest crest-${size}`}
      style={{ "--crest-a": team.colors[0], "--crest-b": team.colors[1] } as React.CSSProperties}
      aria-label={`${team.name} crest`}
      title={team.name}
    >
      <span>{team.short.slice(0, 3)}</span>
    </span>
  );
}

function Brand() {
  return <div className="brand" aria-label="PredictArena home"><span className="brand-mark"><span>P</span></span><span className="brand-name">Predict<span>Arena</span></span></div>;
}

function sourceClass(match: Match) {
  return match.source === "live-api" ? "live" : "community";
}

function ProbabilityStrip({ match }: { match: Match }) {
  const labels = match.probabilities.length === 3
    ? [match.home.short, "DRAW", match.away.short]
    : [match.home.short, match.away.short];
  const strongest = match.probabilities.indexOf(Math.max(...match.probabilities));
  return (
    <div className={`probability-strip ${match.probabilities.length === 2 ? "two-way" : ""}`}>
      {match.probabilities.map((probability, index) => (
        <div className={index === strongest ? "probability-cell primary" : "probability-cell"} key={`${labels[index]}-${index}`}>
          <span>{labels[index]}</span><strong>{probability}%</strong>
        </div>
      ))}
    </div>
  );
}

function FeaturedCard({ match, onOpen }: { match: Match; onOpen: (match: Match) => void }) {
  const sport = sportOptions.find((item) => item.id === match.sport);
  return (
    <article className="featured-card" onClick={() => onOpen(match)}>
      <div className="card-topline">
        <span className="league-label"><Icon name={sport?.icon ?? "grid"} size={14}/>{match.league}</span>
        <span className={`source-pill ${sourceClass(match)}`}>{match.source === "live-api" ? "API FIXTURE" : "COMMUNITY"}</span>
      </div>
      <div className="featured-matchup">
        <div className="featured-team"><Crest team={match.home} size="lg"/><strong>{match.home.name}</strong></div>
        <div className="kickoff"><span>{match.date}</span><strong>{match.time}</strong><small>WAT</small></div>
        <div className="featured-team"><Crest team={match.away} size="lg"/><strong>{match.away.name}</strong></div>
      </div>
      <ProbabilityStrip match={match}/>
      <div className="card-footnote"><span><i className="pulse-dot"/> {match.model.method}</span><strong>{match.confidence}% confidence</strong></div>
    </article>
  );
}

function MatchRow({ match, onOpen }: { match: Match; onOpen: (match: Match) => void }) {
  return (
    <div className="match-row">
      <div className="match-meta"><span>{match.date}</span><strong>{match.time}</strong><small>WAT</small></div>
      <div className="teams-stack">
        <div><Crest team={match.home} size="sm"/><span>{match.home.name}</span></div>
        <div><Crest team={match.away} size="sm"/><span>{match.away.name}</span></div>
      </div>
      <div className="prediction-chips" aria-label="Model probabilities">
        {match.predictions.slice(0, 4).map((prediction) => (
          <button onClick={() => onOpen(match)} className={`prediction-chip ${prediction.featured ? "featured" : ""}`} key={`${match.id}-${prediction.label}`}>
            <span>{prediction.label}</span><strong>{prediction.value}</strong>
          </button>
        ))}
      </div>
      <button className="row-arrow" onClick={() => onOpen(match)} aria-label={`Open ${match.home.name} versus ${match.away.name} analysis`}><Icon name="chevron" size={18}/></button>
    </div>
  );
}

function Sidebar({ activeSport, setActiveSport, activeLeague, setActiveLeague, open, setOpen, setView, view, matches, leagueCatalog }: {
  activeSport: SportId;
  setActiveSport: (sport: SportId) => void;
  activeLeague: string;
  setActiveLeague: (league: string) => void;
  open: boolean;
  setOpen: (open: boolean) => void;
  setView: (view: ViewId) => void;
  view: ViewId;
  matches: Match[];
  leagueCatalog: LeagueSummary[];
}) {
  const leagueItems = useMemo(() => {
    const targetSport = activeSport === "all" ? "football" : activeSport;
    const catalog = leagueCatalog.filter((league) => league.sport === targetSport);
    const knownIds = new Set(catalog.map((league) => league.id));
    const additional = matches
      .filter((match) => match.sport === targetSport && !knownIds.has(match.leagueId || match.league))
      .map((match) => ({ id: match.leagueId || match.league, name: match.league, short: match.leagueShort, sport: match.sport, matchCount: matches.filter((item) => item.league === match.league).length, available: true }));
    return [...catalog, ...additional.filter((league, index, list) => list.findIndex((item) => item.id === league.id) === index)];
  }, [activeSport, leagueCatalog, matches]);
  const countFor = (sport: SportId) => sport === "all" ? matches.length : matches.filter((match) => match.sport === sport).length;
  return (
    <>
      <aside className={`sidebar ${open ? "open" : ""}`}>
        <div className="sidebar-head"><Brand/><button className="mobile-close" onClick={() => setOpen(false)} aria-label="Close menu"><Icon name="close"/></button></div>
        <nav className="primary-nav" aria-label="Primary navigation">
          <button className={view === "predictions" ? "active" : ""} onClick={() => { setView("predictions"); setOpen(false); }}><Icon name="chart"/><span>Predictions</span></button>
          <button className={view === "knowledge" ? "active" : ""} onClick={() => { setView("knowledge"); setOpen(false); }}><Icon name="trophy"/><span>Knowledge test</span><em>6.2K</em></button>
        </nav>
        <div className="sidebar-section">
          <p>SPORTS</p>
          <div className="sport-list">
            {sportOptions.slice(1).map((sport) => (
              <button className={activeSport === sport.id ? "active" : ""} key={sport.id} onClick={() => { setActiveSport(sport.id); setView("predictions"); setOpen(false); }}>
                <span><Icon name={sport.icon} size={17}/>{sport.label}</span><b>{countFor(sport.id)}</b>
              </button>
            ))}
          </div>
        </div>
        <div className="sidebar-section league-links">
          <p>{activeSport === "all" || activeSport === "football" ? "FOOTBALL LEAGUES" : "LIVE LEAGUES"}</p>
          {leagueItems.length ? leagueItems.map((league) => <button className={activeSport === league.sport && activeLeague === league.id ? "active" : ""} key={league.id} onClick={() => { setActiveSport(league.sport); setActiveLeague(league.sport === "football" ? league.id : "all"); setView("predictions"); setOpen(false); }}><span className={`mini-orb ${league.matchCount ? "live" : ""}`}/>{league.name}<b>{league.matchCount}</b></button>) : <p className="sidebar-empty">Waiting for fixtures</p>}
        </div>
        <div className="sidebar-note"><span><Icon name="info" size={15}/> PROBABILITY, NOT A BET</span><p>No stakes and no payouts. Every number is a PredictArena model estimate.</p></div>
        <p className="sidebar-credit">Built in Nigeria <span>•</span> v2.0</p>
      </aside>
      {open && <button className="sidebar-scrim" aria-label="Close menu" onClick={() => setOpen(false)}/>} 
    </>
  );
}

function Topbar({ view, setView, setSidebarOpen, onSearch }: {
  view: ViewId;
  setView: (view: ViewId) => void;
  setSidebarOpen: (open: boolean) => void;
  onSearch: () => void;
}) {
  return (
    <header className="topbar">
      <button className="mobile-menu" onClick={() => setSidebarOpen(true)} aria-label="Open menu"><Icon name="menu"/></button>
      <div className="mobile-brand"><Brand/></div>
      <nav className="view-tabs" aria-label="Page views">
        <button className={view === "predictions" ? "active" : ""} onClick={() => setView("predictions")}>Live prediction board</button>
        <button className={view === "knowledge" ? "active" : ""} onClick={() => setView("knowledge")}><span>Test your knowledge</span><b>6.2K</b></button>
      </nav>
      <div className="topbar-actions">
        <button className="search-button" onClick={onSearch}><Icon name="search" size={17}/><span>Search matches</span><kbd>⌘ K</kbd></button>
        <span className="model-status"><i/> Model online</span>
        <button className="avatar" aria-label="Profile">FI</button>
      </div>
    </header>
  );
}

function SportTabs({ activeSport, setActiveSport, matches }: { activeSport: SportId; setActiveSport: (sport: SportId) => void; matches: Match[] }) {
  const countFor = (sport: SportId) => sport === "all" ? matches.length : matches.filter((match) => match.sport === sport).length;
  return (
    <div className="sport-tabs" role="tablist" aria-label="Filter predictions by sport">
      {sportOptions.map((sport) => (
        <button role="tab" aria-selected={activeSport === sport.id} className={activeSport === sport.id ? "active" : ""} key={sport.id} onClick={() => setActiveSport(sport.id)}>
          <span className="sport-tab-icon"><Icon name={sport.icon} size={19}/></span><span>{sport.label}</span><b>{countFor(sport.id)}</b>
        </button>
      ))}
    </div>
  );
}

function FootballLeagueTabs({ activeLeague, leagues, onSelect }: { activeLeague: string; leagues: LeagueSummary[]; onSelect: (league: string) => void }) {
  const footballLeagues = leagues.filter((league) => league.sport === "football");
  const total = footballLeagues.reduce((sum, league) => sum + league.matchCount, 0);
  return (
    <section className="football-league-filter" aria-label="Choose a football league">
      <div className="league-filter-label"><span>FOOTBALL LEAGUES</span><small>Choose a competition to see only its fixtures</small></div>
      <div className="league-filter-scroll" role="tablist">
        <button role="tab" aria-selected={activeLeague === "all"} className={activeLeague === "all" ? "active" : ""} onClick={() => onSelect("all")}><span className="league-filter-mark"><Icon name="football" size={16}/></span><strong>All leagues</strong><b>{total}</b></button>
        {footballLeagues.map((league) => <button role="tab" aria-selected={activeLeague === league.id} className={activeLeague === league.id ? "active" : ""} onClick={() => onSelect(league.id)} key={league.id}><span className="league-filter-mark">{league.short}</span><strong>{league.name}</strong><b>{league.matchCount}</b><i className={league.matchCount ? "has-match" : ""}/></button>)}
      </div>
    </section>
  );
}

function FeedBanner({ feed, loading, onRefresh }: { feed: FeedPayload | null; loading: boolean; onRefresh: () => void }) {
  const updated = feed?.generatedAt
    ? new Intl.DateTimeFormat("en-NG", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lagos" }).format(new Date(feed.generatedAt))
    : "—";
  return (
    <div className={`feed-banner ${feed?.status === "fallback" ? "degraded" : ""}`}>
      <div className="feed-status"><span className="feed-icon"><Icon name="database" size={18}/></span><div><strong>{feed?.status === "live" ? "Real fixtures are connected" : loading ? "Connecting to the sports feed" : "Community feed only"}</strong><p>{feed?.status === "live" ? `${feed.liveCount} API-backed fixtures · ${feed.communityCount} labelled community fixtures` : "The provider returned no fixtures; no synthetic big-league matches are being shown."}</p></div></div>
      <div className="feed-meta"><span>THE SPORTS DB</span><b>Updated {updated} WAT</b></div>
      <button className="feed-refresh" onClick={onRefresh} disabled={loading}><Icon name="refresh" size={15}/>{loading ? "Refreshing" : "Refresh data"}</button>
    </div>
  );
}

function ModelLab() {
  return (
    <section className="model-lab">
      <div className="model-lab-heading">
        <div><p>OPEN MODEL · NO HIDDEN ODDS</p><h2>How the prediction is made</h2></div>
        <span>PA-POISSON 1.2</span>
      </div>
      <div className="model-steps">
        <article><span>01 · INPUT</span><h3>Real fixture + league history</h3><p>The schedule comes from the API. The previous-season results provide scoring rates, with neutral priors when a team sample is small.</p></article>
        <article><span>02 · EXPECTED GOALS</span><h3>Calculate λ for both teams</h3><p>Attack strength, defence weakness and the league’s home/away scoring baseline create one expected-goals value per team.</p></article>
        <article className="model-formula"><span>03 · SCORE GRID</span><h3>P(X = k) = e<sup>−λ</sup> λ<sup>k</sup> / k!</h3><p>Every scoreline from 0–0 through 8–8 is evaluated. Those cells become win, draw, loss, totals and both-teams-score probabilities.</p></article>
        <article><span>04 · HONEST OUTPUT</span><h3>Confidence is separate</h3><p>A strong probability and a trustworthy sample are different things. Confidence stays capped and the drawer exposes every caveat.</p></article>
      </div>
      <div className="market-strip"><strong>OTHER OPTIONS CALCULATED</strong><span>Double chance</span><span>Over 1.5</span><span>Over 2.5</span><span>Under 3.5</span><span>Both teams score</span><span>Most likely score</span></div>
      <p className="model-method-note"><Icon name="info" size={15}/> Football uses independent Poisson goals. Basketball uses a scoring-margin logistic model, and tennis uses a smoothed form logistic model—because forcing every sport into Poisson would be misleading.</p>
    </section>
  );
}

function PredictionsView({ activeSport, setActiveSport, activeLeague, setActiveLeague, onOpenMatch, matches, leagueCatalog, feed, loading, onRefresh }: {
  activeSport: SportId;
  setActiveSport: (sport: SportId) => void;
  activeLeague: string;
  setActiveLeague: (league: string) => void;
  onOpenMatch: (match: Match) => void;
  matches: Match[];
  leagueCatalog: LeagueSummary[];
  feed: FeedPayload | null;
  loading: boolean;
  onRefresh: () => void;
}) {
  const carouselRef = useRef<HTMLDivElement>(null);
  const filteredMatches = useMemo(() => {
    const sportMatches = activeSport === "all" ? matches : matches.filter((match) => match.sport === activeSport);
    if (activeSport === "football" && activeLeague !== "all") return sportMatches.filter((match) => match.leagueId === activeLeague);
    return sportMatches;
  }, [activeLeague, activeSport, matches]);
  const featuredMatches = useMemo(() => {
    const sorted = [...filteredMatches].sort((a, b) => b.confidence - a.confidence);
    const featured = sorted.filter((match) => match.featured);
    return (featured.length >= 2 ? featured : sorted).slice(0, 6);
  }, [filteredMatches]);
  const groupedMatches = useMemo(() => filteredMatches.reduce<Record<string, Match[]>>((groups, match) => {
    groups[match.league] = [...(groups[match.league] ?? []), match];
    return groups;
  }, {}), [filteredMatches]);
  const selectedLeague = leagueCatalog.find((league) => league.id === activeLeague);
  const activeLabel = activeSport === "football" && selectedLeague ? selectedLeague.name : sportOptions.find((sport) => sport.id === activeSport)?.label ?? "All sports";
  const strongest = [...filteredMatches].sort((a, b) => b.confidence - a.confidence)[0];
  const strongestPrediction = strongest?.predictions.find((item) => item.featured) ?? strongest?.predictions[0];
  return (
    <>
      <section className="page-intro">
        <div><p className="eyebrow"><span/> LIVE MODEL BOARD</p><h1>Real matches. <em>Explainable probabilities.</em></h1><p>Upcoming fixtures come from a real sports API. PredictArena then runs its own sport-appropriate model—never a copied bookmaker price.</p></div>
        <button className="intro-summary" disabled={!strongest} onClick={() => strongest && onOpenMatch(strongest)}><span>Strongest current read</span><strong>{strongest ? strongest.home.short : "—"} <b>{strongestPrediction?.value ?? "—"}</b></strong><small>{strongest ? `${strongest.home.name} vs ${strongest.away.name}` : "Waiting for the live feed"}</small></button>
      </section>
      <FeedBanner feed={feed} loading={loading} onRefresh={onRefresh}/>
      <SportTabs activeSport={activeSport} setActiveSport={setActiveSport} matches={matches}/>
      {(activeSport === "all" || activeSport === "football") && (
        <FootballLeagueTabs activeLeague={activeSport === "football" ? activeLeague : "all"} leagues={leagueCatalog} onSelect={(league) => { setActiveSport("football"); setActiveLeague(league); }}/>
      )}

      <section className="best-section">
        <div className="section-heading">
          <div><span className="section-icon"><Icon name="spark" size={18}/></span><div><p>RANKED BY MODEL CONFIDENCE</p><h2>Best predictions</h2></div></div>
          <div className="carousel-actions"><span>{activeLabel}</span><button onClick={() => carouselRef.current?.scrollBy({ left: -390, behavior: "smooth" })} aria-label="Previous predictions"><Icon name="chevron" size={18}/></button><button onClick={() => carouselRef.current?.scrollBy({ left: 390, behavior: "smooth" })} aria-label="Next predictions"><Icon name="chevron" size={18}/></button></div>
        </div>
        {featuredMatches.length ? <div className="featured-carousel" ref={carouselRef}>{featuredMatches.map((match) => <FeaturedCard match={match} onOpen={onOpenMatch} key={match.id}/>)}</div> : <div className="empty-board"><Icon name={loading ? "refresh" : "database"} size={25}/><strong>{loading ? "Loading real fixtures…" : `No upcoming ${activeLabel.toLowerCase()} fixtures returned`}</strong><p>PredictArena leaves the board empty instead of inventing a match. Try another sport or refresh the feed.</p></div>}
      </section>

      <section className="match-board">
        <div className="board-heading"><div><span className="section-icon muted"><Icon name="chart" size={18}/></span><div><p>UPCOMING</p><h2>{activeLabel} matches</h2></div></div><div className="board-legend"><span><i className="legend-purple"/>Model pick</span><span><i className="legend-live"/>API fixture</span></div></div>
        <div className="league-groups">
          {Object.entries(groupedMatches).map(([league, leagueMatches]) => (
            <article className="league-group" key={league}>
              <div className="league-head"><div><span>{leagueMatches[0].leagueShort}</span><strong>{league}</strong><b>{leagueMatches.length} {leagueMatches.length === 1 ? "match" : "matches"}</b></div><span className={`source-pill ${sourceClass(leagueMatches[0])}`}>{leagueMatches[0].source === "live-api" ? "REAL SCHEDULE" : "COMMUNITY VERIFIED"}</span></div>
              {leagueMatches.map((match) => <MatchRow match={match} onOpen={onOpenMatch} key={match.id}/>) }
            </article>
          ))}
        </div>
      </section>
      <ModelLab/>
      <StorySection/>
    </>
  );
}

function StorySection() {
  return (
    <section className="story-section">
      <div className="story-heading"><p>BEHIND PREDICTARENA</p><h2>What it took to make the numbers credible.</h2></div>
      <div className="story-grid">
        <article><span>01</span><small>BUILT</small><h3>A model that starts with goals</h3><p>I built the football engine around a Poisson distribution—turning team and league scoring rates into scorelines, then scorelines into visible probabilities.</p></article>
        <article><span>02</span><small>LEARNED</small><h3>Reliable data is the real work</h3><p>The maths was only half of it. Sourcing consistent African esports results showed why provenance, recency and manual verification matter.</p></article>
        <article><span>03</span><small>CHALLENGE</small><h3>Credibility without deep history</h3><p>CODM Africa lacks decades of clean results. The honest answer is smaller samples, lower confidence and a clear community-source label—not fake certainty.</p></article>
      </div>
      <blockquote><span>“</span><p>I wanted CODM and EA FC Africa beside football, basketball and tennis—not buried at the bottom like an afterthought. African players compete seriously. The product should treat them that way.</p><footer>— Favour, building the sports product I wanted to use</footer></blockquote>
    </section>
  );
}

function KnowledgeView() {
  const [category, setCategory] = useState<QuizSport>("Football");
  const [seed, setSeed] = useState(1049);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [score, setScore] = useState(0);
  const [complete, setComplete] = useState(false);
  const [playerName, setPlayerName] = useState("");
  const [saved, setSaved] = useState(false);
  const [leaders, setLeaders] = useState<LeaderboardEntry[]>(initialLeaders);
  const questions = useMemo(() => getQuizQuestions(category, 10, seed), [category, seed]);
  const question = questions[questionIndex];

  useEffect(() => {
    let cancelled = false;
    try {
      const stored = window.localStorage.getItem("predictarena-leaderboard-v2");
      if (stored) {
        const parsed = JSON.parse(stored) as LeaderboardEntry[];
        window.setTimeout(() => { if (!cancelled) setLeaders(parsed); }, 0);
      }
    } catch {
      // The quiz remains fully usable if storage is unavailable.
    }
    return () => { cancelled = true; };
  }, []);

  const newRound = (nextCategory = category) => {
    setCategory(nextCategory);
    setSeed(Date.now());
    setQuestionIndex(0);
    setSelected(null);
    setChecked(false);
    setScore(0);
    setComplete(false);
    setSaved(false);
  };

  const checkAnswer = () => {
    if (!selected || checked || !question) return;
    setChecked(true);
    if (selected === question.answer) setScore((current) => current + 1);
  };

  const nextQuestion = () => {
    if (questionIndex === questions.length - 1) {
      setComplete(true);
      return;
    }
    setQuestionIndex((current) => current + 1);
    setSelected(null);
    setChecked(false);
  };

  const saveScore = () => {
    if (saved) return;
    const entry: LeaderboardEntry = { id: `${Date.now()}`, name: playerName.trim() || "Anonymous", score, total: questions.length, category, date: "Just now" };
    const next = [...leaders, entry].sort((a, b) => (b.score / b.total) - (a.score / a.total) || b.score - a.score).slice(0, 7);
    setLeaders(next);
    setSaved(true);
    try { window.localStorage.setItem("predictarena-leaderboard-v2", JSON.stringify(next)); } catch { /* Keep it in memory. */ }
  };

  const scorePercent = Math.round((score / questions.length) * 100);
  return (
    <>
      <section className="quiz-hero">
        <div className="quiz-hero-copy"><p className="eyebrow"><span/> KNOWLEDGE TEST</p><h1>Know the history.<br/><em>Then trust your read.</em></h1><p>Pick a sport and face a fresh ten-question round. Test how well you actually know the game before trusting your predictions.</p><div className="quiz-stats"><div><strong>6,200</strong><span>questions across all pools</span></div><div><strong>5</strong><span>sports to choose from</span></div><div><strong>10</strong><span>questions per round</span></div></div></div>
        <div className="hero-orbit" aria-hidden="true"><div className="orbit-ring ring-one"/><div className="orbit-ring ring-two"/><div className="hero-score"><span>{category.toUpperCase()}</span><strong>?</strong><small>{QUESTION_POOL_SIZES[category].toLocaleString()}-question pool</small></div><i className="orbit-dot dot-one"/><i className="orbit-dot dot-two"/><i className="orbit-dot dot-three"/></div>
      </section>

      <section className="quiz-sport-section">
        <div className="quiz-pick-heading"><div><p>CHOOSE YOUR ARENA</p><h2>What do you know best?</h2></div><button className="round-refresh" onClick={() => newRound()}><Icon name="refresh" size={15}/> New question set</button></div>
        <div className="quiz-sport-picker">
          {quizSports.map((sport) => (
            <button className={category === sport.id ? "quiz-sport-card active" : "quiz-sport-card"} onClick={() => newRound(sport.id)} key={sport.id}>
              <span className="quiz-sport-icon"><Icon name={sport.icon} size={20}/></span><strong>{sport.id}</strong><p>{sport.copy}</p><b>{QUESTION_POOL_SIZES[sport.id].toLocaleString()} questions</b>
            </button>
          ))}
        </div>
      </section>

      <div className="quiz-layout">
        <section className="quiz-panel">
          <div className="category-tabs"><button className="active">{category} history</button><span>{QUESTION_POOL_SIZES[category].toLocaleString()} possible questions · 10 selected for this round</span></div>
          {!complete && question ? (
            <div className="question-card">
              <div className="question-meta"><span>QUESTION {String(questionIndex + 1).padStart(2, "0")} / {String(questions.length).padStart(2, "0")}</span><b>{question.category}</b><em><i/> {question.difficulty}</em><b>{question.era}</b></div>
              <div className="progress-track"><span style={{ width: `${((questionIndex + (checked ? 1 : 0)) / questions.length) * 100}%` }}/></div>
              <h2>{question.prompt}</h2>
              <div className="answer-grid">
                {question.options.map((option, index) => {
                  const isCorrect = checked && option === question.answer;
                  const isWrong = checked && option === selected && option !== question.answer;
                  return <button className={`${selected === option ? "selected" : ""} ${isCorrect ? "correct" : ""} ${isWrong ? "wrong" : ""}`} key={`${option}-${index}`} onClick={() => !checked && setSelected(option)} disabled={checked}><span>{String.fromCharCode(65 + index)}</span><strong>{option}</strong>{isCorrect && <Icon name="check" size={17}/>}</button>;
                })}
              </div>
              {checked && <div className={`answer-note ${selected === question.answer ? "correct" : "wrong"}`}><span>{selected === question.answer ? "Good read." : `Correct answer: ${question.answer}`}</span><p>{question.note}</p></div>}
              <div className="question-actions"><span>{score} correct so far · question ID {question.id}</span>{!checked ? <button className="primary-button" onClick={checkAnswer} disabled={!selected}>Check answer <Icon name="arrow" size={16}/></button> : <button className="primary-button" onClick={nextQuestion}>{questionIndex === questions.length - 1 ? "See my score" : "Next question"}<Icon name="arrow" size={16}/></button>}</div>
            </div>
          ) : (
            <div className="result-card"><p>ROUND COMPLETE</p><div className="result-score"><strong>{score}</strong><span>/ {questions.length}</span></div><h2>{scorePercent >= 80 ? "You know your game." : scorePercent >= 50 ? "Solid read. Keep sharpening it." : "The archive wins this round."}</h2><p className="result-copy">You scored {scorePercent}% in {category}. Save the result on this device or pull a different set from the {QUESTION_POOL_SIZES[category].toLocaleString()}-question pool.</p><div className="save-score"><label htmlFor="player-name">Leaderboard name</label><div><input id="player-name" value={playerName} onChange={(event) => setPlayerName(event.target.value)} maxLength={18} placeholder="Your name"/><button className="primary-button" onClick={saveScore} disabled={saved}>{saved ? "Score saved" : "Save score"}</button></div></div><button className="text-button" onClick={() => newRound()}>Play another set <Icon name="refresh" size={15}/></button></div>
          )}
        </section>
        <aside className="leaderboard-panel">
          <div className="leaderboard-head"><span className="section-icon"><Icon name="trophy" size={18}/></span><div><p>ON THIS DEVICE</p><h2>Leaderboard</h2></div></div>
          <div className="leader-list">{leaders.map((leader, index) => <div className={index === 0 ? "leader first" : "leader"} key={leader.id}><b>{String(index + 1).padStart(2, "0")}</b><span className="leader-avatar">{leader.name.slice(0, 2).toUpperCase()}</span><div><strong>{leader.name}</strong><small>{leader.category} · {leader.date}</small></div><em>{leader.score}/{leader.total}</em></div>)}</div>
          <div className="leader-note"><Icon name="info" size={15}/><p>No account needed. Scores stay in this browser using local storage.</p></div>
          <div className="snapshot-card"><p>QUESTION LIBRARY</p>{quizSports.map((sport) => <div key={sport.id}><span>{sport.id}</span><strong>{QUESTION_POOL_SIZES[sport.id].toLocaleString()}</strong></div>)}<small><i/> Structured, deterministic question pools</small></div>
        </aside>
      </div>
    </>
  );
}

function SearchOverlay({ open, onClose, onSelect, matches }: { open: boolean; onClose: () => void; onSelect: (match: Match) => void; matches: Match[] }) {
  const [query, setQuery] = useState("");
  const results = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return matches.slice(0, 8);
    return matches.filter((match) => [match.home.name, match.away.name, match.league, match.sport].some((value) => value.toLowerCase().includes(normalized)));
  }, [query, matches]);
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modal-layer" role="dialog" aria-modal="true" aria-label="Search matches">
      <button className="modal-backdrop" onClick={onClose} aria-label="Close search"/>
      <section className="search-modal"><div className="search-field"><Icon name="search" size={20}/><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search a team, league or sport…" aria-label="Search matches"/><button onClick={onClose}>ESC</button></div><div className="search-caption"><span>{query ? `${results.length} RESULTS` : "UPCOMING MATCHES"}</span><small>Choose a match to inspect the model</small></div><div className="search-results">
        {results.map((match) => <button className="search-result" key={match.id} onClick={() => onSelect(match)}><div className="search-crests"><Crest team={match.home} size="sm"/><Crest team={match.away} size="sm"/></div><div><strong>{match.home.name} <span>vs</span> {match.away.name}</strong><small>{match.league} · {match.source === "live-api" ? "API fixture" : "Community fixture"}</small></div><time>{match.time}</time><b>{Math.max(...match.probabilities)}%<small>top read</small></b><Icon name="chevron" size={16}/></button>)}
        {results.length === 0 && <div className="empty-search"><Icon name="search" size={24}/><strong>No matches found</strong><p>Try a team, league or sport name.</p></div>}
      </div></section>
    </div>
  );
}

function ScoreMatrix({ match }: { match: Match }) {
  const cells = match.model.scoreMatrix ?? [];
  if (!cells.length) return <div className="matrix-empty"><Icon name="info" size={18}/><div><strong>No Poisson grid for this sport</strong><p>{match.model.method} is a better match for this outcome type. The factors and alternative reads remain available.</p></div></div>;
  const probability = (home: number, away: number) => cells.find((cell) => cell.home === home && cell.away === away)?.probability ?? 0;
  return (
    <div className="matrix-wrap"><div className="matrix-axis-title">Away goals →</div><div className="score-matrix"><span/><>{[0, 1, 2, 3, 4].map((away) => <b key={`away-${away}`}>{away}</b>)}</>{[0, 1, 2, 3, 4].flatMap((home) => [<b key={`home-${home}`}>{home}</b>, ...[0, 1, 2, 3, 4].map((away) => { const value = probability(home, away); return <span className="matrix-cell" style={{ "--heat": `${Math.min(value / 18, 1)}` } as React.CSSProperties} key={`${home}-${away}`}><strong>{value.toFixed(1)}%</strong><small>{home}–{away}</small></span>; })])}</div><p>Home goals run down the left. The brighter the cell, the more probability that exact scoreline carries. The full calculation extends through 8–8.</p></div>
  );
}

function MatchDetailModal({ match, onClose }: { match: Match | null; onClose: () => void }) {
  const [tab, setTab] = useState<ModelTab>("why");
  useEffect(() => {
    if (!match) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [match, onClose]);
  if (!match) return null;
  const sport = sportOptions.find((option) => option.id === match.sport);
  return (
    <div className="modal-layer detail-layer" role="dialog" aria-modal="true" aria-label={`${match.home.name} versus ${match.away.name} model breakdown`}>
      <button className="modal-backdrop" onClick={onClose} aria-label="Close match analysis"/>
      <section className="detail-modal model-detail-modal">
        <div className="detail-head"><div><span className="section-icon"><Icon name={sport?.icon ?? "grid"} size={18}/></span><div><p>{match.league}</p><strong>{match.model.method} · {match.model.version}</strong></div></div><button onClick={onClose} aria-label="Close match analysis"><Icon name="close" size={18}/></button></div>
        <div className="detail-matchup"><div><Crest team={match.home} size="lg"/><strong>{match.home.name}</strong><small>{match.home.short}</small></div><span><small>{match.date}</small><strong>{match.time}</strong><em>WAT</em></span><div><Crest team={match.away} size="lg"/><strong>{match.away.name}</strong><small>{match.away.short}</small></div></div>
        <div className="detail-source-row"><span className={`source-pill ${sourceClass(match)}`}>{match.sourceLabel}</span><small>{match.model.sampleSize} historical matches in model sample</small></div>
        <div className="detail-section-label"><span>OUTCOME PROBABILITY</span><small>Model output · not odds</small></div><ProbabilityStrip match={match}/>
        <div className="model-tabs" role="tablist">{(["why", "matrix", "markets"] as ModelTab[]).map((item) => <button role="tab" aria-selected={tab === item} className={tab === item ? "active" : ""} onClick={() => setTab(item)} key={item}>{item === "why" ? "Why this read" : item === "matrix" ? "Score matrix" : "More options"}</button>)}</div>
        {tab === "why" && <div className="model-tab-panel">
          {(match.model.expectedHome !== undefined || match.model.expectedTotal !== undefined) && <div className="lambda-grid">{match.model.expectedHome !== undefined && <div><span>HOME λ</span><strong>{match.model.expectedHome}</strong><small>expected goals</small></div>}{match.model.expectedAway !== undefined && <div><span>AWAY λ</span><strong>{match.model.expectedAway}</strong><small>expected goals</small></div>}{match.model.expectedTotal !== undefined && <div><span>EXPECTED TOTAL</span><strong>{match.model.expectedTotal}</strong><small>{match.sport === "basketball" ? "points" : "combined"}</small></div>}{match.model.topScoreline && <div><span>TOP SCORE</span><strong>{match.model.topScoreline}</strong><small>single cell</small></div>}</div>}
          <div className="factor-list">{match.model.factors.map((factor) => <div className="factor-row" key={factor.label}><div><span>{factor.label}</span><strong>{factor.value}</strong></div><div className="factor-track"><span className={factor.tone} style={{ width: `${factor.strength}%` }}/></div><p>{factor.detail}</p></div>)}</div>
          <div className="confidence-block"><div><span>MODEL CONFIDENCE</span><strong>{match.confidence}%</strong></div><div className="confidence-track"><span style={{ width: `${match.confidence}%` }}/></div><p>Confidence scores data coverage and decisiveness; it does not mean the result is guaranteed.</p></div>
          <div className="model-caveat"><Icon name="info" size={16}/><div><strong>What the model does not know</strong><p>{match.model.caveat}</p></div></div>
        </div>}
        {tab === "matrix" && <div className="model-tab-panel"><ScoreMatrix match={match}/></div>}
        {tab === "markets" && <div className="model-tab-panel"><div className="market-options">{match.predictions.map((prediction) => <article className={prediction.featured ? "market-option featured" : "market-option"} key={prediction.label}><span>{prediction.label}</span><strong>{prediction.value}</strong><p>{prediction.explanation ?? "A probability calculated from the model output."}</p></article>)}</div></div>}
        <div className="detail-disclaimer"><Icon name="info" size={15}/><p>PredictArena is an analysis and learning product. It does not take stakes, quote payouts or promise outcomes.</p></div>
      </section>
    </div>
  );
}

export default function Home() {
  const [view, setView] = useState<ViewId>("predictions");
  const [activeSport, setActiveSport] = useState<SportId>("all");
  const [activeLeague, setActiveLeague] = useState("all");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [feed, setFeed] = useState<FeedPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const lastLoadRef = useRef(0);

  const loadMatches = useCallback(async (force = false) => {
    setLoading(true);
    try {
      const bypassCache = force && Date.now() - lastLoadRef.current >= 60 * 1000;
      const response = await fetch(bypassCache ? `/api/matches?refresh=${Date.now()}` : "/api/matches", { cache: bypassCache ? "no-store" : "default" });
      if (!response.ok) throw new Error("Match feed unavailable");
      setFeed(await response.json() as FeedPayload);
      lastLoadRef.current = Date.now();
    } catch {
      setFeed((current) => current ?? { matches: [], generatedAt: new Date().toISOString(), provider: "TheSportsDB", seasonSample: "—", leagueCatalog: defaultLeagueCatalog, liveCount: 0, communityCount: 0, status: "fallback" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadMatches(); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadMatches]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setSearchOpen(true); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const matches = feed?.matches ?? [];
  const leagueCatalog = feed?.leagueCatalog ?? defaultLeagueCatalog;
  const selectSport = (sport: SportId) => {
    setActiveSport(sport);
    if (sport !== "football") setActiveLeague("all");
  };
  const openSearchResult = (match: Match) => { setSearchOpen(false); setSelectedMatch(match); };
  return (
    <div className="app-shell">
      <Sidebar activeSport={activeSport} setActiveSport={selectSport} activeLeague={activeLeague} setActiveLeague={setActiveLeague} open={sidebarOpen} setOpen={setSidebarOpen} setView={setView} view={view} matches={matches} leagueCatalog={leagueCatalog}/>
      <div className="app-main">
        <Topbar view={view} setView={setView} setSidebarOpen={setSidebarOpen} onSearch={() => setSearchOpen(true)}/>
        <main className="content-area">{view === "predictions" ? <PredictionsView activeSport={activeSport} setActiveSport={selectSport} activeLeague={activeLeague} setActiveLeague={setActiveLeague} onOpenMatch={setSelectedMatch} matches={matches} leagueCatalog={leagueCatalog} feed={feed} loading={loading} onRefresh={() => { void loadMatches(true); }}/> : <KnowledgeView/>}</main>
        <footer className="site-footer"><Brand/><p>Real fixtures. Explainable models. African esports included.</p><span>© 2026 PredictArena</span></footer>
      </div>
      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} onSelect={openSearchResult} matches={matches}/>
      <MatchDetailModal key={selectedMatch?.id ?? "closed"} match={selectedMatch} onClose={() => setSelectedMatch(null)}/>
    </div>
  );
}
