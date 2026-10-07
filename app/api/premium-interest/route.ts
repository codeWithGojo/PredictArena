import { verifiedAccount, accountResponse } from "@/lib/account-request";
export const dynamic = "force-dynamic";
export async function GET() {
 const a = await verifiedAccount(); if (!a) return accountResponse({ error: "Please sign in." }, 401);
 const { data, error } = await a.db.from("premium_interest").select("created_at").eq("user_id", a.user.id).maybeSingle();
 return error ? accountResponse({ error: "Could not check early access." }, 503) : accountResponse({ joined: !!data });
}
export async function POST() {
 const a = await verifiedAccount(); if (!a) return accountResponse({ error: "Please sign in." }, 401);
 const { error } = await a.db.from("premium_interest").upsert({ user_id: a.user.id }, { ignoreDuplicates: true });
 return error ? accountResponse({ error: "Could not join early access." }, 503) : accountResponse({ joined: true });
}
export async function DELETE() {
 const a = await verifiedAccount(); if (!a) return accountResponse({ error: "Please sign in." }, 401);
 const { error } = await a.db.from("premium_interest").delete().eq("user_id", a.user.id);
 return error ? accountResponse({ error: "Could not leave early access." }, 503) : accountResponse({ joined: false });
}
