export type Participant = { id: string; name: string; shortName: string; badgeUrl: string | null };

export type Fixture = {
  id: string; sport: "football"; competitionId: string; season: string; round: string | null; startsAt: string | null;
  status: "scheduled" | "live" | "finished" | "postponed" | "cancelled"; home: Participant; away: Participant;
  venue: string | null; surface: null; bestOf: null;
  score: { home: number; away: number; unit: "goals"; regulation: { home: number; away: number } | null } | null;
  source: string; updatedAt: string; isStale: boolean;
};

export type StandingRow = {
  competitionId: string; season: string; group: string; rank: number; participant: Participant; played: number; won: number;
  drawn: number; lost: number; points: number; scoreFor: number; scoreAgainst: number;
};

export type Competition = { id: string; providerLeagueId: number; sport: "football"; name: string; shortName: string };
export type ProviderFixture = {
  id: number; date: string; updatedAt: string; season: number; round: string | null; status: Fixture["status"]; venue: string | null;
  home: { id: number; name: string; logo: string | null }; away: { id: number; name: string; logo: string | null }; score: Fixture["score"];
};
export interface FootballProvider { readonly name: string; getFixtures(competition: Competition): Promise<ProviderFixture[]>; getStandings(competition: Competition, season: string): Promise<StandingRow[]>; }

export const footballCompetitions: Competition[] = [
  { id: "football:premier-league", providerLeagueId: 39, sport: "football", name: "Premier League", shortName: "PL" },
  { id: "football:la-liga", providerLeagueId: 140, sport: "football", name: "La Liga", shortName: "LL" },
  { id: "football:serie-a", providerLeagueId: 135, sport: "football", name: "Serie A", shortName: "SA" },
  { id: "football:bundesliga", providerLeagueId: 78, sport: "football", name: "Bundesliga", shortName: "BL" },
  { id: "football:ligue-1", providerLeagueId: 61, sport: "football", name: "Ligue 1", shortName: "L1" },
  { id: "football:champions-league", providerLeagueId: 2, sport: "football", name: "Champions League", shortName: "UCL" },
  { id: "football:europa-league", providerLeagueId: 3, sport: "football", name: "Europa League", shortName: "UEL" },
];
