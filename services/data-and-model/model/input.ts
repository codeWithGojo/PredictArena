import type { History, ModelInput, Publication } from './types.ts';
import { DAY } from './math.ts';

export function timestamp(value: unknown): number {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)) return NaN;
  const ms = Date.parse(value);
  return Number.isFinite(ms) && new Date(ms).toISOString() === value ? ms : NaN;
}
const competitions = new Set([
  'football:premier-league', 'football:la-liga', 'football:serie-a', 'football:bundesliga',
  'football:ligue-1', 'football:champions-league', 'football:europa-league', 'basketball:nba', 'tennis:atp',
]);
export function validateInput(input: ModelInput, publication: Publication): void {
  const f = input.fixture;
  if (input.schemaVersion !== 1 || !f || !competitions.has(f.competitionId) ||
      !f.competitionId.startsWith(f.sport + ':') || !['football', 'basketball', 'tennis'].includes(f.sport) ||
      !f.id || !f.homeId || !f.awayId || f.homeId === f.awayId || !f.season ||
      typeof f.neutralVenue !== 'boolean' || !Array.isArray(input.history) ||
      !Number.isFinite(timestamp(input.asOf)) || !Number.isFinite(timestamp(f.startsAt)) ||
      timestamp(input.asOf) >= timestamp(f.startsAt)) throw new TypeError('Invalid model input or pre-match cutoff.');
  if (!publication.id || !Number.isFinite(timestamp(publication.generatedAt)) ||
      timestamp(publication.generatedAt) < timestamp(input.asOf) ||
      timestamp(publication.generatedAt) >= timestamp(f.startsAt) || typeof publication.isStale !== 'boolean') {
    throw new TypeError('Publication metadata must describe a pre-match prediction.');
  }
  if (input.surface != null && !['hard', 'clay', 'grass', 'carpet'].includes(input.surface)) throw new TypeError('Invalid surface.');
  if (input.bestOf != null && input.bestOf !== 3 && input.bestOf !== 5) throw new TypeError('Invalid bestOf.');
}
export function eligibleHistory(input: ModelInput): History[] {
  const cutoff = timestamp(input.asOf), sport = input.fixture.sport;
  const expectedUnit = { football: 'goals', basketball: 'points', tennis: 'sets' }[sport];
  const byId = new Map<string, History>();
  const conflicting = new Set<string>();
  for (const row of input.history) {
    const start = timestamp(row.startsAt), end = timestamp(row.completedAt), observed = timestamp(row.observedAt);
    if (!row.fixtureId || row.fixtureId === input.fixture.id || row.competitionId !== input.fixture.competitionId ||
        !row.homeId || !row.awayId || row.homeId === row.awayId || row.unit !== expectedUnit ||
        ![start, end, observed].every(Number.isFinite) || start >= end || end > observed || observed > cutoff || start < cutoff - 365 * DAY ||
        !Number.isSafeInteger(row.homeScore) || !Number.isSafeInteger(row.awayScore) || row.homeScore < 0 || row.awayScore < 0 ||
        (sport !== 'football' && row.homeScore === row.awayScore) ||
        (sport === 'tennis' && !((Math.max(row.homeScore, row.awayScore) === 2 || Math.max(row.homeScore, row.awayScore) === 3) &&
          Math.min(row.homeScore, row.awayScore) < Math.max(row.homeScore, row.awayScore)))) continue;
    const old = byId.get(row.fixtureId);
    if (!old || observed > timestamp(old.observedAt)) {
      byId.set(row.fixtureId, row); conflicting.delete(row.fixtureId);
    } else if (observed === timestamp(old.observedAt) &&
      ['homeId','awayId','homeScore','awayScore','startsAt','completedAt','surface'].some(k => row[k as keyof History] !== old[k as keyof History])) {
      conflicting.add(row.fixtureId);
    }
  }
  return [...byId.values()].filter(r => !conflicting.has(r.fixtureId))
    .sort((a, b) => timestamp(a.completedAt) - timestamp(b.completedAt) || (a.fixtureId < b.fixtureId ? -1 : a.fixtureId > b.fixtureId ? 1 : 0)).slice(-200);
}
