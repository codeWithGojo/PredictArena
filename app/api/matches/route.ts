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

type LegacyApiEvent = {
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

type FootballFixture = {
  fixture?: {
    id?: number;
    date?: string;
    venue?: { name?: string | null };
    status?: { short?: string | null };
  };
  league?: {
    id?: number;
    name?: string;
    logo?: string;
  };
  teams?: {
    home?: { id?: number; name?: string; logo?: string };
    away?: { id?: number; name?: string; logo?: string };
  };
  goals?: {
    home?: number | null;
    away?: number | null;
  };
};

type FootballLeagueConfig = {
  id: string;
  sport: "football";
  short: string;
  name: string;
};

type LegacyLeagueConfig = {
  id: string;
  sport: "basketball" | "tennis";
  short: string;
  name: string;
  calendarSeason?: boolean;
};

type LeagueConfig = FootballLeagueConfig | LegacyLeagueConfig;

const footballLeagues: FootballLeagueConfig[] = [
  { id: "39", sport: "football", short: "PL", name: "Premier League" },
  { id: "140", sport: "football", short: "LL", name: "La Liga" },
  { id: "135", sport: "football", short: "SA", name: "Serie A" },
  { id: "78", sport: "football", short: "BL", name: "Bundesliga" },
  { id: "61", sport: "football", short: "L1", name: "Ligue 1" },
  { id: "2", sport: "football", short: "UCL", name: "Champions League" },
];

const legacyLeagues: LegacyLeagueConfig[] = [
  { id: "4387", sport: "basketball", short: "NBA", name: "NBA" },
  { id: "4464", sport: "tennis", short: "ATP", name: "ATP World Tour", calendarSeason: true },
];

const leagues: LeagueConfig[] = [...footballLeagues, ...legacyLeagues];

const FOOTBALL_API_ROOT = "https://v3.football.api-sports.io";
const LEGACY_API_ROOT = "https://www.thesportsdb.com/api/v1/json";
const CACHE_MS = 3 * 60 * 60 * 1000;
let memoryCache: { timestamp: number; payload: unknown } | null = null;

function env() {
  const runtime = globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> };
  };
  return runtime.process?.env || {};
}

function footballApiKey() {
  return env().API_FOOTBALL_KEY;
}

function legacyApiKey() {
  return env().THE_SPORTS_DB_API_KEY || "123";
}

async function fetchFootballFixtures(config: FootballLeagueConfig, season: number): Promise<FootballFixture[]> {
  const key = footballApiKey();
  if (!key) throw new Error("API_FOOTBALL_KEY is not configured");

  const url = new URL(`${FOOTBALL_API_ROOT}/fixtures`);
  url.searchParams.set("league", config.id);
  url.searchParams.set("season", String(season));

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "x-apisports-key": key,
    },
    next: { revalidate: 10800 },
  });

  if (!response.ok) throw new Error(`API-Football returned ${response.status}`);
  const payload = await response.json() as {
    response?: FootballFixture[];
    errors?: unknown;
  };
  return Array.isArray(payload.response) ? payload.response : [];
}

async function fetchLegacyEvents(endpoint: string): Promise<LegacyApiEvent[]> {
  const response = await fetch(`${LEGACY_API_ROOT}/${legacyApiKey()}/${endpoint}`, {
    headers: { Accept: "application/json", "User-Agent": "PredictArena/1.0" },
    next: { revalidate: 10800 },
  });
  if (!response.ok) throw new Error(`Legacy sports feed returned ${response.status}`);
  const payload = await response.json() as { events?: LegacyApiEvent[] | null };
  return Array.isArray(payload.events) ? payload.events : [];
}

function seasonStart(now = new Date()) {
  const year = now.getUTCFullYear();
  return now.getUTCMonth() >= 6 ? year : year - 1;
}

function legacyCurrentSeason(config: LegacyLeagueConfig, now = new Date()) {
  if (config.calendarSeason) return `${now.getUTCFullYear()}`;
  const start = seasonStart(now);
  return `${start}-${start + 1}`;
}

