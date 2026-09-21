import type { Competition, FootballProvider, ProviderFixture, StandingRow } from "./types";

const API_ROOT = "https://v3.football.api-sports.io";
const CACHE_MS = 6 * 60 * 60 * 1000;
const RETRY_AFTER_MS = 60 * 1000;
type ApiFixture = { fixture?: { id?: number; date?: string; timestamp?: number; venue?: { name?: string | null }; status?: { short?: string | null } }; league?: { season?: number; round?: string | null }; teams?: { home?: { id?: number; name?: string; logo?: string | null }; away?: { id?: number; name?: string; logo?: string | null } }; goals?: { home?: number | null; away?: number | null }; score?: { fulltime?: { home?: number | null; away?: number | null } } };
type ApiStanding = { rank?: number; group?: string; all?: { played?: number; win?: number; draw?: number; lose?: number }; points?: number; goals?: { for?: number; against?: number }; team?: { id?: number; name?: string; logo?: string | null } };

export class ProviderRateLimitError extends Error { constructor(readonly retryAfterMs: number) { super("API-Football quota is temporarily exhausted"); } }
function key() { if (!process.env.API_FOOTBALL_KEY) throw new Error("API_FOOTBALL_KEY is not configured"); return process.env.API_FOOTBALL_KEY; }
function status(value?: string | null): ProviderFixture["status"] {
  if (["FT", "AET", "PEN", "AWD", "WO"].includes(value || "")) return "finished";
  if (["PST", "TBD"].includes(value || "")) return "postponed";
  if (["CANC", "ABD", "SUSP", "INT"].includes(value || "")) return "cancelled";
  if (["NS", "TBA"].includes(value || "")) return "scheduled";
  return "live";
}
function team(id: number | undefined, name: string | undefined, logo: string | null | undefined, fallback: string) { return { id: `football:api-football:${id ?? fallback}`, name: name || fallback, shortName: (name || fallback).slice(0, 3).toUpperCase(), badgeUrl: logo || null }; }

export class ApiFootballProvider implements FootballProvider {
  readonly name = "api-football";
  private readonly cache = new Map<string, { expiresAt: number; value: unknown }>();
  private blockedUntil = 0;
  private async request<T>(path: string, params: Record<string, string>) {
    const cacheKey = `${path}?${new URLSearchParams(params)}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.value as T;
    if (this.blockedUntil > Date.now()) throw new ProviderRateLimitError(this.blockedUntil - Date.now());
    const url = new URL(`${API_ROOT}${path}`); Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    const response = await fetch(url, { headers: { Accept: "application/json", "x-apisports-key": key() } });
    if (response.status === 429) { const retry = Number(response.headers.get("retry-after")) || RETRY_AFTER_MS / 1000; this.blockedUntil = Date.now() + retry * 1000; throw new ProviderRateLimitError(retry * 1000); }
    if (!response.ok) throw new Error(`API-Football HTTP ${response.status}`);
    const payload = await response.json() as { response?: T; errors?: Record<string, unknown> | string | unknown[] };
    const errors = payload.errors;
    const invalid = Array.isArray(errors) ? errors.length > 0 : typeof errors === "string" ? errors.length > 0 : Boolean(errors && Object.keys(errors).length);
    if (invalid) throw new Error("API-Football rejected the request");
    const value = (payload.response ?? []) as T; this.cache.set(cacheKey, { value, expiresAt: Date.now() + CACHE_MS }); return value;
  }
  async getFixtures(competition: Competition): Promise<ProviderFixture[]> {
    const [next, last] = await Promise.all([this.request<ApiFixture[]>("/fixtures", { league: String(competition.providerLeagueId), next: "12" }), this.request<ApiFixture[]>("/fixtures", { league: String(competition.providerLeagueId), last: "60" })]);
    const all = new Map<number, ApiFixture>(); [...next, ...last].forEach((item) => { if (item.fixture?.id) all.set(item.fixture.id, item); });
    return [...all.values()].flatMap((item) => {
      const fixture = item.fixture; const home = item.teams?.home; const away = item.teams?.away;
      if (!fixture?.id || !fixture.date || !home?.name || !away?.name || !item.league?.season) return [];
      const gameStatus = status(fixture.status?.short); const homeScore = item.score?.fulltime?.home ?? item.goals?.home; const awayScore = item.score?.fulltime?.away ?? item.goals?.away;
      return [{ id: fixture.id, date: new Date(fixture.date).toISOString(), updatedAt: new Date((fixture.timestamp || Math.floor(Date.now() / 1000)) * 1000).toISOString(), season: item.league.season, round: item.league.round || null, status: gameStatus, venue: fixture.venue?.name || null, home: { id: home.id || 0, name: home.name, logo: home.logo || null }, away: { id: away.id || 0, name: away.name, logo: away.logo || null }, score: homeScore == null || awayScore == null ? null : { home: homeScore, away: awayScore, unit: "goals" as const, regulation: gameStatus === "finished" ? { home: homeScore, away: awayScore } : null } }];
    });
  }
  async getStandings(competition: Competition, season: string): Promise<StandingRow[]> {
    const rows = await this.request<ApiStanding[][]>("/standings", { league: String(competition.providerLeagueId), season });
    return rows.flat().flatMap((row) => !row.rank || !row.team?.name ? [] : [{ competitionId: competition.id, season, group: row.group || "overall", rank: row.rank, participant: team(row.team.id, row.team.name, row.team.logo, "team"), played: row.all?.played || 0, won: row.all?.win || 0, drawn: row.all?.draw || 0, lost: row.all?.lose || 0, points: row.points || 0, scoreFor: row.goals?.for || 0, scoreAgainst: row.goals?.against || 0 }]);
  }
}
