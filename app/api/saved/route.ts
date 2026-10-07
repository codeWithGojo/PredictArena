import { verifiedAccount, accountResponse } from "@/lib/account-request";
export const dynamic = "force-dynamic";
export async function GET() {
 const a = await verifiedAccount(); if (!a) return accountResponse({ error: "Please sign in." }, 401);
 const { data, error } = await a.db.from("saved_predictions").select("fixture_id,created_at,prediction_archive(*,fixture_results(home_score,away_score,observed_at))").eq("user_id", a.user.id).order("created_at", { ascending: false }).limit(100);
 return error ? accountResponse({ error: "Could not load saved forecasts." }, 503) : accountResponse({ saved: data });
}
export async function POST(request: Request) {
 const a = await verifiedAccount(); if (!a) return accountResponse({ error: "Please sign in." }, 401);
 const body = await request.json().catch(() => null); if (typeof body?.fixtureId !== "string" || body.fixtureId.length > 200) return accountResponse({ error: "Invalid fixture." }, 400);
 const { error } = await a.db.from("saved_predictions").upsert({ user_id: a.user.id, fixture_id: body.fixtureId }, { ignoreDuplicates: true });
 return error ? accountResponse({ error: "This forecast is not available in the archive yet." }, 409) : accountResponse({ saved: true });
}
export async function DELETE(request: Request) {
 const a = await verifiedAccount(); if (!a) return accountResponse({ error: "Please sign in." }, 401);
 const id = new URL(request.url).searchParams.get("fixtureId"); if (!id || id.length > 200) return accountResponse({ error: "Invalid fixture." }, 400);
 const { error } = await a.db.from("saved_predictions").delete().eq("user_id", a.user.id).eq("fixture_id", id);
 return error ? accountResponse({ error: "Could not remove this forecast." }, 503) : accountResponse({ saved: false });
}
