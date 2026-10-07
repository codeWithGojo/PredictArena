import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import { forecastEligible, forecastOutcome } from "./archive.ts";
import { archiveResolver, newForecasts, type FixtureIdentity } from "./reconciliation.ts";
type Match = { id: string; sport: string; source: string; leagueId: string; league: string; home: { name: string }; away: { name: string }; kickoffISO: string; probabilities: number[]; confidence: number; model: { sampleSize: number; version: string; factors?: unknown[]; scoreMatrix?: unknown[]; caveat?: string } };
type Final = { fixtureId: string; leagueId: string; home: string; away: string; kickoffISO: string; homeScore: number; awayScore: number };
type League = { id: string; sport: string; available: boolean; sourceCheckedAt?: string | null };
type Feed = { matches: Match[]; leagueCatalog: League[]; [key: string]: unknown };
const matchIdentity = (m: Match): FixtureIdentity => ({ fixture_id: m.id, league_id: m.leagueId, home: m.home.name, away: m.away.name, kickoff_at: m.kickoffISO });
const finalIdentity = (r: Final): FixtureIdentity => ({ fixture_id: r.fixtureId, league_id: r.leagueId, home: r.home, away: r.away, kickoff_at: r.kickoffISO });
Deno.serve(async request => {
 if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });
 const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
 try {
  const body = await request.json(); const token = typeof body.token === "string" ? body.token : "";
  if (!/^[a-f0-9]{64}$/.test(token)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const verified = await db.rpc("verify_archive_token", { p_token: token });
  if (verified.error || verified.data !== true) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const sourceResponse = await fetch("https://predictarena-woad.vercel.app/api/feed-source", { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(55000) });
  if (!sourceResponse.ok) throw new Error(`Source HTTP ${sourceResponse.status}`);
  const source = await sourceResponse.json() as { feed: Feed; completed: Final[] };
  if (!Array.isArray(source.feed?.matches) || !Array.isArray(source.completed)) throw new Error("Invalid source feed");
  const checkedAt = new Date().toISOString();
  const previous = await db.from("feed_snapshots").select("payload").eq("id", "current").maybeSingle(); if (previous.error) throw previous.error;
  const old = previous.data?.payload as Feed | undefined;
  const failed = new Set(source.feed.leagueCatalog.filter(l => !l.available).map(l => l.id));
  if (!source.feed.leagueCatalog.some(l => l.sport === "football" && l.available)) throw new Error("All football providers failed; retaining previous feed");
  const matches = [...source.feed.matches, ...(old?.matches ?? []).filter(m => failed.has(m.leagueId) && Date.parse(m.kickoffISO) > Date.now())];
  source.feed.leagueCatalog = source.feed.leagueCatalog.map(l => ({ ...l, sourceCheckedAt: l.available ? checkedAt : old?.leagueCatalog.find(o => o.id === l.id)?.sourceCheckedAt ?? null }));
  const archived: FixtureIdentity[] = [];
  for (let page = 0; page < 20; page++) {
   const r = await db.from("prediction_archive").select("fixture_id,league_id,home,away,kickoff_at").gte("kickoff_at", new Date(Date.now() - 70 * 86400000).toISOString()).order("fixture_id").range(page * 500, page * 500 + 499);
   if (r.error) throw r.error; archived.push(...r.data); if (r.data.length < 500) break; if (page === 19) throw new Error("Reconciliation limit reached");
  }
  // Also retrieve stable IDs outside the recent window, such as long delays.
  const knownIds = new Set(archived.map(a => a.fixture_id));
  const missingIds = [...new Set([...source.feed.matches.map(m => m.id), ...source.completed.map(r => r.fixtureId)])].filter(id => !knownIds.has(id));
  for (let offset = 0; offset < missingIds.length; offset += 200) {
   const r = await db.from("prediction_archive").select("fixture_id,league_id,home,away,kickoff_at").in("fixture_id", missingIds.slice(offset, offset + 200));
   if (r.error) throw r.error; archived.push(...r.data);
  }
  const candidates = source.feed.matches.filter(m => forecastEligible(m, Date.now() + 60000)).map(m => ({ ...matchIdentity(m), league: m.league, model_version: m.model.version, probabilities: m.probabilities, confidence: m.confidence, strongest_outcome: forecastOutcome(m.probabilities) }));
  const rows = newForecasts(candidates, archived);
  // Publication time comes from the database; retries never rewrite forecasts.
  if (rows.length) { const r = await db.from("prediction_archive").upsert(rows, { onConflict: "fixture_id", ignoreDuplicates: true }); if (r.error) throw r.error; archived.push(...rows); }
  const resolve = archiveResolver(archived);
  const results = source.completed.flatMap(r => {
   const id = resolve(finalIdentity(r));
   if (!id || !Number.isFinite(Date.parse(r.kickoffISO)) || Date.parse(r.kickoffISO) >= Date.now() || !Number.isInteger(r.homeScore) || !Number.isInteger(r.awayScore) || r.homeScore < 0 || r.awayScore < 0) return [];
   return [{ fixture_id: id, home_score: r.homeScore, away_score: r.awayScore }];
  });
  if (results.length) { const r = await db.from("fixture_results").upsert(results, { onConflict: "fixture_id", ignoreDuplicates: true }); if (r.error) throw r.error; }
  // Never overwrite retained Premium detail with stripped public fallback data.
  const analyses = source.feed.matches.map(m => ({ fixture_id: m.id, analysis: { factors: m.model.factors ?? [], caveat: m.model.caveat }, updated_at: checkedAt }));
  if (analyses.length) { const r = await db.from("premium_match_analysis").upsert(analyses); if (r.error) throw r.error; }
  source.feed.matches = matches.map(m => ({ ...m, archiveId: resolve(matchIdentity(m)), model: { ...m.model, factors: [], scoreMatrix: undefined } }));
  const cache = await db.from("feed_snapshots").upsert({ id: "current", fetched_at: checkedAt, payload: source.feed }); if (cache.error) throw cache.error;
  const summary = { status: "ok", matches: matches.length, candidates: rows.length, results: results.length, degradedLeagues: failed.size };
  console.log(JSON.stringify(summary)); return Response.json(summary);
 } catch(e) { console.error(e instanceof Error ? e.message : "Refresh failed"); return Response.json({ error: "Refresh failed; previous feed retained." }, { status: 503 }); }
});
