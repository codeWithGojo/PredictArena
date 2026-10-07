import { serverAuth } from "@/lib/supabase/server";
export async function verifiedAccount() { const db = await serverAuth(); if (!db) return null; const { data: { user }, error } = await db.auth.getUser(); return !error && user?.email_confirmed_at ? { db, user } : null; }
export function accountResponse(data: unknown, status = 200) { return Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } }); }
