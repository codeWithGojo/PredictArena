# PredictArena API contract v1

Status: implementation contract, not a claim that AWS features exist. Inspected `codeWithGojo/PredictArena` main at `bb18ff4c35fabba335763b127de6450a1b2f45e2` on 2026-09-19. Only this document is changed in this session.

## 1. Existing implementation and scope

| Evidence | Current behavior |
| --- | --- |
| `package.json`, `app/page.tsx`, `app/layout.tsx`, `app/globals.css` | Next.js 16.2.6, React 19.2.6, TypeScript. One client dashboard contains filters, search, prediction cards, model modal and Knowledge Test. It fetches `/api/matches`. |
| `app/api/matches/route.ts`, `lib/api-football.ts` | Combines a replacement API-Football feed with non-football results from `matches-v2`. Football uses a date-derived season, 60 days of history, 30 days ahead, six upcoming fixtures per league and six-hour caching. |
| `app/api/matches-v2/route.ts`, `app/api/football-free/route.ts` | Legacy combined feed also fetches football, plus TheSportsDB NBA/ATP and synthetic community fixtures. The football-free route exposes the shared football loader. These are not AWS endpoints. |
| `lib/sports.ts` | `runFootballPoisson`: attack/defence rates, four-game shrinkage, home/away league baselines, score grid through 8-8; outcomes, totals, BTTS and double chance. `runBasketballMarginModel`: logistic conversion of scoring margin with +3.1 home advantage. `runTennisFormModel`: logistic comparison of smoothed win rates with five-match priors. Confidence is heuristic, not calibrated accuracy. |
| `lib/question-engine.ts`, `app/page.tsx` | Deterministic quizzes and device-local leaderboard. No accounts, persistent slips, bet tracker, standings, Paystack, AWS infrastructure or test suite exists. |

Current code still contains CODM and EA FC in types, feeds, quizzes, navigation and metadata. Remove them in the implementing tracks, not here. Europa League is new. Keep NBA and ATP singles as the initial basketball/tennis coverage; other competitions require a contract extension. Existing historical events lack timestamps, injuries and health inputs; the new ingest contract must supply timestamps before publishing auditable predictions. Existing percentage arrays and formatted market strings are not the new wire schema.

Target: Vercel frontend; AWS HTTP API Gateway, Lambda, DynamoDB and Cognito; Terraform and GitHub Actions OIDC deployment. No wagering, wallets, payouts or bookmaker execution. Bets are private manual records of wagers placed elsewhere. Quiz remains client-only with the three allowed sports.

## 2. Exclusive repository ownership

Ownership is recursive except the explicit exceptions below. All paths not in a track's row are off limits to that track, including other tracks' configuration and tests. Reading/importing another track's published interfaces is allowed; editing them is not. New paths outside this map require a docs-and-tests ownership amendment before work starts. No shared writable folder or root manifest.

| Track | Owned folders | Owned existing or reserved individual files | Explicit boundaries |
| --- | --- | --- | --- |
| frontend | `app/` EXCEPT `app/api/`; `public/`; `components/`; `hooks/`; `lib/client/`; `lib/ui/` | `lib/question-engine.ts`, `package.json`, `package-lock.json`, `next.config.ts`, `next-env.d.ts`, `tsconfig.json`, `eslint.config.mjs`, `postcss.config.mjs`, `.vercelignore`, `vercel.json` | No edits in `app/api/`, model/provider files, `services/`, `infra/`, `.github/`, `contracts/`, `docs/` or `tests/`. Owns browser API adapter, auth UX and removal of esports UI/quiz content. |
| data-and-model | `app/api/`; `services/data-and-model/` | `lib/sports.ts`, `lib/api-football.ts` | Owns legacy routes until removal, provider adapters, ingestion, fixture/competition/standings handlers, prediction engine and prediction handlers. No other `app/` or `lib/` paths; no infrastructure, identity, billing, user-data handlers, contracts or tests. |
| infra-and-auth | `infra/`; `.github/`; `services/infra-and-auth/` | `.env.example`, `.gitignore` | Owns Terraform, IAM, Cognito, shared backend auth/error/idempotency helpers, profile/slip/bet handlers, billing/webhook handlers, reconciliation and deploy workflows. No frontend, model, provider, docs, contracts or test edits. |
| docs-and-tests | `docs/`; `contracts/`; `tests/` | `README.md`, `AGENTS.md` | Owns this contract, future OpenAPI/JSON schemas, all unit/integration/model/security/E2E tests and mocks. No application, Terraform, workflow or root package/config edits. |

Each service track owns its manifest, lockfile, build config and scripts inside its own `services/<track>/` folder. Tests have their own toolchain in `tests/`; do not add colocated tests in another track's folder. `.github/` executes those published commands but stays infra-owned. Frontend must exclude `services/`, `infra/` and `tests/` from its root TypeScript build before backend code lands. `contracts/` contains wire schemas only, not runtime logic. Backend service packages may consume infra-owned shared helpers read-only.

Migration gate: frontend first adds a client adapter for `/v1`; data-and-model ports models/providers into its service folder without changing their mathematics, then frontend stops importing `lib/sports.ts`. Keep legacy exports until that consumer migration merges. Before paid launch, data-and-model removes all three legacy Vercel API routes and provider credentials from Vercel; otherwise they bypass premium gating. No renames or moves across owners during parallel work. This document does not perform that migration.

## 3. Wire conventions and catalog

