import { publicDatabase } from "@/lib/supabase/public";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
 const params = new URL(request.url).searchParams; const league = params.get("league") || null;
 const page = Math.min(10000, Math.max(0, Math.floor(Number(params.get("page")) || 0)));
 const db = publicDatabase(); if (!db) return Response.json({ error: "Prediction history is unavailable." }, { status: 503 });
 let query = db.from("prediction_archive").select("*,fixture_results(home_score,away_score,observed_at)", { count: "exact" }).order("kickoff_at", { ascending: false }).range(page * 30, page * 30 + 29); if (league) query = query.eq("league_id", league);
 const [rows, metrics] = await Promise.all([query, db.rpc("prediction_performance", { p_league: league })]);
 if (rows.error || metrics.error) return Response.json({ error: "Prediction history is temporarily unavailable." }, { status: 503 });
 return Response.json({ forecasts: rows.data, total: rows.count, performance: metrics.data }, { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" } });
}
