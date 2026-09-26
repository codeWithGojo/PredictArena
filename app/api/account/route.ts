import { serverAuth } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const client = await serverAuth();
  if (!client) return Response.json({ error: "Accounts are not configured yet." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  const { data: { user }, error: authError } = await client.auth.getUser();
  if (authError || !user || !user.email_confirmed_at) return Response.json({ error: "Please sign in with a verified email." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const { data, error } = await client.from("account_entitlements")
    .select("owner_access,entitlement_revoked,plan,premium_until")
    .eq("user_id", user.id).single();
  if (error || !data) return Response.json({ error: "Account access is temporarily unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  const premium = !data.entitlement_revoked && (data.owner_access ||
    (data.plan === "premium" && data.premium_until && Date.parse(data.premium_until) > Date.now()));
  return Response.json({ data: { id: user.id, email: user.email, displayName: user.email?.split("@")[0] ?? "Member", plan: premium ? "premium" : "free" } }, { headers: { "Cache-Control": "private, no-store" } });
}