- Base URL: `https://<api-host>/v1`. Paths below are relative to `/v1`. JSON UTF-8; camelCase fields, lowercase kebab-case resource names, uppercase snake-case error codes. Unknown request fields/query parameters are `400 VALIDATION_ERROR`. GET and DELETE have no body.
- Times: UTC RFC 3339 with milliseconds and `Z`; dates: `YYYY-MM-DD`; ranges inclusive by UTC date. Frontend formats for `Africa/Lagos` by default. Probabilities and confidence: numbers in `[0,1]`, never percent strings. Scores can be fractional estimates; actual scores are integers. Money: integer minor units, NGN only in v1. Decimal odds are user-entered numbers greater than 1 and at most 1000.
- `sport` is exactly `football`, `basketball` or `tennis`. IDs are immutable opaque strings. New fixture IDs are `<sport>:<provider>:<providerEventId>`; missing provider IDs mean quarantine, never a synthetic fixture. Participants use the same namespaced scheme. User ID is Cognito `sub`; slip, bet and prediction IDs are server-generated ULIDs. Examples use abbreviated opaque IDs for readability, not real fixtures or prices.
- Single success: `{ "data": <resource>, "requestId": "req-1" }`. List success: `{ "data": [<resource>], "nextCursor": null, "requestId": "req-1" }`. JSON examples below are resource shapes; these envelopes are mandatory unless an endpoint states otherwise. All resource fields shown are required, including nullable fields; exceptions are explicitly marked optional.
- Lists accept `limit` (default 20, maximum 100) and optional opaque `cursor`. Cursor is base64url JSON containing version, query hash, current date partition and DynamoDB last key. Validate shape, query hash and key prefixes; derive user keys only from JWT, never from cursor. No snapshot-isolation promise. An empty page can have a non-null cursor; clients continue until null.
- Fixture/prediction lists require `sport` in query or path, accept `competitionId`, `from`, `to`, `status`. Defaults: UTC today through today+7, `status=scheduled`; maximum 31 dates. Status: `scheduled|live|finished|postponed|cancelled`. Ascending `startsAt`, then ID; un-timed fixtures are available by ID only. Predictions use their fixture's filters and omit fixtures without a published prediction. Slips/bets sort descending ULID; no status/date filters in v1.
- Private successes/errors use `Cache-Control: private, no-store`. Public reads may cache for 60 seconds. Never put premium bodies in public caches. Return an existing stale sports snapshot with `isStale=true`; initial ingest/provider failure without a snapshot returns `503 DATA_UNAVAILABLE`, not fabricated data. A successful empty provider result returns an empty list.
- POST `/slips`, `/bets`, `/billing/checkout` requires `Idempotency-Key` (UUID). Same user, method, path, key and canonical JSON body returns the original status/body for 24 hours; different body is `409 IDEMPOTENCY_CONFLICT`. Creation and response ledger writes must be atomic. An in-progress key returns `409 REQUEST_IN_PROGRESS` with `Retry-After: 2`. Check logical expiry even while DynamoDB TTL deletion is pending; unresolved billing operations retain their reference and cannot expire into a duplicate charge.
- PATCH and DELETE `/slips/{id}` and `/bets/{id}`, and PATCH `/me`, require `If-Match: "<version>"`; versions start at 1. Missing precondition is `428 PRECONDITION_REQUIRED`, stale version `412 VERSION_CONFLICT`. PATCH atomically increments version and returns the full resource with `ETag`. GET single and creation responses also return `ETag`. No cross-user resource access; absent and foreign IDs both return 404.

| competitionId | sport | Provider mapping |
| --- | --- | --- |
| `football:premier-league` | football | API-Football league 39 |
| `football:la-liga` | football | API-Football league 140 |
| `football:serie-a` | football | API-Football league 135 |
| `football:bundesliga` | football | API-Football league 78 |
| `football:ligue-1` | football | API-Football league 61 |
| `football:champions-league` | football | API-Football league 2 |
| `football:europa-league` | football | API-Football league 3, validate provider coverage during ingest |
| `basketball:nba` | basketball | TheSportsDB league 4387 |
| `tennis:atp` | tennis | TheSportsDB league 4464, singles only |

Provider IDs stay internal. Football/NBA `season` is starting year as a string, such as `2026`; ATP uses calendar year. Resolve active season from provider metadata, not a July date guess. Unsupported competitions/sports return `400 UNSUPPORTED_COMPETITION` or `400 UNSUPPORTED_SPORT`. No `all`, `codm` or `eafc` API sport.

## 4. Endpoint inventory and schemas

Auth labels: public = no Cognito JWT; logged in = valid Cognito access token; premium = logged in plus the entitlement check in section 6. Webhook is public only in the Cognito sense and always requires Paystack signature authentication. No public model-execution endpoint and no custom password endpoints; signup/login/reset/refresh/logout use Cognito.

### Sports reads

| Method and path | Auth | Request shape | Success shape/example |
| --- | --- | --- | --- |
| `GET /competitions` | public | Optional `sport`; no pagination (nine entries maximum) | 200 list of Competition, `nextCursor=null` |
| `GET /fixtures` | public | Required `sport`; common fixture filters and pagination | 200 list of Fixture |
| `GET /fixtures/{fixtureId}` | public | URL-encoded fixture ID | 200 Fixture |
| `GET /predictions/football` | logged in | Common fixture filters and pagination, no `sport` query | 200 list of football PredictionSummary |
| `GET /predictions/basketball` | logged in | Same | 200 list of basketball PredictionSummary |
| `GET /predictions/tennis` | logged in | Same | 200 list of tennis PredictionSummary |
| `GET /predictions/football/{fixtureId}` | premium | ID must belong to football | 200 PredictionDetail with football fields |
| `GET /predictions/basketball/{fixtureId}` | premium | ID must belong to basketball | 200 PredictionDetail with basketball fields |
| `GET /predictions/tennis/{fixtureId}` | premium | ID must belong to tennis | 200 PredictionDetail with tennis fields |
| `GET /standings/{sport}/{competitionId}` | public | Required `season`; optional `limit`, `cursor` | 200 list of StandingRow, with top-level `asOf` and `isStale` in addition to list envelope |

Wrong-sport fixture IDs return 404. Detail absent for a known fixture returns `404 PREDICTION_NOT_READY`; a prior archived pre-match prediction remains readable after kickoff. No retrospective prediction is created from the result. Standings for unavailable provider coverage return `503 DATA_UNAVAILABLE`; no synthetic rankings. In knockout stages only the published league/group standings are shown, not an invented knockout table.

Competition example (`availability=available|unavailable`, `standingsAvailable` is a separate capability):

```json
{"id":"football:premier-league","sport":"football","name":"Premier League","shortName":"PL","activeSeason":"2026","availability":"available","standingsAvailable":true,"updatedAt":"2026-09-19T10:00:00.000Z"}
```

Fixture example. `home`/`away` mean player one/two for tennis, not home advantage. Participant shape is `{id,name,shortName,badgeUrl}`; `badgeUrl`, `venue`, `startsAt`, `round` may be null. `score` is null before any score is reported; `regulation` is null when unavailable. Football model markets settle on regulation including stoppage time, excluding extra time/penalties. Basketball uses final score including overtime; tennis uses sets. `surface` is `hard|clay|grass|carpet|null`, `bestOf` is `3|5|null`, both null outside tennis.

