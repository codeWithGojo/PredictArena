"use client";

import { useState } from "react";
import Image from "next/image";
import type { Match, Team } from "@/lib/sports";
import type { SlipPick } from "@/lib/selections";

function TeamBadge({ team }: { team: Team }) {
  const [failed, setFailed] = useState(false);
  return <span className="summary-badge">{team.badge && !failed ? <Image src={team.badge} width={28} height={28} alt="" onError={() => setFailed(true)} unoptimized/> : <span style={{ borderColor: team.colors[0] }}>{team.short.slice(0, 3)}</span>}</span>;
}

export function MatchSummary({ match, pick, onOpen }: { match: Match; pick?: SlipPick; onOpen?: () => void }) {
  const market = pick?.probabilityBasis === "bookmaker" || !match.probabilities.length;
  const probabilities = market && match.bookmakerInput ? match.bookmakerInput.probabilities.map(p => Math.round(p * 100)) : match.probabilities;
  const teams = <>{[match.home, match.away].map((team, index) => <span className="summary-team" key={index}><TeamBadge team={team}/><strong>{team.name}</strong></span>)}</>;
  return <>
    <div className="match-row-meta"><span>{match.league}</span><time dateTime={match.kickoffISO}>{new Date(match.kickoffISO).toLocaleString("en-NG", { timeZone: "Africa/Lagos", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} WAT</time></div>
    {onOpen ? <button className="summary-teams" onClick={onOpen} aria-label={`Analyse ${match.home.name} vs ${match.away.name}`}>{teams}</button> : <div className="summary-teams">{teams}</div>}
    {!!probabilities.length && <div className="match-outcomes" aria-label={`${market ? "Market" : "Model"} outcome probabilities`}>
      {probabilities.map((probability, index) => <div key={index} aria-label={`${match.sport === "football" ? ["Home", "Draw", "Away"][index] : ["Home", "Away"][index]} ${probability}%`}><span>{match.sport === "football" ? ["Home", "Draw", "Away"][index] : ["Home", "Away"][index]} <b>{probability}%</b></span></div>)}
    </div>}
    <small className="match-probability-source">{probabilities.length ? market ? `Market 1X2 estimate · captured ${match.bookmakerInput?.capturedDate}` : "History-model outcome estimates" : "Awaiting model data"}</small>
  </>;
}
