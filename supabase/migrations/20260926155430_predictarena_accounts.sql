-- Server managed entitlements. Clients can read only their own row and cannot write any role or plan field.
create table public.account_entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan text not null default 'free' check (plan in ('free', 'premium')),
  owner_access boolean not null default false,
  entitlement_revoked boolean not null default false,
  premium_until timestamptz,
  created_at timestamptz not null default now()
);

alter table public.account_entitlements enable row level security;
revoke all on public.account_entitlements from anon, authenticated;
grant select on public.account_entitlements to authenticated;
create policy "Members read only their entitlement" on public.account_entitlements
  for select to authenticated using ((select auth.uid()) = user_id);

create schema if not exists private;
create or replace function private.create_account_entitlement()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.account_entitlements (user_id) values (new.id);
  return new;
end;
$$;
revoke all on function private.create_account_entitlement() from public, anon, authenticated;
create trigger create_account_entitlement
  after insert on auth.users for each row execute function private.create_account_entitlement();

-- If signups predate this migration, create their free profiles without granting owner access.
insert into public.account_entitlements (user_id)
  select id from auth.users on conflict (user_id) do nothing;
