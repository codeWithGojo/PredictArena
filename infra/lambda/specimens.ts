// Development response specimens, never provider output or a prediction model.
export const sports = ['football', 'basketball', 'tennis'] as const;
export type Sport = typeof sports[number];
export const asOf = '2026-09-19T10:00:00.000Z';
const competitions = [
  ['football', 'premier-league', 'Premier League', 'PL'], ['football', 'la-liga', 'La Liga', 'LL'],
  ['football', 'serie-a', 'Serie A', 'SA'], ['football', 'bundesliga', 'Bundesliga', 'BL'],
  ['football', 'ligue-1', 'Ligue 1', 'L1'], ['football', 'champions-league', 'Champions League', 'UCL'],
  ['football', 'europa-league', 'Europa League', 'UEL'], ['basketball', 'nba', 'NBA', 'NBA'], ['tennis', 'atp', 'ATP', 'ATP'],
];
export const catalog = competitions.map(([sport, id, name, shortName]) => ({
  id: `${sport}:${id}`, sport, name, shortName, activeSeason: '2026', availability: 'unavailable',
  standingsAvailable: false, updatedAt: asOf,
}));
export function fixture(sport: Sport) {
  return {
    id: `${sport}:stub:123`, sport, competitionId: catalog.find(c => c.sport === sport)!.id,
    season: '2026', round: null, startsAt: '2026-09-20T15:00:00.000Z', status: 'scheduled',
    home: { id: `${sport}:stub:1`, name: 'Example Home', shortName: 'HOM', badgeUrl: null },
    away: { id: `${sport}:stub:2`, name: 'Example Away', shortName: 'AWY', badgeUrl: null },
    venue: null, surface: sport === 'tennis' ? 'hard' : null, bestOf: sport === 'tennis' ? 3 : null,
    score: null, source: 'stub', updatedAt: asOf, isStale: true,
  };
}
export function summary(sport: Sport) {
  return {
    id: '01K5G9ZD80Q0SQTNHBN5T0B001', fixtureId: fixture(sport).id, sport,
    winProbability: null, expectedScore: null, confidence: null, availability: 'insufficient_data',
    modelVersion: 'phase-1-stub', generatedAt: asOf, dataCutoffAt: asOf, isStale: true,
  };
}
export function detail(sport: Sport) {
  return { summary: summary(sport), analysis: {
    method: 'Unconnected model', sampleSize: 0, participantSampleSize: { home: 0, away: 0 },
    projectedMargin: null, topScoreline: null, scoreMatrix: [], markets: [], factors: [],
    warnings: ['NO_HISTORY', 'STUB_RESPONSE'], featuresUsed: [],
    caveat: 'Development response specimen. No historical data or model is connected.',
  } };
}
export function standing(sport: Sport) {
  return {
    competitionId: fixture(sport).competitionId, season: '2026', group: 'overall', rank: 1,
    participant: fixture(sport).home, played: sport === 'tennis' ? null : 5,
    won: sport === 'tennis' ? null : 4, drawn: sport === 'football' ? 0 : null,
    lost: sport === 'tennis' ? null : 1, points: sport === 'basketball' ? null : 12,
    scoreFor: sport === 'tennis' ? null : 12, scoreAgainst: sport === 'tennis' ? null : 3,
  };
}
