import { GET as getFeed } from "../matches/route";
export const dynamic = "force-dynamic";
export async function GET() { const response = await getFeed(); if (!response.ok) return response; const data = await response.json(); return Response.json({ ...data, matches: data.matches.filter((m: {sport: string}) => m.sport === "football"), leagueCatalog: data.leagueCatalog.filter((l: {sport: string}) => l.sport === "football") }, { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" } }); }
