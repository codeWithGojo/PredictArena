export type FootballDataMatch = {
  id?: number;
  utcDate?: string;
  status?: string;
  venue?: string | null;
  season?: { startDate?: string };
  homeTeam?: { id?: number; name?: string; crest?: string };
  awayTeam?: { id?: number; name?: string; crest?: string };
  score?: { fullTime?: { home?: number | null; away?: number | null } };
};

export function footballDataToFixture(match: FootballDataMatch, league: { id: string; name: string }) {
  if (!match.id || !match.utcDate || !match.homeTeam?.name || !match.awayTeam?.name) return null;
  const finished = match.status === "FINISHED";
  const score = match.score?.fullTime;
  const validScore = finished && Number.isSafeInteger(score?.home) && Number.isSafeInteger(score?.away) &&
    (score?.home ?? -1) >= 0 && (score?.away ?? -1) >= 0;
  return {
    fixture: { id: match.id, date: match.utcDate, venue: { name: match.venue },
      status: { short: validScore ? "FT" : ["SCHEDULED", "TIMED"].includes(match.status || "") ? "NS" : "LIVE" } },
    league: { id: Number(league.id), name: league.name,
      season: match.season?.startDate ? Number(match.season.startDate.slice(0, 4)) : undefined },
    teams: { home: { id: match.homeTeam.id, name: match.homeTeam.name, logo: match.homeTeam.crest },
      away: { id: match.awayTeam.id, name: match.awayTeam.name, logo: match.awayTeam.crest } },
    goals: { home: validScore ? score?.home : null, away: validScore ? score?.away : null },
  };
}
