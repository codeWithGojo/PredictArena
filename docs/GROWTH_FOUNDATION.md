# PredictArena growth foundation

This release adds a public publication record and free account retention features. Browser requests read a shared durable feed instead of rebuilding provider data for every visitor. The existing Vercel app and Supabase project remain the production services.

## Release status

Released on 7 October 2026 at [predictarena-woad.vercel.app](https://predictarena-woad.vercel.app). The tested source was uploaded to `codeWithGojo/PredictArena`; the deployed application commit is `96e6e891d67a57bcc08e6cdfaef7cb23df22018d`. Its Git tree exactly matches the locally tested source.

The database migrations `20261006205800_growth_foundation.sql`, `20261007043921_archive_integrity.sql`, and `20261007045638_refresh_extensions.sql` are applied to the existing Supabase project. Refresh worker version 2 is deployed. The matching job token is configured as the production Vercel sensitive environment variable `ARCHIVE_REFRESH_SECRET` and Supabase Vault secret `predictarena_archive_refresh`.

The first authenticated refresh returned HTTP 200, loaded 273 matches, and archived 270 eligible football forecasts. A repeat refresh returned HTTP 200 with zero new candidates, preserving every original publication timestamp. All eight competition feeds were available at verification, and public payloads contained zero Premium factor rows. The named cron job `predictarena-feed-refresh` is active on `*/15 * * * *`. Its first scheduled run had not yet occurred when rollout was checked; both manual invocations completed successfully.

There are no settled results yet; metrics will populate as actual final scores arrive. Paid subscriptions remain closed. Premium early access only records interest.

## Product behavior

- `/performance` shows every first-published eligible football 1X2 forecast, the final 90-minute outcome, and all-record win rate, Brier score, log loss, and calibration. League filtering changes both the rows and metrics. Pagination changes rows only. The historical bookmaker benchmark stays separate.
- Publication uses database time and must precede kickoff. Forecasts cannot be rewritten or deleted. No historical forecast reconstruction is used. Only provider-backed football with at least 10 historical matches and valid probabilities enters the archive; manual entries are excluded.
- `/tracker` saves the first published forecast to a verified account. Results update against that original record. It shows the 100 most recently saved forecasts. Device-saved slips remain separate.
- Favourite leagues and teams filter the “For you” feed. Guests use device storage; signed-in users can sync account preferences. Calendar downloads include a 30-minute reminder; they are not push notifications.
- `/premium` offers early access at a proposed ₦3,000/month. Joining never charges or grants access. Detailed factors require a current server-verified entitlement and database RLS. Public results remain free.

## Feed pipeline

The worker authenticates against the Vault token, fetches the fixed production `/api/feed-source`, inserts only new eligible forecasts, reconciles confirmed final scores, stores protected model details, strips those details from the public payload, and publishes `feed_snapshots.current`.

Provider ID changes with the same league, teams, and kickoff resolve to the original archived fixture. A reschedule with the same provider ID also keeps the original forecast and publication time. Ambiguous team or identity changes are not inferred. Retries cannot overwrite forecasts. Reconciliation reads recent records in pages with a hard 10,000-record limit and explicitly fetches older stable IDs for long delays.

A failed league retains its previous upcoming fixtures. If every football provider fails, the worker returns 503 and preserves the previous feed. The UI warns about degraded competitions and snapshots older than one hour. Public feed responses use CDN caching; account responses use `private, no-store`. Premium factors are fetched through a protected route, not embedded in the public feed.

Football upstream requests cache for five minutes. The initial cron cadence is 15 minutes; basketball and tennis retain their existing six-hour upstream cache. Confirm provider quota before increasing refresh frequency. The worker performs a single shared refresh rather than one refresh per visitor.

## Approved rollout

1. Push `feat/growth-foundation` to `codeWithGojo/PredictArena` and review the change. Deploy the approved commit to the existing Vercel project. Confirm the production job secret and public Supabase configuration are present; do not expose or commit secrets.
2. Deploy the latest `supabase/functions/refresh-predictions` files, including `reconciliation.ts` and `archive.ts`. Keep `verify_jwt = false` only because the body token is validated against Vault using a service-only RPC. Verify malformed or wrong tokens return 401.
3. Enable refresh extensions by applying `supabase/operations/enable-refresh-extensions.sql` as an administrator migration. Invoke `refresh-once.sql` through an administrator database session after the production source endpoint is available.
4. Inspect the worker logs, the request status in `net._http_response`, and the snapshot. An enqueued `request_id` or successful cron run does not prove an HTTP 200. Confirm a current snapshot and real eligible fixtures before enabling the schedule. There may be a short empty-feed interval while the first snapshot is seeded.
5. Run `schedule-refresh.sql` only after successful initialization. The script refuses to schedule without a snapshot from the last five minutes. Verify the named job `predictarena-feed-refresh` and the next successful worker run. Do not print cron request bodies or Vault values.
6. Verify production on mobile and desktop: public record, following filters, confirmed-account save/remove, cross-device preferences, calendar download, and Premium interest join/leave. Test free, paid, expired, and revoked analysis access. Verify the first timed cron run after activation; authenticated cross-device browser checks remain outstanding.

The cron implementation follows [Supabase scheduling guidance](https://supabase.com/docs/guides/functions/schedule-functions). To pause the schedule without losing data, run `select cron.unschedule('predictarena-feed-refresh');`. For a frontend rollback, pause refresh first and restore the prior Vercel deployment. Preserve the append-only archive and user records.

## Validation

- `node --test tests/*.test.ts`: 22 tests pass, including forecast eligibility, probability scoring, calendar escaping, cup regular-time outcomes, provider mapping, fixture retries/reschedules, and existing models/slips.
- `npm run lint`, `npx tsc --noEmit`, and `npm run build`: pass.
- `supabase/tests/growth-verification.sql`: passed on the real database inside a rollback transaction. Covers database publication timestamps, immutability, invalid or late forecasts, all-outcome statistics, anonymous restrictions, user isolation, and paid/revoked entitlements. No synthetic records were left in production.
- Production-build browser checks: Results, Premium, Saved, and account modal render without page errors. At 320px, 390px, and 1280px, controlled browser-only fixture data verified following, device persistence, reminder download, the save sign-in gate, and layout without horizontal overflow. These mocks were never written to the database. Real unauthenticated account, analysis, and source endpoints return 401. The live public results API returns all 270 archived forecasts with pending results and null accuracy metrics. Live account, analysis, and source endpoints reject unauthenticated requests with 401.

Live Vercel build and production HTTP checks passed, with no error/fatal runtime logs in the release window. A successful authenticated browser session, first timed cron invocation, and real refresh-to-settlement cycle remain follow-up checks. Billing needs provider credentials and a separately implemented verified payment/webhook flow; early access is not a billing substitute.

Existing platform advisory: Supabase Auth leaked-password protection is disabled. This setting was already present before the release; see [Supabase password security guidance](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
