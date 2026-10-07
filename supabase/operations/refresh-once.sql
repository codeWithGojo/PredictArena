-- Invoke after deploying the source endpoint and the latest worker.
-- Keep the Vault secret in the database; never copy it into command arguments.
do $$ begin
 if (select count(*) from vault.decrypted_secrets where name = 'predictarena_archive_refresh') <> 1 then
  raise exception 'Exactly one archive refresh secret must exist';
 end if;
end $$;
select net.http_post(
 url := 'https://fhnmbtnlvgllsrorycey.supabase.co/functions/v1/refresh-predictions',
 headers := '{"Content-Type":"application/json"}'::jsonb,
 body := jsonb_build_object('token', (select decrypted_secret from vault.decrypted_secrets where name = 'predictarena_archive_refresh')),
 timeout_milliseconds := 65000
) as request_id;
