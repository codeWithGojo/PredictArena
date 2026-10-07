import {
  colorsFromName,
  shortName,
  type Match,
} from "./sports";
import { modelForFixture, type CompletedFixture } from "./model-adapter";



type LegacyEvent = {
  idEvent?: string;
  strTimestamp?: string | null;
  dateEvent?: string | null;
  strTime?: string | null;
  strHomeTeam?: string | null;
  strAwayTeam?: string | null;
  strHomeTeamBadge?: string | null;
  strAwayTeamBadge?: string | null;
  intHomeScore?: string | number | null;
  intAwayScore?: string | number | null;
  strVenue?: string | null;
};

type LegacyLeague = {
  id: string;
  modelId: string;
  sport: "basketball" | "tennis";
  short: string;
  name: string;
  calendarSeason?: boolean;
};

const legacyLeagues: LegacyLeague[] = [
  { id: "4387", modelId: "basketball:nba", sport: "basketball", short: "NBA", name: "NBA" },
  { id: "4464", modelId: "tennis:atp", sport: "tennis", short: "ATP", name: "ATP World Tour", calendarSeason: true },
];

const LEGACY_API_ROOT = "https://www.thesportsdb.com/api/v1/json";
const CACHE_SECONDS = 6 * 60 * 60;
const CACHE_MS = CACHE_SECONDS * 1000;
let memoryCache: { timestamp: number; payload: unknown } | null = null;

function env() {
  const runtime = globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> };
  };
  return runtime.process?.env || {};
}

