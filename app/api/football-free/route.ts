import { buildFootballPayload, FOOTBALL_CACHE_SECONDS } from "../../../lib/api-football";

export const dynamic = "force-dynamic";

export async function GET() {
  const payload = await buildFootballPayload();
  return Response.json(payload, {
    headers: {
      "Cache-Control": `public, max-age=300, s-maxage=${FOOTBALL_CACHE_SECONDS}, stale-while-revalidate=86400`,
    },
  });
}
