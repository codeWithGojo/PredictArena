import {
  colorsFromName,
  runFootballPoisson,
  shortName,
  type HistoricalEvent,
  type Match,
} from "../../../lib/sports";

export const dynamic = "force-dynamic";

type FootballFixture = {
  fixture?: {
    id?: number;
    date?: string;
    venue?: { name?: string | null };
    status?: { short?: string | null };
  };
  league?: { id?: number; name?: string; season?: number };
  teams?: {
    home?: { id?: number; name?: string; logo?: string };
    away?: { id?: number; name?: string; logo?: string };
  };
  goals?: { home?: number | null; away?: number | null };
};

type FootballLeague = {
  id: string;
  sport: "football";
  short: string;
  name: string;
};

const footballLeagues: FootballLeague[] = [
  { id: "39", sport: "football", short: "PL", name: "Premier League" },
  { id: "140", sport: "football", short: "LL", name: "La Liga" },
  { id: "135", sport: "football", short: "SA", name: "Serie A" },
  { id: "78", sport: "football", short: "BL", name: "Bundesliga" },
  { id: "61", sport: "football", short: "L1", name: "Ligue 1" },
  { id: "2", sport: "football", short: "UCL", name: "Champions League" },
];

const API_ROOT = "https://v3.football.api-sports.io";
const CACHE_SECONDS = 6 * 60 * 60;

function env() {
  const runtime = globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> };
  };
  return runtime.process?.env || {};
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function seasonStart(now = new Date()) {
  const year = now.getUTCFullYear();
  return now.getUTCMonth() >= 6 ? year : year - 1;
}

