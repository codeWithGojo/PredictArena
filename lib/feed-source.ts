import { GET as getLegacyPayload } from "@/lib/legacy-feed";
import { buildFootballPayload } from "@/lib/api-football";
import type { Match } from "@/lib/sports";
import screenshotBatch from "@/data/sportybet-screenshots-2026-10-07.json";
import { applyBookmakerFeed } from "@/lib/bookmaker-inputs";
export async function buildSourceFeed() {
 const [legacyResponse, football] = await Promise.all([getLegacyPayload(), buildFootballPayload()]);
 const base = await legacyResponse.json();
 const other: Match[] = (base.matches ?? []).filter((m: Match) => ["basketball", "tennis"].includes(m.sport));
 const { completed, ...publicFootball } = football;
 return { completed, feed: applyBookmakerFeed({ ...base, ...publicFootball, matches: [...football.matches, ...other].sort((a,b) => Date.parse(a.kickoffISO) - Date.parse(b.kickoffISO)), leagueCatalog: [...football.leagueCatalog, ...(base.leagueCatalog ?? []).filter((l: { sport: string }) => ["basketball", "tennis"].includes(l.sport))], generatedAt: new Date().toISOString(), provider: "PredictArena scheduled feeds", communityCount: 0, status: football.leagueCatalog.some(l => l.available) ? "live" : "fallback" }, screenshotBatch) };
}
