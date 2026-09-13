import { GET as getLegacyPayload } from "../matches-v2/route";
import { buildFootballPayload } from "../football-free/route";

export const dynamic = "force-dynamic";

export async function GET() {
  const [legacyResponse, football] = await Promise.all([
    getLegacyPayload(),
    buildFootballPayload(),
  ]);

  const base = await legacyResponse.json() as {
    matches?: Array<{ sport?: string; kickoffISO?: string }>;
    generatedAt?: string;
    provider?: string;
    footballProvider?: string;
    leagueCatalog?: Array<{ sport?: string }>;
    liveCount?: number;
    communityCount?: number;
    status?: string;
  };

  const nonFootballMatches = Array.isArray(base.matches)
    ? base.matches.filter((match) => match.sport !== "football")
    : [];

  const nonFootballCatalog = Array.isArray(base.leagueCatalog)
    ? base.leagueCatalog.filter((league) => league.sport !== "football")
    : [];

  const matches = [...football.matches, ...nonFootballMatches].sort((a, b) =>
    new Date(a.kickoffISO || 0).getTime() - new Date(b.kickoffISO || 0).getTime(),
  );

  const communityCount = Number(base.communityCount || 0);
  const legacyLiveCount = Math.max(Number(base.liveCount || 0), 0);
  const footballLiveCount = football.matches.length;

  return Response.json({
    ...base,
    matches,
    generatedAt: new Date().toISOString(),
    provider: "API-Football + TheSportsDB",
    footballProvider: "API-Football",
    seasonSample: football.seasonSample,
    leagueCatalog: [...football.leagueCatalog, ...nonFootballCatalog],
    liveCount: footballLiveCount + legacyLiveCount,
    communityCount,
    status: footballLiveCount + legacyLiveCount > 0 ? "live" : "fallback",
  }, {
    headers: { "Cache-Control": "public, max-age=300, s-maxage=21600, stale-while-revalidate=86400" },
  });
}