```json
{"id":"football:api-football:123","sport":"football","competitionId":"football:premier-league","season":"2026","round":"Regular Season - 5","startsAt":"2026-09-20T15:00:00.000Z","status":"scheduled","home":{"id":"football:api-football:1","name":"Example Home","shortName":"HOM","badgeUrl":null},"away":{"id":"football:api-football:2","name":"Example Away","shortName":"AWY","badgeUrl":null},"venue":null,"surface":null,"bestOf":null,"score":null,"source":"api-football","updatedAt":"2026-09-19T10:00:00.000Z","isStale":false}
```

Non-null score shape example: `{"home":2,"away":1,"unit":"goals","regulation":{"home":1,"away":1}}`; unit is `goals|points|sets`. Provider adapters must distinguish in-play scores, final scores and regulation scores.

PredictionSummary examples for the three list routes. `winProbability.draw` is a number for football and null otherwise; non-null outcomes sum to 1 within `0.000001`. Expected-score unit is `goals|points|sets`. Tennis's score is null, not zero. `confidence` is a coverage/decisiveness heuristic. `availability=ready|insufficient_data`; insufficient data forces winProbability, expectedScore and confidence to null. `isStale` uses the rules in section 8.

```json
{"id":"prediction-1","fixtureId":"football:api-football:123","sport":"football","winProbability":{"home":0.52,"draw":0.26,"away":0.22},"expectedScore":{"home":1.65,"away":0.95,"total":2.6,"unit":"goals"},"confidence":0.74,"availability":"ready","modelVersion":"PA-Poisson 1.2","generatedAt":"2026-09-19T10:00:00.000Z","dataCutoffAt":"2026-09-19T09:55:00.000Z","isStale":false}
```

```json
{"id":"prediction-2","fixtureId":"basketball:thesportsdb:456","sport":"basketball","winProbability":{"home":0.61,"draw":null,"away":0.39},"expectedScore":{"home":112.55,"away":109.45,"total":222,"unit":"points"},"confidence":0.66,"availability":"ready","modelVersion":"PA-Margin 1.0","generatedAt":"2026-09-19T10:00:00.000Z","dataCutoffAt":"2026-09-19T09:55:00.000Z","isStale":false}
```

```json
{"id":"prediction-3","fixtureId":"tennis:thesportsdb:789","sport":"tennis","winProbability":{"home":0.57,"draw":null,"away":0.43},"expectedScore":null,"confidence":0.62,"availability":"ready","modelVersion":"PA-Tennis 1.0","generatedAt":"2026-09-19T10:00:00.000Z","dataCutoffAt":"2026-09-19T09:55:00.000Z","isStale":false}
```

PredictionDetail shape: `{summary: PredictionSummary, analysis: Analysis}`. Analysis football example:

```json
{"method":"Poisson goal model","sampleSize":60,"participantSampleSize":{"home":6,"away":7},"projectedMargin":null,"topScoreline":{"home":1,"away":0},"scoreMatrix":[{"home":0,"away":0,"probability":0.0743}],"markets":[{"market":"total","selection":"over","line":2.5,"probability":0.48,"kind":"probability","explanation":"At least three regulation goals."}],"factors":[{"label":"Home attack","value":"1.10x league","strength":0.61,"tone":"positive","detail":"Six completed matches with shrinkage."}],"warnings":["INJURIES_NOT_USED"],"featuresUsed":["scores","homeAdvantage"],"caveat":"Lineups and current fitness are not used."}
```

The scoreMatrix example is abbreviated; football must return all 25 cells for 0-4 goals per side, using full model probabilities, not renormalizing the displayed subset. Other sports return `scoreMatrix=[]`, `topScoreline=null`. Basketball returns numeric `projectedMargin`, tennis returns null. Both retain method, sample sizes, factors, warnings and featuresUsed. Factors preserve existing explanations; `tone=positive|negative|neutral`; strength is `[0,1]`.

Markets use `{market,selection,line,probability,kind,explanation}`. Football supports `1x2` (`home|draw|away`), `double-chance` (`home-draw|away-draw`), `total` (`over` at 1.5/2.5, `under` at 3.5) and `btts` (`yes`). Basketball and tennis use `winner` (`home|away`); basketball may return `close-game/yes`, tennis `long-match/yes` as `kind=heuristic`, never calibrated probabilities. Existing tennis set shares use `market=set-share`, `selection=home|away`, `kind=historical-rate`. Otherwise kind is `probability`; line is null except totals. These extra markets are analysis only in v1; saved slips and bets accept outcome markets only.

StandingRow is `{competitionId,season,group,rank,participant,played,won,drawn,lost,points,scoreFor,scoreAgainst}`. Participant uses the fixture participant shape. `group` is a provider table/conference ID or `overall`; order is group ascending then provider rank ascending then participant ID. Football returns all numeric statistics; basketball has `drawn=null`, `points=null`; tennis rankings have `played,won,drawn,lost,scoreFor,scoreAgainst=null`, and `points` is ranking points. Pagination pins one `asOf` snapshot until exhausted; expired snapshots return `409 CURSOR_EXPIRED`. Examples:

```json
{"competitionId":"football:premier-league","season":"2026","group":"overall","rank":1,"participant":{"id":"football:api-football:1","name":"Example Home","shortName":"HOM","badgeUrl":null},"played":5,"won":4,"drawn":1,"lost":0,"points":13,"scoreFor":12,"scoreAgainst":3}
```

```json
{"competitionId":"basketball:nba","season":"2026","group":"east","rank":1,"participant":{"id":"basketball:thesportsdb:1","name":"Example Team","shortName":"EXA","badgeUrl":null},"played":10,"won":8,"drawn":null,"lost":2,"points":null,"scoreFor":1120,"scoreAgainst":1050}
```

```json
{"competitionId":"tennis:atp","season":"2026","group":"overall","rank":1,"participant":{"id":"tennis:thesportsdb:1","name":"Example Player","shortName":"EXP","badgeUrl":null},"played":null,"won":null,"drawn":null,"lost":null,"points":10000,"scoreFor":null,"scoreAgainst":null}
```

### Profile, slips and tracker

