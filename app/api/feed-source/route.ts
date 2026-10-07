import { timingSafeEqual } from "node:crypto";
import { buildSourceFeed } from "@/lib/feed-source";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET(request: Request) {
 const secret = process.env.ARCHIVE_REFRESH_SECRET;
 const provided = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
 if (!secret || Buffer.byteLength(provided) !== Buffer.byteLength(secret) || !timingSafeEqual(Buffer.from(provided), Buffer.from(secret))) return Response.json({ error: "Unauthorized" }, { status: 401 });
 return Response.json(await buildSourceFeed(), { headers: { "Cache-Control": "no-store" } });
}
