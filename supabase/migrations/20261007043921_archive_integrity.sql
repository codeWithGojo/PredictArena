-- Validate the distribution independently of the worker and keep the display
-- label consistent with deterministic home/draw/away tie breaking.
alter table public.prediction_archive add constraint valid_probability_distribution check (
  jsonb_typeof(probabilities->0) = 'number' and jsonb_typeof(probabilities->1) = 'number' and jsonb_typeof(probabilities->2) = 'number'
  and (probabilities->>0)::numeric between 0 and 100
  and (probabilities->>1)::numeric between 0 and 100
  and (probabilities->>2)::numeric between 0 and 100
  and abs((probabilities->>0)::numeric + (probabilities->>1)::numeric + (probabilities->>2)::numeric - 100) < 0.01
);
alter table public.prediction_archive add constraint consistent_strongest_outcome check (
  strongest_outcome = case when (probabilities->>0)::numeric >= greatest((probabilities->>1)::numeric,(probabilities->>2)::numeric) then 'home'
    when (probabilities->>1)::numeric >= (probabilities->>2)::numeric then 'draw' else 'away' end
);
-- Prevent caller-supplied publication time, including accidental future worker changes.
create function private.stamp_prediction() returns trigger language plpgsql set search_path = '' as $$
begin new.published_at := clock_timestamp(); return new; end;
$$;
revoke all on function private.stamp_prediction() from public, anon, authenticated;
create trigger stamp_prediction before insert on public.prediction_archive for each row execute function private.stamp_prediction();
