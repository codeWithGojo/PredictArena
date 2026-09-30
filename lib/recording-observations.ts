import type { Match } from './sports.ts';

export type RecordingObservation = {
  leagueId: string; home: string; away: string; fixtureDate: string;
  bookmaker: string; odds: number[];
  goalsLastFive: { home: number | null; away: number | null };
};
export type RecordingBatch = {
  source: string; sourceFile: string; recordedDate: string; observedAt: null;
  reviewed: boolean; notes: string[]; entries: RecordingObservation[];
};
export type RecordingContext = RecordingObservation & {
  source: string; recordedDate: string; marketProbabilities: number[];
  stale: boolean; limitations: string[];
};
const aliases: Record<string, string> = {
  'leeds': 'leeds united', 'man city': 'manchester city', 'manchester city fc': 'manchester city',
  'dortmund': 'borussia dortmund', 'bayern munchen': 'bayern munich',
  'mainz 05': 'mainz', '1. fsv mainz 05': 'mainz', 'leverkusen': 'bayer leverkusen',
  'alaves': 'deportivo alaves', 'atletico de madrid': 'atletico madrid',
};
function team(name: string) {
  const value = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');
  return aliases[value] ?? value;
}
export function marketProbabilities(odds: number[]) {
  if (odds.length !== 3 || odds.some(o => !Number.isFinite(o) || o <= 1)) throw new TypeError('Invalid 1X2 odds');
  const implied = odds.map(o => 1 / o), sum = implied.reduce((a, b) => a + b, 0);
  return implied.map(p => p / sum);
}
export function attachRecordingContext(match: Match, batch: RecordingBatch, now = new Date()): Match {
  if (!batch.reviewed || match.sport !== 'football') return match;
  // Exact competition, ordered teams and UTC date; rescheduled fixtures remain unmatched.
  const found = batch.entries.filter(e => e.leagueId === match.leagueId &&
    e.fixtureDate === match.kickoffISO.slice(0, 10) && team(e.home) === team(match.home.name) && team(e.away) === team(match.away.name));
  if (found.length !== 1) return match;
  const entry = found[0];
  const stale = now.toISOString().slice(0, 10) !== batch.recordedDate;
  return { ...match, recordingContext: { ...entry, source: batch.source, recordedDate: batch.recordedDate,
    marketProbabilities: marketProbabilities(entry.odds), stale, limitations: batch.notes } };
}
