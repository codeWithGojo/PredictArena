# PredictArena accounts

The live frontend uses Supabase Auth with email confirmation and cookie-backed sessions through `@supabase/ssr`. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` for the dedicated PredictArena project on Vercel. Add `https://predictarena-woad.vercel.app` as the site URL and `https://predictarena-woad.vercel.app/auth/callback` as an allowed redirect URL in Supabase Auth. Apply the migration under `supabase/migrations/` before enabling the UI. Password login and signup are disabled with a clear message until the environment is configured.

`GET /api/account` verifies the current user with Supabase Auth, then reads the caller's entitlement under RLS and returns a private, uncached plan. Entitlement rows are created free by a private database trigger. Authenticated users have SELECT permission only on their own row, never INSERT or UPDATE. No public route can grant Premium.

After the owner has signed up and confirmed their email, a database operator can grant owner access in the Supabase SQL Editor, using the exact verified email:

```sql
update public.account_entitlements as a
set owner_access = true
from auth.users as u
where a.user_id = u.id
  and lower(u.email) = lower('OWNER_EMAIL_HERE')
  and u.email_confirmed_at is not null
returning a.user_id, a.owner_access;
```

Confirm exactly one returned row. To revoke, set `owner_access = false` for that `user_id`, or set `entitlement_revoked = true`. The account API checks the database afresh; tokens contain no premium claim. Use the SQL Editor only with operator permissions, never put privileged keys in the browser or Vercel public variables.

The earlier Cognito and AWS implementation remains in `infra/` for possible future migration. It has not been deployed. The slips and tracker pages are still placeholders, and the match feed currently includes model factors in public JSON; the current interface gate is not a secure paywall for those factors. Move premium data behind server authorization before selling access.
