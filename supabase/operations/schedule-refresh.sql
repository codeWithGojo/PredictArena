-- Enable only after confirming the first refresh completed successfully.
-- A named schedule is idempotent: rerunning updates the existing job.
do $$ begin
 if not exists(select 1 from public.feed_snapshots where id = 'current' and fetched_at > now() - interval '5 minutes') then
  raise exception 'Run and verify a successful initial refresh before scheduling';
 end if;
 if (select count(*) from vault.decrypted_secrets where name = 'predictarena_archive_refresh') <> 1 then
  raise exception 'Exactly one archive refresh secret must exist';
 end if;
end $$;
select cron.schedule('predictarena-feed-refresh', '*/15 * * * *', $job$
 select net.http_post(
  url := 'https://fhnmbtnlvgllsrorycey.supabase.co/functions/v1/refresh-predictions',
  headers := '{"Content-Type":"application/json"}'::jsonb,
  body := jsonb_build_object('token', (select decrypted_secret from vault.decrypted_secrets where name = 'predictarena_archive_refresh')),
  timeout_milliseconds := 65000
 );
$job$) as job_id;