function makeTeam(name: string, badge?: string | null) {
  return {
    name,
    short: shortName(name),
    colors: colorsFromName(name),
    badge: badge || undefined,
  };
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

function seasonStart(now = new Date()) {
  const year = now.getUTCFullYear();
  return now.getUTCMonth() >= 6 ? year : year - 1;
}

function legacyCurrentSeason(config: LegacyLeague, now = new Date()) {
  if (config.calendarSeason) return `${now.getUTCFullYear()}`;
  const start = seasonStart(now);
  return `${start}-${start + 1}`;
}

function legacyPreviousSeason(config: LegacyLeague, now = new Date()) {
  if (config.calendarSeason) return `${now.getUTCFullYear() - 1}`;
  const start = seasonStart(now);
  return `${start - 1}-${start}`;
}

async function legacyRequest(endpoint: string): Promise<LegacyEvent[]> {
  const key = env().THE_SPORTS_DB_API_KEY || "123";
  const response = await fetch(`${LEGACY_API_ROOT}/${key}/${endpoint}`, {
    headers: { Accept: "application/json", "User-Agent": "PredictArena/2.0" },
    next: { revalidate: CACHE_SECONDS },
  });
  if (!response.ok) throw new Error(`TheSportsDB HTTP ${response.status}`);
  const payload = await response.json() as { events?: LegacyEvent[] | null };
  return Array.isArray(payload.events) ? payload.events : [];
}

function legacyKickoff(event: LegacyEvent) {
  const raw = event.strTimestamp || `${event.dateEvent || new Date().toISOString().slice(0, 10)}T${event.strTime || "12:00:00"}`;
  return new Date(raw.endsWith("Z") ? raw : `${raw}Z`);
}

function legacyToHistory(events: LegacyEvent[]): CompletedFixture[] {
  return events.flatMap((event) => {
    if (event.intHomeScore == null || event.intAwayScore == null || event.intHomeScore === "" || event.intAwayScore === "") return [];
    const homeScore = Number(event.intHomeScore);
    const awayScore = Number(event.intAwayScore);
    const kickoff = legacyKickoff(event);
    if (!event.strHomeTeam || !event.strAwayTeam || !Number.isFinite(kickoff.getTime()) ||
      !Number.isFinite(homeScore) || !Number.isFinite(awayScore)) return [];
    return [{ id: `legacy-${event.idEvent || `${kickoff.toISOString()}-${event.strHomeTeam}-${event.strAwayTeam}`}`,
      startsAt: kickoff.toISOString(), home: event.strHomeTeam, away: event.strAwayTeam,
      homeScore, awayScore, status: "finished" as const }];
  });
}

function normalizeLegacyMatch(event: LegacyEvent, config: LegacyLeague, history: CompletedFixture[], now: Date): Match | null {
  if (!event.strHomeTeam || !event.strAwayTeam) return null;
  const kickoff = legacyKickoff(event);
  if (!Number.isFinite(kickoff.getTime()) || kickoff.getTime() <= now.getTime()) return null;
  const formatted = displayKickoff(kickoff);
  const id = `legacy-${event.idEvent || `${config.id}-${formatted.iso}`}`;
  const model = modelForFixture({ id, sport: config.sport, competitionId: config.modelId,
    season: legacyCurrentSeason(config, now), startsAt: formatted.iso,
    home: event.strHomeTeam, away: event.strAwayTeam }, history, now);

  return {
    id,
    sport: config.sport,
    leagueId: config.id,
    league: config.name,
    leagueShort: config.short,
    date: formatted.dateText,
    time: formatted.timeText,
    kickoffISO: formatted.iso,
    venue: event.strVenue || undefined,
    home: makeTeam(event.strHomeTeam, event.strHomeTeamBadge),
    away: makeTeam(event.strAwayTeam, event.strAwayTeamBadge),
    probabilities: model.probabilities,
    predictions: model.predictions,
    confidence: model.confidence,
    model: model.model,
    source: "live-api",
    sourceLabel: "TheSportsDB fixture · PredictArena model",
    featured: model.confidence >= 62,
  };
}

async function buildLegacyBundles(now: Date) {
  return Promise.all(legacyLeagues.map(async (config) => {
    const active = legacyCurrentSeason(config, now);
    const previous = legacyPreviousSeason(config, now);
    const [currentResult, previousResult] = await Promise.allSettled([
      legacyRequest(`eventsseason.php?id=${config.id}&s=${active}`),
      legacyRequest(`eventsseason.php?id=${config.id}&s=${previous}`),
    ]);

    const current = currentResult.status === "fulfilled" ? currentResult.value : [];
    let upcoming = current.filter((event) => {
      const hasScore = event.intHomeScore !== null && event.intHomeScore !== undefined && event.intHomeScore !== "";
      return !hasScore && legacyKickoff(event).getTime() >= now.getTime() - 60 * 60 * 1000;
    }).sort((a, b) => legacyKickoff(a).getTime() - legacyKickoff(b).getTime());

    let available = currentResult.status === "fulfilled";
    if (!upcoming.length) {
      try {
        upcoming = await legacyRequest(`eventsnextleague.php?id=${config.id}`);
        available = true;
      } catch {
        available = false;
      }
    }

    const old = previousResult.status === "fulfilled" ? previousResult.value : [];
    return { config, upcoming, history: legacyToHistory([...current, ...old]), available };
  }));
}

async function buildPayload() {
  const now = new Date();
  const legacyBundles = await buildLegacyBundles(now);

  const legacyMatches = legacyBundles.flatMap((bundle) =>
    bundle.upcoming
      .slice(0, 6)
      .map((event) => normalizeLegacyMatch(event, bundle.config, bundle.history, now))
      .filter((match): match is Match => Boolean(match)),
  );

  const apiMatches = legacyMatches;
  const matches = [...apiMatches].sort((a, b) =>
    new Date(a.kickoffISO).getTime() - new Date(b.kickoffISO).getTime(),
  );

  return {
    matches,
    generatedAt: new Date().toISOString(),
    provider: "TheSportsDB",
    seasonSample: String(seasonStart(now)),
    leagueCatalog: [
      ...legacyBundles.map((bundle) => ({
        id: bundle.config.id,
        name: bundle.config.name,
        short: bundle.config.short,
        sport: bundle.config.sport,
        matchCount: legacyMatches.filter((match) => match.leagueId === bundle.config.id).length,
        available: bundle.available,
        provider: "TheSportsDB",
      })),
    ],
    liveCount: apiMatches.length,
    communityCount: matches.length - apiMatches.length,
    status: apiMatches.length ? "live" : "fallback",
  };
}

export async function GET() {
  try {
    const cacheAge = memoryCache ? Date.now() - memoryCache.timestamp : Number.POSITIVE_INFINITY;
    if (memoryCache && cacheAge < CACHE_MS) {
      return Response.json(memoryCache.payload, {
        headers: { "Cache-Control": `public, max-age=300, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=86400` },
      });
    }

    const payload = await buildPayload();
    memoryCache = { timestamp: Date.now(), payload };
    return Response.json(payload, {
      headers: { "Cache-Control": `public, max-age=300, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=86400` },
    });
  } catch (error) {
    return Response.json({
      matches: [],
      generatedAt: new Date().toISOString(),
      provider: "TheSportsDB",
        seasonSample: String(seasonStart()),
      leagueCatalog: [
        ...legacyLeagues.map((league) => ({ ...league, matchCount: 0, available: false, provider: "TheSportsDB" })),
      ],
      liveCount: 0,
      communityCount: 0,
      status: "fallback",
      error: error instanceof Error ? error.message : "Unknown feed error",
    }, {
      status: 200,
      headers: { "Cache-Control": "public, max-age=60, s-maxage=180, stale-while-revalidate=3600" },
    });
  }
}
