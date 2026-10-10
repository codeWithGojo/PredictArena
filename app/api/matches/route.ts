import { publicDatabase } from "@/lib/supabase/public";
import screenshotBatch from "@/data/sportybet-screenshots-2026-10-07.json";
import { applyBookmakerFeed } from "@/lib/bookmaker-inputs";
import { publicPreviewResponse } from "@/lib/public-preview";
export const dynamic = "force-dynamic";
export async function GET() {
 const db = publicDatabase(); if (!db) return await publicPreviewResponse("matches") ?? Response.json({ error: "The fixture feed is being configured." }, { status: 503 });
 const { data, error } = await db.from("feed_snapshots").select("payload,fetched_at").eq("id", "current").single();
 if (error || !data) return Response.json({ error: "The fixture feed is waiting for its first refresh." }, { status: 503 });
 const ageSeconds = Math.max(0, Math.floor((Date.now() - Date.parse(data.fetched_at)) / 1000));
 return Response.json({ ...applyBookmakerFeed(data.payload, screenshotBatch), generatedAt: data.fetched_at, freshness: { fetchedAt: data.fetched_at, ageSeconds, stale: ageSeconds > 3600, refreshMinutes: 15 } }, { headers: { "Cache-Control": "public, max-age=30, s-maxage=60, stale-while-revalidate=120" } });
}
