import { GET as getLegacyPayload } from "../matches-v2/route";
import { buildFootballPayload } from "../../../lib/api-football";

export const dynamic = "force-dynamic";

export async function GET() {
  const [legacyResponse, football] = await Promise.all([
    getLegacyPayload(),
    buildFootballPayload(),
  ]);

  const base = await legacyResponse.json() as {
    matches?: Array<{ sport?: string; kickoffISO?: string; source?: string }>;
    generatedAt?: string;
    provider?: string;
    footballProvider?: string;
    leagueCatalog?: Array<{ sport?: string }>;
    liveCount?: number;
    manualCount?: number;
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
  const legacyLiveCount = nonFootballMatches.filter((match) => match.source === "live-api").length;
  const footballLiveCount = football.matches.length - football.manualCount;

  return Response.json({
    ...base,
    matches,
    generatedAt: new Date().toISOString(),
    provider: "worldcup26.ir + API-Football + TheSportsDB",
    footballProvider: "worldcup26.ir / API-Football",
    seasonSample: football.seasonSample,
    leagueCatalog: [...football.leagueCatalog, ...nonFootballCatalog],
    liveCount: footballLiveCount + legacyLiveCount,
    manualCount: football.manualCount,
    communityCount,
    status: footballLiveCount + legacyLiveCount > 0 ? "live" : "fallback",
  }, {
    headers: { "Cache-Control": "public, max-age=300, s-maxage=21600, stale-while-revalidate=86400" },
  });
}