function legacyPreviousSeason(config: LegacyLeagueConfig, now = new Date()) {
  if (config.calendarSeason) return `${now.getUTCFullYear() - 1}`;
  const start = seasonStart(now);
  return `${start - 1}-${start}`;
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

function legacyToHistory(events: LegacyApiEvent[]): HistoricalEvent[] {
  return events.flatMap((event) => {
    if (
      event.intHomeScore === null || event.intHomeScore === undefined || event.intHomeScore === "" ||
      event.intAwayScore === null || event.intAwayScore === undefined || event.intAwayScore === ""
    ) return [];
    const homeScore = Number(event.intHomeScore);
    const awayScore = Number(event.intAwayScore);
    if (!event.strHomeTeam || !event.strAwayTeam || !Number.isFinite(homeScore) || !Number.isFinite(awayScore)) return [];
    return [{ homeTeam: event.strHomeTeam, awayTeam: event.strAwayTeam, homeScore, awayScore }];
  });
}

function isFootballUpcoming(item: FootballFixture, now = new Date()) {
  const kickoff = item.fixture?.date ? new Date(item.fixture.date) : null;
  if (!kickoff || !Number.isFinite(kickoff.getTime())) return false;
  const status = item.fixture?.status?.short || "";
  return ["NS", "TBD"].includes(status) && kickoff.getTime() >= now.getTime() - 60 * 60 * 1000;
}

function legacyKickoff(event: LegacyApiEvent) {
  const raw = event.strTimestamp || `${event.dateEvent || new Date().toISOString().slice(0, 10)}T${event.strTime || "12:00:00"}`;
  return new Date(raw.endsWith("Z") ? raw : `${raw}Z`);
}

function isLegacyUpcoming(event: LegacyApiEvent, now = new Date()) {
  const hasScore = event.intHomeScore !== null && event.intHomeScore !== undefined && event.intHomeScore !== "";
  if (hasScore) return false;
  const time = legacyKickoff(event).getTime();
  return Number.isFinite(time) && time >= now.getTime() - 60 * 60 * 1000;
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

function normalizeFootballMatch(
  item: FootballFixture,
  config: FootballLeagueConfig,
  history: HistoricalEvent[],
): Match | null {
  const home = item.teams?.home?.name;
  const away = item.teams?.away?.name;
  const kickoffRaw = item.fixture?.date;
  if (!home || !away || !kickoffRaw) return null;

  const kickoff = new Date(kickoffRaw);
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

function normalizeLegacyMatch(
  event: LegacyApiEvent,
  config: LegacyLeagueConfig,
  history: HistoricalEvent[],
): Match | null {
  if (!event.strHomeTeam || !event.strAwayTeam) return null;
  const formatted = displayKickoff(legacyKickoff(event));
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

function communityMatches(): Match[] {
  const now = new Date();
  const nextSaturday = new Date(now);
  const daysUntilSaturday = (6 - now.getUTCDay() + 7) % 7 || 7;
  nextSaturday.setUTCDate(now.getUTCDate() + daysUntilSaturday);
  nextSaturday.setUTCHours(18, 0, 0, 0);
  const nextSunday = new Date(nextSaturday);
  nextSunday.setUTCDate(nextSaturday.getUTCDate() + 1);
  nextSunday.setUTCHours(16, 30, 0, 0);

  const formatCommunity = (date: Date) => ({
    date: new Intl.DateTimeFormat("en-NG", { timeZone: "Africa/Lagos", weekday: "short", day: "2-digit", month: "short" }).format(date).toUpperCase(),
    time: new Intl.DateTimeFormat("en-NG", { timeZone: "Africa/Lagos", hour: "2-digit", minute: "2-digit", hour12: false }).format(date),
  });
  const codmTime = formatCommunity(nextSaturday);
  const eaTime = formatCommunity(nextSunday);

  return [
    {
      id: "community-nim-volt",
      sport: "codm",
      league: "CODM Africa Community Series",
      leagueShort: "CACS",
      date: codmTime.date,
      time: codmTime.time,
      kickoffISO: nextSaturday.toISOString(),
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
          { label: "Data coverage", value: "Limited", strength: 28, tone: "negative", detail: "This is community-maintained rather than an official public API feed." },
        ],
        caveat: "CODM Africa does not yet have a reliable public fixtures API. The date and result history must be community-verified before each update.",
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
      date: eaTime.date,
      time: eaTime.time,
      kickoffISO: nextSunday.toISOString(),
      home: makeTeam("Lagos XI"),
      away: makeTeam("Accra Pulse"),
      probabilities: [45, 25, 30],
      predictions: [
        { label: "Lagos XI win", value: "45%", featured: true, explanation: "Short-sample scoring model." },
        { label: "Draw", value: "25%", explanation: "Full-time draw probability." },
        { label: "Accra Pulse win", value: "30%", explanation: "Short-sample scoring model." },
        { label: "Over 3.5 goals", value: "61%", explanation: "EA FC event matches typically produce a higher scoring baseline." },
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
          { label: "Player form", value: "Lagos edge", strength: 58, tone: "positive", detail: "Current community event form, pending an official competition feed." },
          { label: "Data coverage", value: "Limited", strength: 24, tone: "negative", detail: "EA FC Africa results are not available through the sports schedule API." },
        ],
        caveat: "EA FC Africa is community-maintained until an official or licensed tournament feed is connected.",
      },
      source: "community",
      sourceLabel: "Community-maintained fixture",
    },
  ];
}

async function buildFootballBundles(now: Date) {
  const season = seasonStart(now);

  return Promise.all(footballLeagues.map(async (config) => {
    try {
      const fixtures = await fetchFootballFixtures(config, season);
      const history = footballToHistory(fixtures);
      const upcoming = fixtures
        .filter((item) => isFootballUpcoming(item, now))
        .sort((a, b) => new Date(a.fixture?.date || 0).getTime() - new Date(b.fixture?.date || 0).getTime());

      return { config, upcoming, history, available: true };
    } catch {
      return { config, upcoming: [] as FootballFixture[], history: [] as HistoricalEvent[], available: false };
    }
  }));
}

async function buildLegacyBundles(now: Date) {
  return Promise.all(legacyLeagues.map(async (config) => {
    const activeSeason = legacyCurrentSeason(config, now);
    const historySeason = legacyPreviousSeason(config, now);
    const [current, historical] = await Promise.allSettled([
      fetchLegacyEvents(`eventsseason.php?id=${config.id}&s=${activeSeason}`),
      fetchLegacyEvents(`eventsseason.php?id=${config.id}&s=${historySeason}`),
    ]);

    const currentEvents = current.status === "fulfilled" ? current.value : [];
    let upcoming = currentEvents
      .filter((event) => isLegacyUpcoming(event, now))
      .sort((a, b) => legacyKickoff(a).getTime() - legacyKickoff(b).getTime());

    let available = current.status === "fulfilled";
    if (!upcoming.length) {
      try {
        upcoming = await fetchLegacyEvents(`eventsnextleague.php?id=${config.id}`);
        available = true;
      } catch {
        available = false;
      }
    }

    const previousEvents = historical.status === "fulfilled" ? historical.value : [];
    return {
      config,
      upcoming,
      history: legacyToHistory([...currentEvents, ...previousEvents]),
      available,
    };
  }));
}

async function buildPayload() {
  const now = new Date();
  const [footballBundles, legacyBundles] = await Promise.all([
    buildFootballBundles(now),
    buildLegacyBundles(now),
  ]);

  const footballMatches = footballBundles.flatMap((bundle) =>
    bundle.upcoming
      .slice(0, 6)
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

  const catalog = [
    ...footballBundles.map((bundle) => ({
      id: bundle.config.id,
      name: bundle.config.name,
      short: bundle.config.short,
      sport: bundle.config.sport,
      matchCount: footballMatches.filter((match) => match.leagueId === bundle.config.id).length,
      available: bundle.available,
      provider: "API-Football",
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
  ];

  return {
    matches,
    generatedAt: new Date().toISOString(),
    provider: "API-Football + TheSportsDB",
    footballProvider: "API-Football",
    seasonSample: String(seasonStart(now)),
    leagueCatalog: catalog,
    liveCount: apiMatches.length,
    communityCount: matches.length - apiMatches.length,
    status: apiMatches.length ? "live" : "fallback",
  };
}

export async function GET(request: Request) {
  try {
    const forceRefresh = new URL(request.url).searchParams.has("refresh");
    const cacheAge = memoryCache ? Date.now() - memoryCache.timestamp : Number.POSITIVE_INFINITY;
    const canForceRefresh = forceRefresh && cacheAge >= 60 * 1000;

    if (!canForceRefresh && memoryCache && cacheAge < CACHE_MS) {
      return Response.json(memoryCache.payload, {
        headers: { "Cache-Control": "public, max-age=300, s-maxage=10800, stale-while-revalidate=86400" },
      });
    }

    const payload = await buildPayload();
    memoryCache = { timestamp: Date.now(), payload };
    return Response.json(payload, {
      headers: { "Cache-Control": "public, max-age=300, s-maxage=10800, stale-while-revalidate=86400" },
    });
  } catch {
    const payload = {
      matches: communityMatches(),
      generatedAt: new Date().toISOString(),
      provider: "API-Football + TheSportsDB",
      footballProvider: "API-Football",
      seasonSample: String(seasonStart()),
      leagueCatalog: leagues.map((league) => ({ ...league, matchCount: 0, available: false })),
      liveCount: 0,
      communityCount: 2,
      status: "fallback",
    };
    return Response.json(payload, {
      status: 200,
      headers: { "Cache-Control": "public, max-age=60, s-maxage=180, stale-while-revalidate=3600" },
    });
  }
}