| Method and path | Auth | Request shape/example | Success |
| --- | --- | --- | --- |
| `GET /me` | logged in | None | 200 User |
| `PATCH /me` | logged in | Nonempty subset of `{"displayName":"Favour","timezone":"Africa/Lagos","favoriteSports":["football"]}` | 200 updated User |
| `GET /slips` | logged in | `limit`, `cursor` | 200 list of Slip |
| `POST /slips` | logged in | `{"name":"Weekend","legs":[{"fixtureId":"football:api-football:123","market":"1x2","selection":"home"}]}` | 201 Slip |
| `GET /slips/{slipId}` | logged in | ID | 200 Slip |
| `PATCH /slips/{slipId}` | logged in | Nonempty subset of name and complete replacement legs, same shape as POST | 200 updated Slip |
| `DELETE /slips/{slipId}` | logged in | ID, `If-Match` | 204, no JSON body |
| `GET /bets` | logged in | `limit`, `cursor` | 200 list of Bet |
| `POST /bets` | logged in | BetCreate below | 201 Bet with status open |
| `GET /bets/{betId}` | logged in | ID | 200 Bet |
| `PATCH /bets/{betId}` | logged in | `{"status":"won","returnMinor":18000,"settledAt":"2026-09-20T18:00:00.000Z"}` or `{"notes":"Recorded from my bookmaker"}` | 200 updated Bet |
| `DELETE /bets/{betId}` | logged in | ID, `If-Match` | 204, no JSON body; only open bets |

User example. Only the three PATCH fields are writable; `displayName` is 1-80 trimmed characters, timezone is an IANA name, favoriteSports is a unique subset of allowed sports. Email comes from verified Cognito identity, never a client body. The bootstrap trigger conditionally creates this row; GET `/me` repairs a missing row from Cognito identity. Other private routes require the row and return `409 PROFILE_NOT_READY` if absent.

```json
{"id":"cognito-sub","email":"user@example.com","displayName":"Favour","timezone":"Africa/Lagos","favoriteSports":["football"],"plan":"free","premiumUntil":null,"subscriptionStatus":"none","createdAt":"2026-09-19T10:00:00.000Z","updatedAt":"2026-09-19T10:00:00.000Z","version":1}
```

LegInput is exactly `{fixtureId,market,selection}`; `market=1x2` for football, `winner` otherwise. Selection is `home|away`, plus `draw` for football. Each slip/bet contains 1-20 unique fixture IDs, all scheduled with known future startsAt when added/replaced. Server snapshots the latest ready prediction, if any; missing predictions do not prohibit saving. A snapshot retains only the selected outcome probability, ID and timestamp, not premium analysis. No combined probability is calculated by multiplying legs. There is no `userId` input.

Slip example (`name` 1-80 characters). LegSnapshot fields are immutable unless legs are explicitly replaced; `predictionId`, `probability`, `predictedAt` may all be null together. Old snapshots remain accessible on downgrade. Name-only edits remain allowed after kickoff. Deleting a slip never deletes bets copied from it.

```json
{"id":"slip-1","name":"Weekend","legs":[{"fixtureId":"football:api-football:123","sport":"football","market":"1x2","selection":"home","predictionId":"prediction-1","probability":0.52,"predictedAt":"2026-09-19T10:00:00.000Z"}],"createdAt":"2026-09-19T11:00:00.000Z","updatedAt":"2026-09-19T11:00:00.000Z","version":1}
```

BetCreate requires `stakeMinor` (1-100000000), `currency="NGN"`, `placedAt` (not in the future), `legs` (LegInput plus decimalOdds); optional `slipId` must belong to the user and have exactly those legs. Optional bookmaker (1-80 characters) and notes (0-1000) default to null. Require placedAt no later than earliest kickoff and all fixtures still scheduled/future on creation. Retrospective import and automatic settlement are not part of v1.

```json
{"slipId":"slip-1","stakeMinor":10000,"currency":"NGN","placedAt":"2026-09-19T11:30:00.000Z","bookmaker":"External bookmaker","notes":null,"legs":[{"fixtureId":"football:api-football:123","market":"1x2","selection":"home","decimalOdds":1.8}]}
```

Bet example: server copies LegSnapshots, records per-leg odds and calculates combinedDecimalOdds as their product rounded to six decimals using decimal arithmetic; reject combined odds above 1000000. `potentialReturnMinor=floor(stakeMinor*combinedDecimalOdds)`. Returns include stake. Actual settlement is user-reported, not a prediction performance metric.

```json
{"id":"bet-1","slipId":"slip-1","stakeMinor":10000,"currency":"NGN","placedAt":"2026-09-19T11:30:00.000Z","bookmaker":"External bookmaker","notes":null,"legs":[{"fixtureId":"football:api-football:123","sport":"football","market":"1x2","selection":"home","predictionId":"prediction-1","probability":0.52,"predictedAt":"2026-09-19T10:00:00.000Z","decimalOdds":1.8}],"combinedDecimalOdds":1.8,"potentialReturnMinor":18000,"status":"open","returnMinor":null,"profitMinor":null,"settledAt":null,"settlementSource":"manual","createdAt":"2026-09-19T11:30:00.000Z","updatedAt":"2026-09-19T11:30:00.000Z","version":1}
```

Bet PATCH permits notes and one transition `open -> won|lost|void|cashed_out`, with required settledAt (between placedAt and now) and returnMinor (integer 0-100000000000000). Lost requires zero, void requires stake, won requires a positive return, cashed_out allows zero. Profit is return minus stake. Stake, odds, legs, currency and placedAt are immutable; settled records allow notes only. Repeated or reverse settlement and deletion of settled bets return `409 INVALID_STATE`. A tracker dashboard derives totals by consuming every bets page; no summary endpoint in v1.

### Subscription and webhook

| Method and path | Auth | Request shape/example | Success shape/example |
| --- | --- | --- | --- |
| `GET /billing/plan` | public | None | 200 `{"id":"premium_monthly_ngn","amountMinor":500000,"currency":"NGN","interval":"monthly"}` in single envelope; amount is illustrative, server reads configured Paystack plan |
| `POST /billing/checkout` | logged in | `{"planId":"premium_monthly_ngn"}` and Idempotency-Key | 201 `{"reference":"pa-ref-1","authorizationUrl":"https://checkout.paystack.com/example"}` in single envelope |
| `GET /billing/subscription` | logged in | None | 200 `{"plan":"premium","status":"active","premiumUntil":"2026-10-19T00:00:00.000Z","cancelAtPeriodEnd":false}` in single envelope |
| `POST /billing/subscription/cancel` | logged in | `{}` | 200 subscription resource above, `cancelAtPeriodEnd=true`; repeated cancel is a no-op |
| `POST /webhooks/paystack` | public, signed | Provider JSON below, required `x-paystack-signature` | 200 raw `{"received":true}`, including duplicates and verified unsupported events |

