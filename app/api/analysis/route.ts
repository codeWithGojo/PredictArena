import { verifiedAccount, accountResponse } from "@/lib/account-request";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
 const a = await verifiedAccount(); if (!a) return accountResponse({ error: "Please sign in." }, 401);
 const id = new URL(request.url).searchParams.get("fixtureId"); if (!id || id.length > 200) return accountResponse({ error: "Invalid fixture." }, 400);
 // RLS checks current paid-through entitlement, revocation and ownership.
 const { data, error } = await a.db.from("premium_match_analysis").select("analysis").eq("fixture_id", id).maybeSingle();
 return error ? accountResponse({ error: "Analysis is temporarily unavailable." }, 503) : !data ? accountResponse({ error: "Premium analysis is unavailable for this account or fixture." }, 403) : accountResponse(data.analysis);
}
