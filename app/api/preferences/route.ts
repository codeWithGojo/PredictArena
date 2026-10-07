import { verifiedAccount, accountResponse } from "@/lib/account-request";
export const dynamic = "force-dynamic";
export async function GET() {
 const a = await verifiedAccount(); if (!a) return accountResponse({ error: "Please sign in." }, 401);
 const { data, error } = await a.db.from("account_preferences").select("leagues,teams").eq("user_id", a.user.id).maybeSingle();
 return error ? accountResponse({ error: "Could not load preferences." }, 503) : accountResponse({ preferences: data ?? null });
}
export async function PUT(request: Request) {
 const a = await verifiedAccount(); if (!a) return accountResponse({ error: "Please sign in." }, 401);
 const b = await request.json().catch(() => null); const valid = (v: unknown): v is string[] => Array.isArray(v) && v.length <= 30 && v.every(x => typeof x === "string" && x.length > 0 && x.length <= 100);
 if (b?.accountId !== a.user.id || !valid(b?.leagues) || !valid(b?.teams)) return accountResponse({ error: "Invalid preferences." }, 400);
 const { error } = await a.db.from("account_preferences").upsert({ user_id: a.user.id, leagues: [...new Set(b.leagues)], teams: [...new Set(b.teams)] });
 return error ? accountResponse({ error: "Could not save preferences." }, 503) : accountResponse({ saved: true });
}