Plan is `free|premium`; subscription status is `none|pending|active|past_due|cancelled|expired`. Checkout never accepts amount, currency, email, customer ID or callback URL from the browser. Use Cognito-verified email and a server-bound reference. A current pending, active, non-renewing or past-due subscription rejects new checkout with `409 SUBSCRIPTION_EXISTS`; cancel/resolve it first. Cancel without a subscription is 404; it stops renewal, not existing paid access. The fixed callback is `<FRONTEND_ORIGIN>/billing/return`; it polls the subscription resource, never grants access. No client-side payment-success endpoint.

Minimal recognized charge payload example; Paystack may include additional fields, unlike our client requests:

```json
{"event":"charge.success","data":{"id":123456,"domain":"test","status":"success","reference":"pa-ref-1","amount":500000,"currency":"NGN","paid_at":"2026-09-19T11:00:00.000Z","customer":{"customer_code":"CUS_example"},"metadata":{"userId":"cognito-sub"}}}
```

## 5. DynamoDB schema and access patterns

Physical names are `predictarena-<stage>-<suffix>` where stage is `dev|staging|prod`. All tables have string `pk` and `sk`, on-demand capacity, encryption and point-in-time recovery. Attributes below are in addition to pk/sk. No request-serving Scan. Prefix separators are reserved in user-generated IDs. Domain timestamps are strings; TTL `expiresAt` is epoch seconds and never controls entitlement. Only operational/snapshot rows expire; user data and charge-grant ledgers do not.

| Table suffix | PK / SK | Required attributes | Access patterns and indexes |
| --- | --- | --- | --- |
| `users` | `USER#<sub>` / `PROFILE` | User fields including stored `plan`, `premiumUntil`; `paystackCustomerCode`, `paystackSubscriptionCode` nullable; `cancelAtPeriodEnd`, `entitlementRevoked` booleans; `billingVersion` separate from profile `version`; `expiryDay`/`expirySort` only with paid access | Strong GetItem for own profile/entitlement. GSI `expiry-index`: pk=`expiryDay` (`YYYY-MM-DD` of premiumUntil), sk=`expirySort` (`premiumUntil#sub`). Expiry worker queries due dates, then conditionally updates base row. No email lookup for payment ownership. |
| `fixtures` | `FIXTURE#<fixtureId>` / `META` | Fixture fields except computed isStale; providerEventId, providerUpdatedAt; `sportDay`, `competitionDay`, `timeKey` for known startsAt | Get by ID; GSI `sport-day-index` pk=`sportDay` (`sport#date`), sk=`timeKey` (`startsAt#fixtureId`); GSI `competition-day-index` pk=`competitionDay` (`competitionId#date`), same sk. Query date partitions in order, filter status, continue with cursor. Reschedules update indexes. |
| `predictions` | `FIXTURE#<fixtureId>` / `VERSION#<predictionId>`; same PK / `LATEST` pointer | Version: summary, analysis, inputHash, inputSchemaVersion, fixtureStartsAt, generatedAt. Pointer: predictionId, generatedAt, frozenAt nullable | BatchGet LATEST for fixture-list IDs, then BatchGet versions; Get detail by fixture. Query VERSION prefix for audit. Publish version and update pointer transactionally only before kickoff. Freeze at kickoff; never overwrite a version. No GSI or results mixed into model records. |
| `slips` | `USER#<sub>` / `SLIP#<slipId>` | Slip fields | Get exact owner+ID; Query PK and SLIP prefix, descending; conditional version update/delete. |
| `bets` | `USER#<sub>` / `BET#<betId>` | Bet fields | Same owner-scoped CRUD/query with BET prefix; conditional status/version settlement. No public index. |
| `catalog` | `SPORT#<sport>` / `COMPETITION#<competitionId>` | Competition fields | Query one sport, or three bounded queries for full catalog. Providers and active-season mappings are ingestion-owned. |
| `standings` | `TABLE#<competitionId>#<season>` / `LATEST`; same PK / `SNAPSHOT#<asOf>#<group>#<zeroPaddedRank>#<participantId>` | Pointer: asOf, updatedAt. Snapshot rows: StandingRow, asOf, expiresAt | Get pointer, Query snapshot prefix. Writer completes all rows before switching pointer. Snapshots retained seven days. Cursor pins asOf; read paths reject expired snapshots even before TTL removes them. |
| `billing` | `REFERENCE#<reference>` / `CHECKOUT` | userId, planCode, amountMinor, currency, customerCode, status, authorizationUrl nullable, createdAt, expiresAt (30 days), requestHash | Strong lookup matches first payment reference to authenticated checkout; no grant from metadata alone. Retain unresolved successful payments until reconciled. |
| `billing` | `CUSTOMER#<customerCode>` / `OWNER`; `SUBSCRIPTION#<subscriptionCode>` / `OWNER` | userId, planCode, createdAt | Conditional unique mappings. Resolve renewal webhook to sub without scanning; reject conflicting owners. Subscription mapping also stores providerStatus, paidThrough, latestInvoiceCode and updatedAt. |
| `billing` | `CHARGE#<transactionId>` / `GRANT` | userId, reference, subscriptionCode, invoiceCode nullable, periodStart, periodEnd, amountMinor, currency, appliedAt | Durable unique charge grant. Transactionally write once with entitlement update. No TTL; event replays cannot extend access again. |
| `billing` | `EVENT#<sha256(eventType + rawBody)>` / `INBOX` | eventType, sanitized payload, receivedAt, state, attempts, nextAttemptAt; `workState`, `workSort` while pending | Conditional inbox insert; DynamoDB Stream invokes worker. GSI `work-index` pk=workState (`pending`), sk=workSort (`nextAttemptAt#eventId`) enables retry sweep. Completed inbox TTL 30 days; pending events never expire. Never persist card details or reusable authorization codes. |
| `operations` | `IDEMPOTENCY#<sub>#<method>#<path>#<uuid>` / `RESULT` | requestHash, state, responseStatus, responseBody, resourceId/reference, createdAt, expiresAt (24 hours) | Strong read/conditional claim; same DynamoDB transaction as slip/bet insert and ledger completion. Billing reserves a stable reference before external call, resumes the same operation on retry. |
| `operations` | `JOB#<jobName>` / `CHECKPOINT` | lastSuccessfulAt, cursor nullable, leaseUntil, version | Durable ingestion/expiry/reconciliation cursors and conditional worker leases. Missed expiry dates are replayed, not silently skipped. |
| `operations` | `BILLING#<sub>` / `LOCK` | reference, leaseUntil, state | Conditional per-user checkout lock prevents two different idempotency keys creating concurrent subscriptions; reconcile uncertain provider outcomes before releasing. |

