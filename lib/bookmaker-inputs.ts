import type { Match } from './sports.ts';
import { colorsFromName, shortName } from './sports.ts';
import { marketProbabilities } from './recording-observations.ts';

export type ScreenshotEntry = {
  leagueId: string; fixtureDate: string | null; timeWAT: string; home: string; away: string;
  odds: number[] | null; bookmakerFixtureId: string; sourceFile: string;
  providerFixtureId?: string; providerHome?: string; providerAway?: string; originalKickoffISO?: string; kickoffISO?: string;
};
export type ScreenshotBatch = {
  source: string; bookmaker: string; capturedDate: string; receivedAt: string; reviewed: boolean;
  notes: string[]; entries: ScreenshotEntry[];
};
export type BookmakerInput = {
  bookmaker: string; fixtureId: string; capturedDate: string; receivedAt: string; sourceFile: string;
  odds: number[]; probabilities: number[]; method: 'Normalized implied 1X2 probabilities';
};
const additionalLeagues = [
  { id: '94', name: 'Primeira Liga', short: 'PT' },
  { id: '179', name: 'Scottish Premiership', short: 'SPL' },
  { id: '307', name: 'Saudi Pro League', short: 'SAU' },
];
export function applyBookmakerInputs(matches: Match[], batch: ScreenshotBatch): Match[] {
  if (!batch.reviewed) return matches;
  const corrected = matches.map(match => {
    const entries = batch.entries.filter(e => e.providerFixtureId === match.id && e.leagueId === match.leagueId &&
      e.providerHome === match.home.name && e.providerAway === match.away.name &&
      // Only the reviewed occurrence can be corrected; never a reused ID.
      [e.originalKickoffISO, e.kickoffISO].includes(match.kickoffISO));
    if (entries.length !== 1 || match.sport !== 'football') return match;
    const entry = entries[0];
    const next = { ...match };
    if (entry.kickoffISO && Number.isFinite(Date.parse(entry.kickoffISO))) {
      const date = new Date(entry.kickoffISO);
      next.kickoffISO = entry.kickoffISO;
      next.date = date.toLocaleDateString('en-NG', { timeZone: 'Africa/Lagos', weekday: 'short', day: '2-digit', month: 'short' }).toUpperCase();
      next.time = entry.timeWAT;
      if (entry.kickoffISO !== entry.originalKickoffISO) next.fixtureCorrection = {
        previousKickoffISO: entry.originalKickoffISO!, source: batch.source, sourceFile: entry.sourceFile,
        reviewedAt: batch.receivedAt, timezone: 'Africa/Lagos',
      };
    }
    if (entry.odds && entry.odds.length === 3 && entry.odds.every(o => Number.isFinite(o) && o > 1 && o <= 1000)) {
      next.bookmakerInput = { bookmaker: batch.bookmaker, fixtureId: entry.bookmakerFixtureId,
        capturedDate: batch.capturedDate, receivedAt: batch.receivedAt, sourceFile: entry.sourceFile,
        odds: entry.odds, probabilities: marketProbabilities(entry.odds), method: 'Normalized implied 1X2 probabilities' };
    }
    return next;
  });
  for (const entry of batch.entries) {
    const league = additionalLeagues.find(l => l.id === entry.leagueId);
    // Never infer a date from a cropped screenshot or pretend to have history.
    if (!league || !entry.fixtureDate || !/^\d{4}-\d{2}-\d{2}$/.test(entry.fixtureDate) || !/^\d{2}:\d{2}$/.test(entry.timeWAT)) continue;
    const id = `sportybet-${entry.bookmakerFixtureId}`;
    if (corrected.some(m => m.id === id || (m.leagueId === league.id && m.home.name === entry.home && m.away.name === entry.away && m.kickoffISO.slice(0, 10) === entry.fixtureDate))) continue;
    const kickoff = new Date(`${entry.fixtureDate}T${entry.timeWAT}:00+01:00`);
    if (!Number.isFinite(kickoff.getTime())) continue;
    const kickoffISO = kickoff.toISOString();
    const makeTeam = (name: string) => ({ name, short: shortName(name), colors: colorsFromName(name) });
    const match: Match = { id, sport: 'football', leagueId: league.id, league: league.name, leagueShort: league.short,
      date: new Date(kickoffISO).toLocaleDateString('en-NG', {timeZone:'Africa/Lagos',weekday:'short',day:'2-digit',month:'short'}).toUpperCase(),
      time: entry.timeWAT, kickoffISO, home: makeTeam(entry.home), away: makeTeam(entry.away),
      probabilities: [], predictions: [], confidence: 0,
      model: { method: 'Market-only snapshot; history model unavailable', version: 'PA-Market 1.0', sampleSize: 0, factors: [], caveat: 'NO_HISTORY. Bookmaker inputs are captured prices, not live quotes.' },
      source: 'manual', sourceLabel: 'Reviewed SportyBet screenshot · market only' };
    if (entry.odds && entry.odds.length === 3 && entry.odds.every(o => Number.isFinite(o) && o > 1 && o <= 1000)) match.bookmakerInput = {
      bookmaker: batch.bookmaker, fixtureId: entry.bookmakerFixtureId, capturedDate: batch.capturedDate,
      receivedAt: batch.receivedAt, sourceFile: entry.sourceFile, odds: entry.odds,
      probabilities: marketProbabilities(entry.odds), method: 'Normalized implied 1X2 probabilities',
    };
    corrected.push(match);
  }
  return corrected.sort((a,b) => Date.parse(a.kickoffISO) - Date.parse(b.kickoffISO));
}
type League = { id: string; name: string; short: string; sport: string; matchCount: number; available: boolean; provider?: string };
export function applyBookmakerFeed<T extends {matches: Match[]; leagueCatalog: League[]}>(feed: T, batch: ScreenshotBatch): Omit<T, 'matches' | 'leagueCatalog'> & {matches: Match[]; leagueCatalog: League[]} {
  const matches = applyBookmakerInputs(feed.matches, batch);
  const catalog = [...feed.leagueCatalog];
  for (const league of additionalLeagues) if (!catalog.some(l => l.id === league.id) && matches.some(m => m.leagueId === league.id)) catalog.push({ ...league, sport: 'football', matchCount: 0, available: true, provider: 'Reviewed SportyBet screenshot; market only' });
  return { ...feed, matches, leagueCatalog: catalog.map(l => ({ ...l, matchCount: matches.filter(m => m.leagueId === l.id).length })) };
}
