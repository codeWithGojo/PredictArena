import { openEventToFixture, type OpenEvent } from "./open-football";
import { footballDataToFixture, type FootballDataMatch } from "./football-data";
import {
  colorsFromName,
  shortName,
  type Match,
} from "./sports";
import { modelForFixture, participantId, type CompletedFixture } from "./model-adapter";
import manualFixtures from "../data/manual-football-fixtures.json";

type FootballFixture = {
  fixture?: {
    id?: number | string;
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
  modelId: string;
  sport: "football";
  short: string;
  name: string;
  openSlug?: string;
  footballDataCode?: string;
};

export const footballLeagues: FootballLeague[] = [
  { id: "39", modelId: "football:premier-league", sport: "football", short: "PL", name: "Premier League", openSlug: "eng.1" },
  { id: "140", modelId: "football:la-liga", sport: "football", short: "LL", name: "La Liga", openSlug: "esp.1" },
  { id: "135", modelId: "football:serie-a", sport: "football", short: "SA", name: "Serie A", footballDataCode: "SA" },
  { id: "78", modelId: "football:bundesliga", sport: "football", short: "BL", name: "Bundesliga", footballDataCode: "BL1" },
  { id: "61", modelId: "football:ligue-1", sport: "football", short: "L1", name: "Ligue 1", footballDataCode: "FL1" },
  { id: "2", modelId: "football:champions-league", sport: "football", short: "UCL", name: "Champions League", footballDataCode: "CL" },
];

const API_ROOT = "https://v3.football.api-sports.io";
const OPEN_API_ROOT = "https://worldcup26.ir";
const FOOTBALL_DATA_ROOT = "https://api.football-data.org/v4";
export const FOOTBALL_CACHE_SECONDS = 6 * 60 * 60;

async function requestOpenFixtures(config: FootballLeague, now: Date): Promise<FootballFixture[]> {
  if (!config.openSlug) throw new Error("No open football league mapping");
  const from = new Date(now);
  from.setUTCDate(from.getUTCDate() - 60);
  const to = new Date(now);
  to.setUTCDate(to.getUTCDate() + 30);
  const url = new URL(`/get/soccer/${config.openSlug}/fixtures`, OPEN_API_ROOT);
  url.searchParams.set("status", "all");
  url.searchParams.set("from", isoDate(from).replaceAll("-", ""));
  url.searchParams.set("to", isoDate(to).replaceAll("-", ""));
  url.searchParams.set("limit", "200");
  const response = await fetch(url, { headers: { Accept: "application/json" },
    next: { revalidate: FOOTBALL_CACHE_SECONDS } });
  if (!response.ok) throw new Error(`Open football API HTTP ${response.status}`);
  const payload = await response.json() as { events?: OpenEvent[]; count?: number; pageCount?: number };
  if (!Array.isArray(payload.events)) throw new Error("Open football API returned no events array");
  // Never silently model an incomplete history window if the provider paginates it.
  if ((payload.pageCount || 1) > 1) throw new Error("Open football API history exceeds one page");
  return payload.events.flatMap((event) => {
    const fixture = openEventToFixture(event, config);
    return fixture ? [fixture] : [];
  });
}

async function requestFootballDataFixtures(config: FootballLeague, now: Date, token: string): Promise<FootballFixture[]> {
  if (!config.footballDataCode) throw new Error("No football-data.org league mapping");
  const from = new Date(now);
  from.setUTCDate(from.getUTCDate() - 60);
  const to = new Date(now);
  to.setUTCDate(to.getUTCDate() + 31); // dateTo is exclusive.
  const url = new URL(`${FOOTBALL_DATA_ROOT}/competitions/${config.footballDataCode}/matches`);
  url.searchParams.set("dateFrom", isoDate(from));
  url.searchParams.set("dateTo", isoDate(to));
  const response = await fetch(url, { headers: { Accept: "application/json", "X-Auth-Token": token },
    next: { revalidate: FOOTBALL_CACHE_SECONDS } });
  if (!response.ok) throw new Error(`football-data.org HTTP ${response.status}`);
  const payload = await response.json() as { matches?: FootballDataMatch[] };
  if (!Array.isArray(payload.matches)) throw new Error("football-data.org returned no matches array");
  return payload.matches.flatMap((match) => {
    const fixture = footballDataToFixture(match, config);
    return fixture ? [fixture] : [];
  });
}

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
    next: { revalidate: FOOTBALL_CACHE_SECONDS },
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

function toHistory(fixtures: FootballFixture[], now: Date): CompletedFixture[] {
  return fixtures.flatMap((item) => {
    const kickoff = item.fixture?.date ? new Date(item.fixture.date) : null;
    const home = item.teams?.home?.name;
    const away = item.teams?.away?.name;
    const homeScore = item.goals?.home;
    const awayScore = item.goals?.away;
    if (!kickoff || !Number.isFinite(kickoff.getTime()) || kickoff.getTime() >= now.getTime() ||
      item.fixture?.status?.short !== "FT" || !home || !away || homeScore == null || awayScore == null) return [];
    return [{ id: `api-football-${item.fixture?.id ?? `${kickoff.toISOString()}-${home}-${away}`}`,
      startsAt: kickoff.toISOString(), home, away, homeScore, awayScore, status: "finished" as const }];
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

function normalize(item: FootballFixture, config: FootballLeague, history: CompletedFixture[], now: Date, provider: string): Match | null {
  const home = item.teams?.home?.name;
  const away = item.teams?.away?.name;
  const raw = item.fixture?.date;
  if (!home || !away || !raw) return null;

  const kickoff = new Date(raw);
  if (!Number.isFinite(kickoff.getTime()) || kickoff.getTime() <= now.getTime()) return null;
  const formatted = displayKickoff(kickoff);
  const prefix = provider === "worldcup26.ir" ? "open-football" : provider === "football-data.org" ? "football-data" : "api-football";
  const id = `${prefix}-${item.fixture?.id || `${config.id}-${formatted.iso}`}`;
  const model = modelForFixture({ id, sport: "football", competitionId: config.modelId,
    season: String(item.league?.season || seasonStart(now)), startsAt: formatted.iso, home, away }, history, now);

  return {
    id,
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
    sourceLabel: `${provider} fixture · PredictArena model`,
    featured: model.confidence >= 62,
  };
}

type ManualFixture = { id: string; leagueId: string; startsAt: string; home: string; away: string; venue?: string };

function normalizeManual(item: ManualFixture, config: FootballLeague, history: CompletedFixture[], now: Date): Match | null {
  const kickoff = new Date(item.startsAt);
  if (!/^[a-zA-Z0-9-]{1,48}$/.test(item.id) || !Number.isFinite(kickoff.getTime()) ||
    kickoff.toISOString() !== item.startsAt ||
    kickoff.getTime() <= now.getTime() || !item.home?.trim() || !item.away?.trim() ||
    participantId(item.home) === participantId(item.away)) return null;
  const formatted = displayKickoff(kickoff);
  const model = modelForFixture({ id: `manual-${item.id}`, sport: "football", competitionId: config.modelId,
    season: String(seasonStart(now)), startsAt: formatted.iso, home: item.home, away: item.away }, history, now);
  return { id: `manual-${item.id}`, sport: "football", leagueId: config.id, league: config.name, leagueShort: config.short,
    date: formatted.dateText, time: formatted.timeText, kickoffISO: formatted.iso, venue: item.venue,
    home: makeTeam(item.home), away: makeTeam(item.away), ...model, source: "manual",
    sourceLabel: "Manually entered fixture · PredictArena model", featured: model.confidence >= 62 };
}

export async function buildFootballPayload() {
  const now = new Date();
  const footballDataToken = env().FOOTBALL_DATA_TOKEN;
  const bundles = await Promise.all(footballLeagues.map(async (config) => {
    const provider = config.openSlug ? "worldcup26.ir" : config.footballDataCode && footballDataToken ? "football-data.org" : "API-Football";
    try {
      const fixtures = config.openSlug ? await requestOpenFixtures(config, now) :
        config.footballDataCode && footballDataToken ? await requestFootballDataFixtures(config, now, footballDataToken) :
          await requestFixtures(config, now);
      const history = toHistory(fixtures, now);
      const upcoming = fixtures
        .filter((item) => isUpcoming(item, now))
        .sort((a, b) => new Date(a.fixture?.date || 0).getTime() - new Date(b.fixture?.date || 0).getTime());
      const providerSeason = fixtures.find((item) => item.league?.season)?.league?.season;
      return { config, history, upcoming, available: true, provider, providerSeason, error: null as string | null };
    } catch (error) {
      return {
        config,
        history: [] as CompletedFixture[],
        upcoming: [] as FootballFixture[],
        available: false,
        provider,
        providerSeason: undefined as number | undefined,
        error: error instanceof Error ? error.message : "Unknown API-Football error",
      };
    }
  }));

  const apiMatches = bundles.flatMap((bundle) =>
    bundle.upcoming
      .map((item) => normalize(item, bundle.config, bundle.history, now, bundle.provider))
      .filter((match): match is Match => Boolean(match)),
  );
  const manualMatches = (Array.isArray(manualFixtures) ? manualFixtures as ManualFixture[] : []).flatMap((item) => {
    const bundle = bundles.find(({ config }) => config.id === item.leagueId);
    if (!bundle) return [];
    const match = normalizeManual(item, bundle.config, bundle.history, now);
    if (!match || apiMatches.some((existing) => existing.leagueId === match.leagueId &&
      existing.kickoffISO === match.kickoffISO && existing.home.name.toLowerCase() === match.home.name.toLowerCase() &&
      existing.away.name.toLowerCase() === match.away.name.toLowerCase())) return [];
    return [match];
  });
  const matches = [...apiMatches, ...manualMatches];

  return {
    matches,
    manualCount: manualMatches.length,
    leagueCatalog: bundles.map((bundle) => ({
      id: bundle.config.id,
      name: bundle.config.name,
      short: bundle.config.short,
      sport: bundle.config.sport,
      matchCount: matches.filter((match) => match.leagueId === bundle.config.id).length,
      available: bundle.available,
      provider: bundle.provider,
      providerSeason: bundle.providerSeason,
      error: bundle.error,
    })),
    seasonSample: String(bundles.find((bundle) => bundle.providerSeason)?.providerSeason || seasonStart(now)),
  };
}
