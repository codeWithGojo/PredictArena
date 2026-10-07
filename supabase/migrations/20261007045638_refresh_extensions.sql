-- Apply as an administrator migration during the approved release.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