function displayKickoff(date: Date) {
  const dateText = new Intl.DateTimeFormat("en-NG", {
    timeZone: "Africa/Lagos",
    weekday: "short",
    day: "2-digit",
    month: "short",
  }).format(date).toUpperCase();
  const timeText = new Intl.DateTimeFormat("en-NG", {
    timeZone: "Africa/Lagos",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
  return { dateText, timeText, iso: date.toISOString() };
}

function makeTeam(name: string, badge?: string | null) {
  return {
    name,
    short: shortName(name),
    colors: colorsFromName(name),
    badge: badge || undefined,
  };
}

async function requestFixtures(config: FootballLeague, now: Date): Promise<FootballFixture[]> {
  const key = env().API_FOOTBALL_KEY;
  if (!key) throw new Error("API_FOOTBALL_KEY is not configured");

  const from = new Date(now);
  from.setUTCDate(from.getUTCDate() - 60);
  const to = new Date(now);
  to.setUTCDate(to.getUTCDate() + 30);

  const url = new URL(`${API_ROOT}/fixtures`);
  url.searchParams.set("league", config.id);
  url.searchParams.set("season", String(seasonStart(now)));
  url.searchParams.set("from", isoDate(from));
  url.searchParams.set("to", isoDate(to));
  url.searchParams.set("timezone", "Africa/Lagos");

  const response = await fetch(url, {
    headers: { Accept: "application/json", "x-apisports-key": key },
    next: { revalidate: CACHE_SECONDS },
  });

  if (!response.ok) throw new Error(`API-Football HTTP ${response.status}`);
  const payload = await response.json() as {
    response?: FootballFixture[];
    errors?: Record<string, unknown> | unknown[] | string;
  };

  const errors = payload.errors;
  const hasErrors = Array.isArray(errors)
    ? errors.length > 0
    : typeof errors === "string"
      ? errors.length > 0
      : Boolean(errors && typeof errors === "object" && Object.keys(errors as Record<string, unknown>).length);

  if (hasErrors) throw new Error(`API-Football rejected request: ${JSON.stringify(errors)}`);
  return Array.isArray(payload.response) ? payload.response : [];
}

function toHistory(fixtures: FootballFixture[], now: Date): HistoricalEvent[] {
  return fixtures.flatMap((item) => {
    const kickoff = item.fixture?.date ? new Date(item.fixture.date) : null;
    const home = item.teams?.home?.name;
    const away = item.teams?.away?.name;
    const homeScore = item.goals?.home;
    const awayScore = item.goals?.away;
    if (!kickoff || kickoff.getTime() >= now.getTime() || !home || !away || homeScore == null || awayScore == null) return [];
    return [{ homeTeam: home, awayTeam: away, homeScore, awayScore }];
  });
}

function isUpcoming(item: FootballFixture, now: Date) {
  const raw = item.fixture?.date;
  if (!raw) return false;
  const kickoff = new Date(raw);
  if (!Number.isFinite(kickoff.getTime()) || kickoff.getTime() < now.getTime() - 60 * 60 * 1000) return false;
  const status = item.fixture?.status?.short || "";
  return ["NS", "TBD"].includes(status) || item.goals?.home == null;
}

function normalize(item: FootballFixture, config: FootballLeague, history: HistoricalEvent[]): Match | null {
  const home = item.teams?.home?.name;
  const away = item.teams?.away?.name;
  const raw = item.fixture?.date;
  if (!home || !away || !raw) return null;

  const kickoff = new Date(raw);
  if (!Number.isFinite(kickoff.getTime())) return null;
  const formatted = displayKickoff(kickoff);
  const model = runFootballPoisson(home, away, history);

  return {
    id: `api-football-${item.fixture?.id || `${config.id}-${formatted.iso}`}`,
    sport: "football",
    leagueId: config.id,
    league: item.league?.name || config.name,
    leagueShort: config.short,
    date: formatted.dateText,
    time: formatted.timeText,
    kickoffISO: formatted.iso,
    venue: item.fixture?.venue?.name || undefined,
    home: makeTeam(home, item.teams?.home?.logo),
    away: makeTeam(away, item.teams?.away?.logo),
    probabilities: model.probabilities,
    predictions: model.predictions,
    confidence: model.confidence,
    model: model.model,
    source: "live-api",
    sourceLabel: "API-Football fixture · PredictArena model",
    featured: model.confidence >= 62,
  };
}

export async function buildFootballPayload() {
  const now = new Date();
  const bundles = await Promise.all(footballLeagues.map(async (config) => {
    try {
      const fixtures = await requestFixtures(config, now);
      const history = toHistory(fixtures, now);
      const upcoming = fixtures
        .filter((item) => isUpcoming(item, now))
        .sort((a, b) => new Date(a.fixture?.date || 0).getTime() - new Date(b.fixture?.date || 0).getTime())
        .slice(0, 6);
      const providerSeason = fixtures.find((item) => item.league?.season)?.league?.season;
      return { config, history, upcoming, available: true, providerSeason, error: null as string | null };
    } catch (error) {
      return {
        config,
        history: [] as HistoricalEvent[],
        upcoming: [] as FootballFixture[],
        available: false,
        providerSeason: undefined as number | undefined,
        error: error instanceof Error ? error.message : "Unknown API-Football error",
      };
    }
  }));

  const matches = bundles.flatMap((bundle) =>
    bundle.upcoming
      .map((item) => normalize(item, bundle.config, bundle.history))
      .filter((match): match is Match => Boolean(match)),
  );

  return {
    matches,
    leagueCatalog: bundles.map((bundle) => ({
      id: bundle.config.id,
      name: bundle.config.name,
      short: bundle.config.short,
      sport: bundle.config.sport,
      matchCount: matches.filter((match) => match.leagueId === bundle.config.id).length,
      available: bundle.available,
      provider: "API-Football",
      providerSeason: bundle.providerSeason,
      error: bundle.error,
    })),
    seasonSample: String(bundles.find((bundle) => bundle.providerSeason)?.providerSeason || seasonStart(now)),
  };
}

export async function GET() {
  const payload = await buildFootballPayload();
  return Response.json(payload, {
    headers: { "Cache-Control": `public, max-age=300, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=86400` },
  });
}