`isStale` and effective plan are computed on read, not trusted from stored booleans. GSI reads are eventually consistent; entitlement reads use the base table with ConsistentRead. BatchGet retries UnprocessedKeys. Profile version protects user edits; billingVersion protects payment/expiry writes, so profile PATCH cannot overwrite billing state. Per-item size cap is 300 KiB; reject oversize user payloads with 413. Preserve versioned predictions and bet snapshots independently of fixture refreshes.

## 6. Authentication and authorization

One Cognito user pool and public browser app client per stage. Email signup with verification, password recovery and managed login. OAuth authorization code with PKCE S256, state and nonce; no client secret, no implicit flow. Exact callback/logout allowlists, separate production and staging domains; no wildcard Vercel previews. Scopes: `openid email profile predictarena/api`. Frontend retains access/refresh tokens in memory, not localStorage; a reload may use Cognito's managed-login session to sign in again. Only transient PKCE state may use sessionStorage.

HTTP API JWT authorizer reads `Authorization: Bearer <accessToken>`, issuer `https://cognito-idp.<region>.amazonaws.com/<poolId>`, audience = app client ID. All logged-in/premium routes require `predictarena/api`. Lambda additionally rejects `token_use != access` and derives owner from authorizer `sub`, never user-supplied headers/body. Public sports reads have no authorizer; OPTIONS is handled by Gateway CORS. [AWS JWT authorizer behavior](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-jwt-authorizer.html).

Entitlement choice: use a strongly consistent users-table lookup on every premium request, not a Cognito custom claim.
This makes payment, expiry and revocation effective without waiting for an old JWT to refresh.

Allow premium iff `users.plan == premium && premiumUntil > serverNow && entitlementRevoked == false`. Otherwise return `403 PREMIUM_REQUIRED`, regardless of frontend state. Expose effective plan on `/me` and `/billing/subscription`; elapsed paid access reads free even if a worker has not materialized expiry. Fail closed with 503 if entitlement storage is unavailable. Only billing/expiry IAM roles can update entitlement attributes; profile handler uses an explicit write-field allowlist. Access tokens last 15 minutes; disabling Cognito alone does not instantly invalidate already-issued JWTs, so emergency access revocation sets entitlementRevoked for premium access too.

## 7. Paystack state machine

