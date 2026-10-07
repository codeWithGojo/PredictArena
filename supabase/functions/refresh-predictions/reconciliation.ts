export type FixtureIdentity = { fixture_id: string; league_id: string; home: string; away: string; kickoff_at: string };
export const fixtureKey = (fixture: FixtureIdentity) => JSON.stringify([fixture.league_id, fixture.home, fixture.away, Date.parse(fixture.kickoff_at)]);
export function archiveResolver(archived: FixtureIdentity[]) {
 const byKey = new Map(archived.map(a => [fixtureKey(a), a.fixture_id]));
 const byId = new Map(archived.map(a => [a.fixture_id, a]));
 return (fixture: FixtureIdentity) => {
  const natural = byKey.get(fixtureKey(fixture));
  if (natural) return natural;
  const original = byId.get(fixture.fixture_id);
  // A provider may move kickoff without changing its fixture ID. Keep the
  // first forecast and reconcile that fixture; never rewrite its timestamp.
  return original && original.league_id === fixture.league_id && original.home === fixture.home && original.away === fixture.away ? original.fixture_id : undefined;
 };
}
export function newForecasts<T extends FixtureIdentity>(candidates: T[], archived: FixtureIdentity[]) {
 const ids = new Set(archived.map(a => a.fixture_id));
 const keys = new Set(archived.map(fixtureKey));
 return candidates.filter(candidate => {
  const key = fixtureKey(candidate);
  if (ids.has(candidate.fixture_id) || keys.has(key)) return false;
  ids.add(candidate.fixture_id); keys.add(key); return true;
 });
}
