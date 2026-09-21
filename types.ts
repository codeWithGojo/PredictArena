export type Sport = 'football' | 'basketball' | 'tennis';
export type Surface = 'hard' | 'clay' | 'grass' | 'carpet';
export type History = {
  fixtureId: string; competitionId: string; homeId: string; awayId: string;
  startsAt: string; completedAt: string; observedAt: string;
  homeScore: number; awayScore: number; unit: 'goals' | 'points' | 'sets';
  /** Optional model extension: producer must verify before supplying. */
  surface?: Surface | null;
};
export type Injury = {
  participantId: string; athleteId: string; status: 'out' | 'doubtful' | 'available';
  observedAt: string; source: string;
};
export type TeamHealth = {
  participantId: string; availabilityScore: number; restDays: number;
  observedAt: string; source: string;
};
export type ModelInput = {
  schemaVersion: 1;
  fixture: {
    id: string; sport: Sport; competitionId: string; season: string; startsAt: string;
    homeId: string; awayId: string; neutralVenue: boolean;
  };
  asOf: string; history: readonly History[];
  injuries?: readonly Injury[] | null; teamHealth?: readonly TeamHealth[] | null;
  surface?: Surface | null; bestOf?: 3 | 5 | null;
};
/** Assigned by the caller. No clock, random IDs or persistence inside the engine. */
export type Publication = { id: string; generatedAt: string; isStale: boolean };
export type Cell = { home: number; away: number; probability: number };
export type Market = {
  market: string; selection: string; line: number | null; probability: number;
  kind: 'probability' | 'heuristic' | 'historical-rate'; explanation: string;
};
export type Factor = {
  label: string; value: string; strength: number;
  tone: 'positive' | 'negative' | 'neutral'; detail: string;
};
export type PredictionDetail = {
  summary: {
    id: string; fixtureId: string; sport: Sport;
    winProbability: { home: number; draw: number | null; away: number } | null;
    expectedScore: { home: number; away: number; total: number; unit: 'goals' | 'points' } | null;
    confidence: number | null; availability: 'ready' | 'insufficient_data';
    modelVersion: string; generatedAt: string; dataCutoffAt: string; isStale: boolean;
  };
  analysis: {
    method: string; sampleSize: number; participantSampleSize: { home: number; away: number };
    projectedMargin: number | null; topScoreline: { home: number; away: number } | null;
    scoreMatrix: Cell[]; markets: Market[]; factors: Factor[];
    warnings: string[]; featuresUsed: string[]; caveat: string;
  };
};