Single recurring product: `premium_monthly_ngn`. Price comes from the configured Paystack monthly NGN plan, never a hardcoded sample. Hosted checkout uses card recurring payments; no payment-card data enters PredictArena. Under the user billing lock, create/reuse the Paystack customer and store its unique owner mapping, then initialize with verified email, plan code, stable reference, fixed callback and server-set metadata. Bind the reference to sub before redirecting. [Paystack initialization](https://paystack.com/docs/api/transaction/#initialize).

Webhook ingress decodes API Gateway base64 body when flagged, then computes HMAC-SHA512 over the exact raw bytes using PAYSTACK_SECRET_KEY. Compare the 128-hex-character `x-paystack-signature` in constant time before parsing or processing. Missing/bad signature returns 401; valid signature plus malformed JSON returns 400. Persist a deduplicated inbox before 200; persistence failure returns 503 so delivery retries. A DynamoDB Stream worker performs external verification, with an EventBridge five-minute retry sweep and alarms after repeated failures. [Paystack webhook authentication](https://paystack.com/docs/payments/webhooks/).

| Event/action | Required handling |
| --- | --- |
| `charge.success` | Verify transaction with Paystack server-side: success, expected test/live domain, plan, amount, currency and trusted reference/subscription/customer ownership. Fetch associated invoice/subscription. Apply a durable charge grant and user update atomically, setting users.plan premium and premiumUntil to max(existing paid-through, this verified periodEnd). |
| `subscription.create` | Establish verified subscription/customer ownership and provider metadata; does not grant paid access by itself. Resolve from checkout/customer mapping, never email or untrusted metadata alone. If charge arrives first, leave unresolved work pending and retry. |
| `invoice.update` | A paid invoice triggers the same transaction-verification/grant path as charge.success. Both events share the transaction-ID grant key. An unpaid invoice grants nothing. |
| `invoice.payment_failed` | Set past_due for the current subscription; do not extend premiumUntil or erase time already paid for. |
| `subscription.not_renew`, cancel endpoint | Confirm provider state, set cancelAtPeriodEnd true. Preserve current paid access. |
| `subscription.disable` | Mark current subscription cancelled/complete from verified provider state; no extension. Effective plan becomes free at premiumUntil, not at an arbitrary webhook arrival time. |
| Expiry/reconciliation | Every five minutes replay checkpointed due expiry dates and pending billing events. Conditionally set plan free/status expired when the observed premiumUntil is still elapsed; concurrent renewal wins via billingVersion. Reconcile provider subscription/paid invoice state on due events, not subscription active status alone. |
| Other verified events | Acknowledge; do not grant access. Verified `refund.processed` or `charge.dispute.create` for a known granted charge sets entitlementRevoked true pending operator reconciliation. Failed/pending refunds do not revoke. No automatic refund money movement. |

Period boundaries must belong to the verified paid invoice and transaction, not webhook receipt time. For initial checkout without an invoice yet, require the provider's matching subscription first-cycle boundary; if it cannot be proved, keep pending and retry. Never use a later subscription next_payment_date as proof of earlier paid months. Reject impossible periods. No grace period beyond paid-through. Delayed and out-of-order events cannot shorten a newer paid period, reset an unrelated current subscription or grant twice. Do not clear entitlementRevoked automatically on renewal. [Paystack subscription lifecycle](https://paystack.com/docs/payments/subscriptions/), [subscription verification](https://paystack.com/docs/api/subscription/#fetch).

Checkout retries reuse the reserved reference. After an uncertain provider timeout, verify/reconcile that reference before retrying initialization; never create a second charge intent with a new reference. Failed checkout does not change plan. Cancelling is idempotent and uses the provider subscription code/token obtained server-side, never client-supplied credentials.

## 8. Prediction engine input/output

Internal pure function, invoked only by ingestion/worker code. `schemaVersion=1`. Input example below is abbreviated to one historical event; production history contains all eligible rows in the bounded sample. Participants require stable IDs; adapt to current name-based functions only after disambiguating IDs. Required fields: schemaVersion, fixture, asOf, history. Optional: injuries, teamHealth, surface, bestOf. Unknown health is missing/null, not an assumption that everyone is fit.

```json
{"schemaVersion":1,"fixture":{"id":"football:api-football:123","sport":"football","competitionId":"football:premier-league","season":"2026","startsAt":"2026-09-20T15:00:00.000Z","homeId":"football:api-football:1","awayId":"football:api-football:2","neutralVenue":false},"asOf":"2026-09-19T09:55:00.000Z","history":[{"fixtureId":"football:api-football:99","competitionId":"football:premier-league","homeId":"football:api-football:1","awayId":"football:api-football:3","startsAt":"2026-09-12T14:00:00.000Z","completedAt":"2026-09-12T16:00:00.000Z","observedAt":"2026-09-12T16:05:00.000Z","homeScore":2,"awayScore":1,"unit":"goals"}],"injuries":[{"participantId":"football:api-football:1","athleteId":"athlete-1","status":"out","observedAt":"2026-09-19T09:00:00.000Z","source":"provider"}],"teamHealth":[{"participantId":"football:api-football:1","availabilityScore":0.85,"restDays":4,"observedAt":"2026-09-19T09:00:00.000Z","source":"provider"}]}
```

- History is completed, non-cancelled, deduplicated, same sport and competition, with `completedAt <= observedAt <= asOf < target.startsAt`; target fixture must be excluded. Historical football scores are regulation scores, basketball includes OT, tennis counts sets and excludes retirements/walkovers. Drop unverifiable dates/scores rather than guessing. Use most recent 200 eligible matches within 365 days, sorted by completedAt then fixtureId. Store hash and version of the actual input. As-of replay also requires observedAt, preventing later data corrections from leaking backwards.
- Optional injury status is `out|doubtful|available`; health availabilityScore is `[0,1]`, restDays is nonnegative. Only observations at/before asOf are eligible. Baseline models ignore these optional fields and must say so in warnings/featuresUsed; no invented injury multiplier. Incorporating health, surface, lineup or neutral-venue corrections requires a new model version and tests.
- Output is exactly PredictionDetail from section 4, with generated ID/time assigned by the worker. Football returns win/draw probabilities, expected goal lambdas, matrix and heuristic confidence. Basketball returns two-way win probabilities, projectedMargin and expected scores derived as `(expectedTotal +/- projectedMargin)/2`. Tennis returns two-way win probabilities and confidence; expectedScore is null because the existing logistic model has no score distribution.
- Retain existing version names/mathematics on initial port. Convert legacy percentages/strengths to fractions once at the adapter. Preserve the distinction between probability, heuristic and historical rate. Cold-start priors remain allowed when competition history exists, with `LOW_SAMPLE` when either participant has fewer than five matches. Zero eligible history returns availability insufficient_data, null summary estimates, empty analysis arrays and `NO_HISTORY`; do not present prior-only output as live analysis.
- Worker refresh target is every six hours, budget permitting, with a final pre-match refresh when supported. Freeze the latest prediction when play starts; rescheduled fixtures that have not started may receive a new version. Never overwrite historical pre-match evidence or add final scores to its input. GET never trains, calls a provider or runs a model.
- Scheduled fixture/prediction snapshots older than six hours are stale; live fixture scores older than five minutes are stale; standings older than 24 hours are stale. Finished/cancelled fixtures and frozen pre-match predictions do not become stale merely through age. `updatedAt`/`generatedAt` always disclose actual freshness. No live-refresh SLA is implied by the old six-hour provider cache.

## 9. Errors, security and configuration

Standard Lambda error response, with the same requestId as `X-Request-Id` and no stack/provider secrets:

```json
{"error":{"code":"VALIDATION_ERROR","message":"stakeMinor must be a positive integer.","details":[{"field":"stakeMinor","reason":"out_of_range"}]},"requestId":"req-1"}
```

`details` is always an array; use empty array when not field-specific. Codes: 400 VALIDATION_ERROR/UNSUPPORTED_SPORT/UNSUPPORTED_COMPETITION; 401 UNAUTHENTICATED/INVALID_WEBHOOK_SIGNATURE; 403 PREMIUM_REQUIRED; 404 NOT_FOUND/PREDICTION_NOT_READY; 409 INVALID_STATE/IDEMPOTENCY_CONFLICT/REQUEST_IN_PROGRESS/SUBSCRIPTION_EXISTS/PROFILE_NOT_READY/CURSOR_EXPIRED; 412 VERSION_CONFLICT; 413 PAYLOAD_TOO_LARGE; 428 PRECONDITION_REQUIRED; 429 RATE_LIMITED; 500 INTERNAL_ERROR; 503 DATA_UNAVAILABLE/SERVICE_UNAVAILABLE. Retry-After is mandatory for app-generated 429/503.

Native HTTP API JWT rejection/throttling/integration failure occurs before Lambda and can return AWS's `{"message":"Unauthorized"}` or another non-envelope body. Frontend adapter must normalize these by HTTP status (401 UNAUTHENTICATED, 403 FORBIDDEN, 429 RATE_LIMITED, 5xx SERVICE_UNAVAILABLE), taking requestId from `apigw-requestid` when available. Do not promise custom Lambda envelopes for Gateway-generated failures. Contract tests cover both. Never retry payment or create operations with a fresh idempotency key after a network error.

CORS allows only configured frontend origins; headers Authorization, Content-Type, Idempotency-Key, If-Match; methods GET, POST, PATCH, DELETE, OPTIONS; expose ETag, X-Request-Id, Retry-After, apigw-requestid. No cookie credentials. Apply gateway throttles, per-user mutation throttles and least-privilege table/action IAM. Never log tokens, raw webhook payloads or secret values. Provider credentials and payment secrets are server-only Secrets Manager values referenced by ARN; Terraform does not embed secret values in state. Lambda uses its execution role, never static AWS keys.

| Service | Required environment/configuration |
| --- | --- |
| Vercel frontend | `NEXT_PUBLIC_API_BASE_URL` (includes `/v1`), `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_COGNITO_DOMAIN`, `NEXT_PUBLIC_COGNITO_CLIENT_ID`, `NEXT_PUBLIC_COGNITO_REDIRECT_URI` (`<site>/auth/callback`), `NEXT_PUBLIC_COGNITO_LOGOUT_URI` (`<site>/`); no Paystack secret or provider key |
| All Lambdas | `STAGE`, runtime-supplied `AWS_REGION`, `LOG_LEVEL`; only the table env names each handler uses; `OPERATIONS_TABLE` for leases/idempotency where needed |
| Ingestion/model worker | `FIXTURES_TABLE`, `PREDICTIONS_TABLE`, `CATALOG_TABLE`, `STANDINGS_TABLE`, `OPERATIONS_TABLE`, `API_FOOTBALL_SECRET_ARN`, `THE_SPORTS_DB_SECRET_ARN`, `MODEL_SCHEMA_VERSION=1`; secret JSON fields `API_FOOTBALL_KEY` and `THE_SPORTS_DB_API_KEY` preserve existing names |
| Public sports handlers | `FIXTURES_TABLE`, `CATALOG_TABLE`, `STANDINGS_TABLE`; no provider credentials |
| Prediction handlers | `FIXTURES_TABLE`, `PREDICTIONS_TABLE`, `USERS_TABLE`; no provider credentials |
| Profile/bootstrap/auth helpers | `USERS_TABLE`, `COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID`; trigger/server lookup obtains verified identity |
| Slip/bet handlers | `USERS_TABLE`, `SLIPS_TABLE`, `BETS_TABLE`, `FIXTURES_TABLE`, `PREDICTIONS_TABLE`, `OPERATIONS_TABLE` |
| Billing/checkout/webhook/reconcile | `USERS_TABLE`, `BILLING_TABLE`, `OPERATIONS_TABLE`, `PAYSTACK_SECRET_ARN` (secret JSON field `PAYSTACK_SECRET_KEY`), `PAYSTACK_PLAN_CODE`, `PAYSTACK_MODE` (`test` or `live`), `FRONTEND_ORIGIN`; API root fixed `https://api.paystack.co` |
| API Gateway/Terraform | region/stage, `COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID`, `ALLOWED_ORIGINS`, exact Cognito callbacks/logout URIs, table names/ARNs, Lambda ARNs, secret ARNs; deployment emits these values for consumers |
| GitHub Actions OIDC | repository variables `AWS_REGION`, `AWS_ROLE_ARN`, `TF_STATE_BUCKET`, `TF_STATE_KEY`, `STAGE`; permissions `id-token: write`, `contents: read`; GitHub protected environment approval for production; no AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY secrets |
| Tests | `TEST_API_BASE_URL`, `TEST_STAGE`, dedicated Cognito test credentials in CI secrets or isolated test provisioning; Paystack test-mode fixtures only; never production payment calls |

Use Node.js 22 Lambda runtime and TypeScript to reuse the existing models. Backend deployment role trusts GitHub OIDC `aud=sts.amazonaws.com` and only `repo:codeWithGojo/PredictArena:environment:<stage>`; protect those environments against untrusted branches/PRs. No cloud-authenticated workflow on untrusted pull-request code. Terraform owns backend deployments, state uses versioned encrypted S3 with locking, bootstrap state/OIDC role is a one-time infra prerequisite. Vercel frontend deploy remains separate.

## 10. Dependency gates and acceptance

| Feature | Must wait for | Owner |
| --- | --- | --- |
| Wire mocks and validation tests | This contract | docs-and-tests |
| AWS resources/deploy | Protected GitHub environments, OIDC bootstrap, Terraform state and secret ARN configuration | infra-and-auth |
| Models and sports endpoints | Timestamped provider adapters, canonical IDs, fixtures/catalog/standings/predictions tables, IAM | data-and-model |
| Login and `/me` | Cognito pool/client/callbacks, users table, bootstrap/repair handler, API JWT authorizer | infra-and-auth; frontend consumes outputs |
| Free prediction lists | Models/ingestion, JWT authorizer and users provisioning | data-and-model |
| Premium prediction details | Free lists plus infra-owned entitlement helper and users-table permissions | data-and-model |
| Saved slips and tracker | Auth, users/fixtures/slips/bets/operations tables; prediction snapshots optional | infra-and-auth |
| Paystack checkout | Auth, verified user profile, billing/operations tables, secret and monthly NGN plan, deployed signed webhook | infra-and-auth |
| Payment activation and lapse | Durable inbox/stream, verified billing mappings, unique grants, EventBridge retry/expiry and users billingVersion | infra-and-auth |
| Frontend cutover | `/v1` mocks first, then deployed API/Cognito outputs and contract-tested handlers | frontend |
| Paid launch | Cutover, removal of all legacy public model routes, esports removal, Europa League support, real provider coverage checks, auth/payment isolation tests | all tracks, each edits only owned paths |

Required tests before launch: three sport schemas/probability sums and null tennis score; timestamp leakage, zero-history and ignored-injury cases; unauthorized and expired premium requests; foreign-user slip/bet access; optimistic-write and idempotency races; invalid signatures/raw-byte preservation; duplicate charge/invoice grants; invoice/charge ordering; delayed cancellation after renewal; missed expiry-worker run; concurrent expiry/renewal; mismatched payment amount/currency/domain/owner; stale/empty/unavailable sports feeds; no provider/payment secret in frontend; no legacy premium bypass. Financial tests use Paystack test mode, never live subscriptions.

## 11. Decisions where the repo was silent

1. Preserve Next.js on Vercel and port server logic to TypeScript/Node.js 22 Lambda; use HTTP API `/v1` rather than extending Vercel business routes.
2. Initial basketball/tennis coverage is existing NBA/ATP singles; add Europa League and exclude esports everywhere. Stable competition IDs hide provider IDs.
3. Public fixtures/standings, free logged-in prediction summaries, premium analysis; logged-in outcome-only slips/manual tracker. No automatic bet settlement or wagering.
4. Users-table entitlements, no premium JWT claim; PKCE Cognito login, stage separation and memory-only tokens.
5. One monthly NGN Paystack plan, provider-configured price, paid-through access without grace, durable idempotent webhook processing and expiry reconciliation.
6. Multi-table DynamoDB with explicit auxiliary catalog/standings/billing/operations tables; no request-serving scans or TTL-based access control.
7. Fractional probabilities, explicit quality warnings, timestamped model inputs, immutable pre-match versions, optional but unused health inputs and null tennis expected score.
8. Exact track boundaries retain current layout; legacy shared files have one owner until consumers migrate. All new tests/schemas belong only to docs-and-tests.
