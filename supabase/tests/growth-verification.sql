-- Runs in one transaction and leaves no test users, results or forecasts behind.
begin;
insert into auth.users(id,email,email_confirmed_at) values
 ('d1510000-0000-4000-8000-000000000001','growth-test-a@example.invalid',now()),
 ('d1510000-0000-4000-8000-000000000002','growth-test-b@example.invalid',now());
insert into public.prediction_archive(fixture_id,league_id,league,home,away,kickoff_at,published_at,model_version,probabilities,confidence,strongest_outcome) values
 ('__verify-home','__verify','Verification','A','B',now()+interval '1 day','2001-01-01','test','[70,20,10]',65,'home'),
 ('__verify-draw','__verify','Verification','C','D',now()+interval '1 day','2001-01-01','test','[20,60,20]',65,'draw'),
 ('__verify-loss','__verify','Verification','E','F',now()+interval '1 day','2001-01-01','test','[70,20,10]',65,'home');
insert into public.fixture_results(fixture_id,home_score,away_score) values ('__verify-home',2,0),('__verify-draw',1,1),('__verify-loss',0,1);
insert into public.premium_match_analysis(fixture_id,analysis) values ('__verify-home','{"factors":[],"caveat":"test"}');
do $$ begin
 if (select min(published_at) from public.prediction_archive where league_id='__verify') < now()-interval '1 minute' then raise exception 'Publication stamping failed'; end if;
 if (public.prediction_performance('__verify')->>'settled')::int <> 3 or (public.prediction_performance('__verify')->>'correct')::int <> 2 then raise exception 'Losses or draws missing from metrics'; end if;
 if abs((public.prediction_performance('__verify')->>'brier')::numeric - (0.14+0.24+1.34)/3) > 0.000001 then raise exception 'Incorrect Brier score'; end if;
 begin update public.prediction_archive set confidence=100 where fixture_id='__verify-home'; raise exception 'Forecast was rewritten'; exception when raise_exception then if sqlerrm <> 'Published forecasts are immutable' then raise; end if; end;
 begin insert into public.prediction_archive(fixture_id,league_id,league,home,away,kickoff_at,model_version,probabilities,confidence,strongest_outcome) values ('__verify-invalid','__verify','Verification','G','H',now()+interval '1 day','test','[80,30,-10]',65,'home'); raise exception 'Invalid probabilities accepted'; exception when check_violation then null; end;
 begin insert into public.prediction_archive(fixture_id,league_id,league,home,away,kickoff_at,model_version,probabilities,confidence,strongest_outcome) values ('__verify-late','__verify','Verification','G','H',now()-interval '1 day','test','[70,20,10]',65,'home'); raise exception 'Past kickoff accepted'; exception when check_violation then null; end;
end $$;
set local role anon;
do $$ begin
 if (public.prediction_performance('__verify')->>'published')::int <> 3 then raise exception 'Public record unreadable'; end if;
 begin insert into public.fixture_results values ('__verify-no',1,0,now()); raise exception 'Anonymous result write allowed'; exception when insufficient_privilege then null; end;
 begin perform * from public.saved_predictions; raise exception 'Anonymous private read allowed'; exception when insufficient_privilege then null; end;
 begin perform public.verify_archive_token('wrong'); raise exception 'Anonymous secret verifier allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','d1510000-0000-4000-8000-000000000001',true);
insert into public.saved_predictions(user_id,fixture_id) values ('d1510000-0000-4000-8000-000000000001','__verify-home');
insert into public.account_preferences(user_id,leagues,teams) values ('d1510000-0000-4000-8000-000000000001','{39}','{A}');
insert into public.premium_interest(user_id) values ('d1510000-0000-4000-8000-000000000001');
do $$ begin
 if (select count(*) from public.saved_predictions) <> 1 then raise exception 'Own saves unreadable'; end if;
 if (select count(*) from public.premium_match_analysis) <> 0 then raise exception 'Free account sees Premium analysis'; end if;
 begin insert into public.saved_predictions(user_id,fixture_id) values ('d1510000-0000-4000-8000-000000000002','__verify-home'); raise exception 'Foreign-user write allowed'; exception when insufficient_privilege then null; end;
 begin update public.account_preferences set user_id='d1510000-0000-4000-8000-000000000002'; raise exception 'Preference ownership reassignment allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
update public.account_entitlements set plan='premium',premium_until=now()+interval '1 day' where user_id='d1510000-0000-4000-8000-000000000001';
set local role authenticated;
do $$ begin if (select count(*) from public.premium_match_analysis) <> 1 then raise exception 'Paid access denied'; end if; end $$;
reset role;
update public.account_entitlements set entitlement_revoked=true where user_id='d1510000-0000-4000-8000-000000000001';
set local role authenticated;
do $$ begin if (select count(*) from public.premium_match_analysis) <> 0 then raise exception 'Revoked access remains'; end if; end $$;
select set_config('request.jwt.claim.sub','d1510000-0000-4000-8000-000000000002',true);
do $$ begin
 if (select count(*) from public.saved_predictions) <> 0 or (select count(*) from public.account_preferences) <> 0 or (select count(*) from public.premium_interest) <> 0 then raise exception 'Private data visible to another user'; end if;
end $$;
reset role;
rollback;
