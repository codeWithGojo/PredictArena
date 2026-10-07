-- The public archive is the first eligible football 1X2 forecast actually stored
-- before kickoff. Database time establishes publication; no historical backfill.
create table public.prediction_archive (
  fixture_id text primary key,
  league_id text not null, league text not null, home text not null, away text not null,
  kickoff_at timestamptz not null,
  published_at timestamptz not null default clock_timestamp(),
  model_version text not null,
  probabilities jsonb not null,
  confidence integer not null check (confidence between 0 and 100),
  strongest_outcome text not null check (strongest_outcome in ('home','draw','away')),
  unique (league_id, home, away, kickoff_at),
  check (published_at < kickoff_at),
  check (jsonb_typeof(probabilities) = 'array' and jsonb_array_length(probabilities) = 3)
);
create index prediction_archive_kickoff on public.prediction_archive(kickoff_at desc);
create index prediction_archive_league_kickoff on public.prediction_archive(league_id, kickoff_at desc);
create table public.fixture_results (
  fixture_id text primary key references public.prediction_archive(fixture_id),
  home_score integer not null check (home_score between 0 and 100),
  away_score integer not null check (away_score between 0 and 100),
  observed_at timestamptz not null default clock_timestamp()
);
create table public.feed_snapshots (
  id text primary key check (id = 'current'),
  fetched_at timestamptz not null default clock_timestamp(),
  payload jsonb not null
);
create table public.premium_match_analysis (
  fixture_id text primary key,
  analysis jsonb not null,
  updated_at timestamptz not null default clock_timestamp()
);
create table public.saved_predictions (
  user_id uuid not null references auth.users(id) on delete cascade,
  fixture_id text not null references public.prediction_archive(fixture_id),
  created_at timestamptz not null default now(),
  primary key(user_id, fixture_id)
);
create index saved_predictions_fixture on public.saved_predictions(fixture_id);
create table public.account_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  leagues text[] not null default '{}',
  teams text[] not null default '{}',
  check (cardinality(leagues) <= 30 and cardinality(teams) <= 30)
);
create table public.premium_interest (
  user_id uuid primary key references auth.users(id) on delete cascade,
  proposed_price_ngn integer not null default 3000 check (proposed_price_ngn = 3000),
  created_at timestamptz not null default now()
);

alter table public.prediction_archive enable row level security;
alter table public.fixture_results enable row level security;
alter table public.feed_snapshots enable row level security;
alter table public.premium_match_analysis enable row level security;
alter table public.saved_predictions enable row level security;
alter table public.account_preferences enable row level security;
alter table public.premium_interest enable row level security;
revoke all on public.prediction_archive, public.fixture_results, public.feed_snapshots,
  public.premium_match_analysis, public.saved_predictions, public.account_preferences, public.premium_interest from anon, authenticated;
grant select on public.prediction_archive, public.fixture_results, public.feed_snapshots to anon, authenticated;
grant select on public.premium_match_analysis to authenticated;
grant select, insert, delete on public.saved_predictions, public.premium_interest to authenticated;
grant select, insert, update on public.account_preferences to authenticated;
grant all on public.prediction_archive, public.fixture_results, public.feed_snapshots,
  public.premium_match_analysis, public.saved_predictions, public.account_preferences, public.premium_interest to service_role;
create policy "Public forecasts" on public.prediction_archive for select to anon, authenticated using (true);
create policy "Public final results" on public.fixture_results for select to anon, authenticated using (true);
create policy "Public feed" on public.feed_snapshots for select to anon, authenticated using (true);
create policy "Paid analysis" on public.premium_match_analysis for select to authenticated using (
  exists(select 1 from public.account_entitlements e where e.user_id = (select auth.uid())
    and not e.entitlement_revoked and (e.owner_access or (e.plan = 'premium' and e.premium_until > now())))
);
create policy "Read own saved forecasts" on public.saved_predictions for select to authenticated using ((select auth.uid()) = user_id);
create policy "Save own forecasts" on public.saved_predictions for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Delete own forecasts" on public.saved_predictions for delete to authenticated using ((select auth.uid()) = user_id);
create policy "Read own preferences" on public.account_preferences for select to authenticated using ((select auth.uid()) = user_id);
create policy "Insert own preferences" on public.account_preferences for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Update own preferences" on public.account_preferences for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Read own interest" on public.premium_interest for select to authenticated using ((select auth.uid()) = user_id);
create policy "Join own interest" on public.premium_interest for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Remove own interest" on public.premium_interest for delete to authenticated using ((select auth.uid()) = user_id);

-- Prevent future worker changes from overwriting an already published forecast.
create or replace function private.freeze_prediction() returns trigger language plpgsql set search_path = '' as $$
begin raise exception 'Published forecasts are immutable'; end;
$$;
revoke all on function private.freeze_prediction() from public, anon, authenticated;
create trigger freeze_prediction before update or delete on public.prediction_archive for each row execute function private.freeze_prediction();

-- Public statistics use caller privileges/RLS. Every eligible forecast counts,
-- and all final outcomes (including losses) enter the denominator.
create function public.prediction_performance(p_league text default null) returns jsonb
language sql stable security invoker set search_path = '' as $$
with forecasts as (
  select a.* from public.prediction_archive a where p_league is null or a.league_id = p_league
), settled as (
  select a.*, case when r.home_score > r.away_score then 'home' when r.home_score < r.away_score then 'away' else 'draw' end as actual,
    case when r.home_score > r.away_score then 0 when r.home_score < r.away_score then 2 else 1 end as actual_index,
    greatest((a.probabilities->>0)::numeric, (a.probabilities->>1)::numeric, (a.probabilities->>2)::numeric) / 100 as top_probability
  from forecasts a join public.fixture_results r using(fixture_id)
), scores as (
  select s.*,
    (select sum(power((s.probabilities->>i)::numeric / 100 - case when i = s.actual_index then 1 else 0 end, 2)) from generate_series(0,2) i) as brier,
    -ln(greatest(0.000001, (s.probabilities->>s.actual_index)::numeric / 100)) as log_loss
  from settled s
), buckets as (
  select least(9, floor(top_probability * 10)) as bucket, count(*) as count,
    avg(top_probability) as expected, avg((strongest_outcome = actual)::integer) as actual
  from scores group by 1
)
select jsonb_build_object(
  'published',(select count(*) from forecasts), 'settled',(select count(*) from scores),
  'correct',(select count(*) from scores where strongest_outcome = actual),
  'winRate',(select avg((strongest_outcome = actual)::integer) from scores),
  'brier',(select avg(brier) from scores), 'logLoss',(select avg(log_loss) from scores),
  'since',(select min(published_at) from forecasts),
  'calibration',coalesce((select jsonb_agg(to_jsonb(b) order by bucket) from buckets b),'[]'::jsonb)
);
$$;
revoke all on function public.prediction_performance(text) from public;
grant execute on function public.prediction_performance(text) to anon, authenticated, service_role;

-- The worker's custom authentication checks a Vault secret using the service
-- role. This RPC is not callable by either client role and never returns secrets.
create function public.verify_archive_token(p_token text) returns boolean
language sql stable security invoker set search_path = '' as $$
select exists(select 1 from vault.decrypted_secrets where name = 'predictarena_archive_refresh'
  and extensions.digest(decrypted_secret, 'sha256') = extensions.digest(p_token, 'sha256'));
$$;
revoke all on function public.verify_archive_token(text) from public, anon, authenticated;
grant execute on function public.verify_archive_token(text) to service_role;

grant select on vault.decrypted_secrets to service_role;


