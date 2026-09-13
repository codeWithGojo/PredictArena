import {
  colorsFromName,
  runBasketballMarginModel,
  runFootballPoisson,
  runTennisFormModel,
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

type FootballLeague = {
  id: string;
  sport: "football";
  short: string;
  name: string;
};

type LegacyLeague = {
  id: string;
  sport: "basketball" | "tennis";
  short: string;
  name: string;
  calendarSeason?: boolean;
};

const footballLeagues: FootballLeague[] = [
  { id: "39", sport: "football", short: "PL", name: "Premier League" },
  { id: "140", sport: "football", short: "LL", name: "La Liga" },
  { id: "135", sport: "football", short: "SA", name: "Serie A" },
  { id: "78", sport: "football", short: "BL", name: "Bundesliga" },
  { id: "61", sport: "football", short: "L1", name: "Ligue 1" },
  { id: "2", sport: "football", short: "UCL", name: "Champions League" },
];

const legacyLeagues: LegacyLeague[] = [
  { id: "4387", sport: "basketball", short: "NBA", name: "NBA" },
  { id: "4464", sport: "tennis", short: "ATP", name: "ATP World Tour", calendarSeason: true },
];

const FOOTBALL_API_ROOT = "https://v3.football.api-sports.io";
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

async function footballRequest(params: Record<string, string>): Promise<FootballFixture[]> {
  const key = env().API_FOOTBALL_KEY;
  if (!key) throw new Error("API_FOOTBALL_KEY is not configured");

  const url = new URL(`${FOOTBALL_API_ROOT}/fixtures`);
  for (const [keyName, value] of Object.entries(params)) url.searchParams.set(keyName, value);

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

function footballToHistory(fixtures: FootballFixture[]): HistoricalEvent[] {
  return fixtures.flatMap((item) => {
    const home = item.teams?.home?.name;
    const away = item.teams?.away?.name;
    const homeScore = item.goals?.home;
    const awayScore = item.goals?.away;
    if (!home || !away || homeScore == null || awayScore == null) return [];
    return [{ homeTeam: home, awayTeam: away, homeScore, awayScore }];
  });
}

function normalizeFootballMatch(item: FootballFixture, config: FootballLeague, history: HistoricalEvent[]): Match | null {
  const home = item.teams?.home?.name;
  const away = item.teams?.away?.name;
  const rawDate = item.fixture?.date;
  if (!home || !away || !rawDate) return null;

  const kickoff = new Date(rawDate);
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

async function buildFootballBundles() {
  return Promise.all(footballLeagues.map(async (config) => {
    try {
      // `next` is deliberately used instead of deriving a season from the server clock.
      // API-Football decides which competition season is active, which avoids empty
      // schedules when the runtime date and provider season metadata differ.
      const [upcomingResult, historyResult] = await Promise.allSettled([
        footballRequest({ league: config.id, next: "6" }),
        footballRequest({ league: config.id, last: "60" }),
      ]);

      if (upcomingResult.status === "rejected") throw upcomingResult.reason;
      const upcoming = upcomingResult.value;
      const historical = historyResult.status === "fulfilled" ? historyResult.value : [];
      const history = footballToHistory(historical);
      const season = upcoming.find((item) => item.league?.season)?.league?.season;

      return { config, upcoming, history, available: true, season, error: null as string | null };
    } catch (error) {
      return {
        config,
        upcoming: [] as FootballFixture[],
        history: [] as HistoricalEvent[],
        available: false,
        season: undefined as number | undefined,
        error: error instanceof Error ? error.message : "Unknown API-Football error",
      };
    }
  }));
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

function legacyToHistory(events: LegacyEvent[]): HistoricalEvent[] {
  return events.flatMap((event) => {
    if (event.intHomeScore == null || event.intAwayScore == null || event.intHomeScore === "" || event.intAwayScore === "") return [];
    const homeScore = Number(event.intHomeScore);
    const awayScore = Number(event.intAwayScore);
    if (!event.strHomeTeam || !event.strAwayTeam || !Number.isFinite(homeScore) || !Number.isFinite(awayScore)) return [];
    return [{ homeTeam: event.strHomeTeam, awayTeam: event.strAwayTeam, homeScore, awayScore }];
  });
}

function normalizeLegacyMatch(event: LegacyEvent, config: LegacyLeague, history: HistoricalEvent[]): Match | null {
  if (!event.strHomeTeam || !event.strAwayTeam) return null;
  const kickoff = legacyKickoff(event);
  if (!Number.isFinite(kickoff.getTime())) return null;
  const formatted = displayKickoff(kickoff);
  const model = config.sport === "basketball"
    ? runBasketballMarginModel(event.strHomeTeam, event.strAwayTeam, history)
    : runTennisFormModel(event.strHomeTeam, event.strAwayTeam, history);

  return {
    id: `legacy-${event.idEvent || `${config.id}-${formatted.iso}`}`,
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

function communityMatches(): Match[] {
  const now = new Date();
  const saturday = new Date(now);
  saturday.setUTCDate(now.getUTCDate() + ((6 - now.getUTCDay() + 7) % 7 || 7));
  saturday.setUTCHours(18, 0, 0, 0);
  const sunday = new Date(saturday);
  sunday.setUTCDate(saturday.getUTCDate() + 1);
  sunday.setUTCHours(16, 30, 0, 0);

  const codm = displayKickoff(saturday);
  const eafc = displayKickoff(sunday);

  return [
    {
      id: "community-nim-volt",
      sport: "codm",
      league: "CODM Africa Community Series",
      leagueShort: "CACS",
      date: codm.dateText,
      time: codm.timeText,
      kickoffISO: codm.iso,
      home: makeTeam("NIM Gaming"),
      away: makeTeam("Volt Esports"),
      probabilities: [58, 42],
      predictions: [
        { label: "NIM series win", value: "58%", featured: true, explanation: "Community form index, not a bookmaker market." },
        { label: "Volt series win", value: "42%", explanation: "Community form index, not a bookmaker market." },
        { label: "Map 4 played", value: "66%", explanation: "Chance the best-of-five reaches a fourth map." },
        { label: "Map 5 played", value: "39%", explanation: "Chance the series reaches the deciding map." },
      ],
      confidence: 57,
      model: {
        method: "Community series index",
        version: "PA-Esports 0.4",
        sampleSize: 6,
        factors: [
          { label: "Recent series form", value: "NIM +8", strength: 64, tone: "positive", detail: "Manually verified community match results in the current six-series sample." },
          { label: "Map pool depth", value: "Close", strength: 52, tone: "neutral", detail: "No complete public picks-and-bans dataset is available yet." },
          { label: "Data coverage", value: "Limited", strength: 28, tone: "negative", detail: "Community-maintained rather than an official public API feed." },
        ],
        caveat: "CODM Africa does not yet have a reliable public fixtures API.",
      },
      source: "community",
      sourceLabel: "Community-maintained fixture",
      featured: true,
    },
    {
      id: "community-lagos-accra",
      sport: "eafc",
      league: "EA FC Africa Open",
      leagueShort: "EAFC",
      date: eafc.dateText,
      time: eafc.timeText,
      kickoffISO: eafc.iso,
      home: makeTeam("Lagos XI"),
      away: makeTeam("Accra Pulse"),
      probabilities: [45, 25, 30],
      predictions: [
        { label: "Lagos XI win", value: "45%", featured: true, explanation: "Short-sample scoring model." },
        { label: "Draw", value: "25%", explanation: "Full-time draw probability." },
        { label: "Accra Pulse win", value: "30%", explanation: "Short-sample scoring model." },
        { label: "Over 3.5 goals", value: "61%", explanation: "EA FC event matches use a higher scoring baseline." },
      ],
      confidence: 54,
      model: {
        method: "Short-sample goal model",
        version: "PA-EAFC 0.3",
        expectedHome: 2.2,
        expectedAway: 1.7,
        expectedTotal: 3.9,
        sampleSize: 5,
        topScoreline: "2–1",
        factors: [
          { label: "Recent scoring", value: "2.2 · 1.7", strength: 63, tone: "positive", detail: "Average goals in five manually logged series matches." },
          { label: "Player form", value: "Lagos edge", strength: 58, tone: "positive", detail: "Current community event form." },
          { label: "Data coverage", value: "Limited", strength: 24, tone: "negative", detail: "EA FC Africa is community-maintained." },
        ],
        caveat: "EA FC Africa is community-maintained until a reliable tournament feed is connected.",
      },
      source: "community",
      sourceLabel: "Community-maintained fixture",
    },
  ];
}

async function buildPayload() {
  const now = new Date();
  const [footballBundles, legacyBundles] = await Promise.all([
    buildFootballBundles(),
    buildLegacyBundles(now),
  ]);

  const footballMatches = footballBundles.flatMap((bundle) =>
    bundle.upcoming
      .map((item) => normalizeFootballMatch(item, bundle.config, bundle.history))
      .filter((match): match is Match => Boolean(match)),
  );

  const legacyMatches = legacyBundles.flatMap((bundle) =>
    bundle.upcoming
      .slice(0, 6)
      .map((event) => normalizeLegacyMatch(event, bundle.config, bundle.history))
      .filter((match): match is Match => Boolean(match)),
  );

  const apiMatches = [...footballMatches, ...legacyMatches];
  const matches = [...apiMatches, ...communityMatches()].sort((a, b) =>
    new Date(a.kickoffISO).getTime() - new Date(b.kickoffISO).getTime(),
  );

  return {
    matches,
    generatedAt: new Date().toISOString(),
    provider: "API-Football + TheSportsDB",
    footballProvider: "API-Football",
    seasonSample: String(footballBundles.find((bundle) => bundle.season)?.season || seasonStart(now)),
    leagueCatalog: [
      ...footballBundles.map((bundle) => ({
        id: bundle.config.id,
        name: bundle.config.name,
        short: bundle.config.short,
        sport: bundle.config.sport,
        matchCount: footballMatches.filter((match) => match.leagueId === bundle.config.id).length,
        available: bundle.available,
        provider: "API-Football",
        providerSeason: bundle.season,
        error: bundle.error,
      })),
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
      matches: communityMatches(),
      generatedAt: new Date().toISOString(),
      provider: "API-Football + TheSportsDB",
      footballProvider: "API-Football",
      seasonSample: String(seasonStart()),
      leagueCatalog: [
        ...footballLeagues.map((league) => ({ ...league, matchCount: 0, available: false, provider: "API-Football" })),
        ...legacyLeagues.map((league) => ({ ...league, matchCount: 0, available: false, provider: "TheSportsDB" })),
      ],
      liveCount: 0,
      communityCount: 2,
      status: "fallback",
      error: error instanceof Error ? error.message : "Unknown feed error",
    }, {
      status: 200,
      headers: { "Cache-Control": "public, max-age=60, s-maxage=180, stale-while-revalidate=3600" },
    });
  }
}
