import { ApiFootballProvider } from "./api-football-provider";
import { PremiumFootballProvider } from "./premium-provider";
import { footballCompetitions, type Fixture, type FootballProvider, type StandingRow } from "./types";
const apiFootballProvider = new ApiFootballProvider(); const premiumFootballProvider = new PremiumFootballProvider();
function provider(): FootballProvider { return process.env.FOOTBALL_PROVIDER === "premium" ? premiumFootballProvider : apiFootballProvider; }
export async function ingestFootballFixtures() {
  const activeProvider = provider(); const fetchedAt = new Date().toISOString(); const results: Fixture[][] = [];
  // Sequential cold-start fetches prevent a single invocation from exhausting quota.
  for (const competition of footballCompetitions) {
    const fixtures = await activeProvider.getFixtures(competition);
    results.push(fixtures.map((fixture): Fixture => ({ id: `football:${activeProvider.name}:${fixture.id}`, sport: "football", competitionId: competition.id, season: String(fixture.season), round: fixture.round, startsAt: fixture.date, status: fixture.status, home: { id: `football:${activeProvider.name}:${fixture.home.id}`, name: fixture.home.name, shortName: fixture.home.name.slice(0, 3).toUpperCase(), badgeUrl: fixture.home.logo }, away: { id: `football:${activeProvider.name}:${fixture.away.id}`, name: fixture.away.name, shortName: fixture.away.name.slice(0, 3).toUpperCase(), badgeUrl: fixture.away.logo }, venue: fixture.venue, surface: null, bestOf: null, score: fixture.score, source: activeProvider.name, updatedAt: fixture.updatedAt, isStale: false })));
  }
  return { fixtures: results.flat(), fetchedAt, provider: activeProvider.name };
}
export async function ingestFootballStandings(competitionId: string, season: string): Promise<StandingRow[]> { const competition = footballCompetitions.find((item) => item.id === competitionId); if (!competition) throw new Error("UNSUPPORTED_COMPETITION"); return provider().getStandings(competition, season); }
