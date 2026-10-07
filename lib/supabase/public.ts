import { createClient } from "@supabase/supabase-js";
// Public cacheable reads never receive an account's cookies or session.
export function publicDatabase() { const url = process.env.NEXT_PUBLIC_SUPABASE_URL; const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY; return url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null; }
