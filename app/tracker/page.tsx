"use client";
import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useResource } from "@/hooks/use-resource";
import { PageHeader } from "@/components/growth/page-header";
import { resultOutcome, type ArchivedForecast } from "@/lib/archive";
export default function TrackerPage() {
 const { user,loading: accountLoading,signIn,signUp } = useAuth();
 const { data,error,loading,reload } = useResource<{ saved: { fixture_id: string; prediction_archive: ArchivedForecast }[] }>(user ? `/api/saved?account=${user.id}` : null);
 const [busy,setBusy] = useState(""), [notice,setNotice] = useState(""); const saved = data?.saved ?? [];
 const finished = saved.filter(s => s.prediction_archive.fixture_results);
 const correct = finished.filter(({prediction_archive:a}) => a.strongest_outcome === resultOutcome(a.fixture_results!.home_score,a.fixture_results!.away_score)).length;
 async function remove(id: string) { setBusy(id); try { const r = await fetch(`/api/saved?fixtureId=${encodeURIComponent(id)}`, { method:"DELETE" }); if (!r.ok) throw new Error("Could not remove this forecast."); reload(); setNotice("Forecast removed."); } catch(e) { setNotice(e instanceof Error ? e.message : "Could not update saved forecasts."); } finally { setBusy(""); } }
 return <div className="growth-page"><PageHeader/><main className="growth-main"><div className="growth-title"><div><span className="eyebrow">Your account · Free</span><h1>Saved forecasts</h1><p>Keep the matches you followed together and see how the first published forecast turned out.</p></div><Link className="growth-link" href="/">Find a match</Link></div>
 {accountLoading || loading ? <div className="growth-loading" role="status">Loading saved forecasts…</div> : !user ? <div className="growth-empty"><h2>Keep your forecasts together</h2><p>Sign in to save forecasts across devices. Your saved list is private.</p><div className="growth-actions"><button onClick={() => void signIn()}>Sign in</button><button onClick={() => void signUp()}>Create free account</button></div></div> : error ? <div className="growth-empty" role="alert"><p>{error}</p><button onClick={reload}>Try again</button></div> : <>
  {notice && <p role="status" className="growth-note">{notice}</p>}<div className="record-stats"><div><span>Saved</span><strong>{saved.length}</strong><small>Latest 100 saved forecasts</small></div><div><span>Final results</span><strong>{finished.length}</strong></div><div><span>Strongest outcome correct</span><strong>{finished.length ? `${(correct/finished.length*100).toFixed(1)}%` : "—"}</strong><small>{correct} / {finished.length} settled</small></div></div>
  {!saved.length ? <div className="growth-empty"><h2>No saved forecasts yet</h2><p>Open a football match and choose “Save forecast”. Only forecasts already in the public archive can be saved.</p><Link href="/">Browse predictions</Link></div> : <div className="saved-list">{saved.map(({fixture_id,prediction_archive:a}) => <article className="saved-row" key={fixture_id}><div><small>{a.league} · {new Date(a.kickoff_at).toLocaleString("en-NG",{timeZone:"Africa/Lagos",dateStyle:"medium",timeStyle:"short"})} WAT</small><h2>{a.home} vs {a.away}</h2><p>Home {a.probabilities[0]}% · Draw {a.probabilities[1]}% · Away {a.probabilities[2]}%</p></div><div>{a.fixture_results ? <span className={`result-tag ${a.strongest_outcome === resultOutcome(a.fixture_results.home_score,a.fixture_results.away_score) ? "correct" : "missed"}`}>{a.fixture_results.home_score}–{a.fixture_results.away_score} · {a.strongest_outcome === resultOutcome(a.fixture_results.home_score,a.fixture_results.away_score) ? "Correct" : "Missed"}</span> : <span className="result-tag pending">Awaiting final result</span>}<button disabled={busy === fixture_id} onClick={() => void remove(fixture_id)} aria-label={`Remove saved forecast for ${a.home} vs ${a.away}`}>{busy === fixture_id ? "Removing…" : "Remove"}</button></div></article>)}</div>}
  <p className="growth-note">This tracks saved forecasts, not bets or money. Your saved list is a personal sample; use the public record to judge overall performance.</p>
 </>}
 </main></div>;
}
