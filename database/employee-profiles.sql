create table public.go_employee_profiles (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id),
 name text not null check(char_length(trim(name)) between 1 and 140),
 email text not null check(email=lower(trim(email)) and char_length(email) between 3 and 254 and position('@' in email)>1),
 phone text not null default '' check(char_length(phone)<=50),
 job_title text not null default '' check(char_length(job_title)<=100),
 notes text not null default '' check(char_length(notes)<=2000),
 archived boolean not null default false,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(owner_id,email)
);
alter table public.go_employee_profiles enable row level security;
revoke all on public.go_employee_profiles from public,anon,authenticated;
grant select,insert,update on public.go_employee_profiles to authenticated;
create policy employee_profiles_owner_read on public.go_employee_profiles for select to authenticated
using(owner_id=(select auth.uid()) and (select go_private.is_confirmed_owner()));
create policy employee_profiles_owner_insert on public.go_employee_profiles for insert to authenticated
with check(owner_id=(select auth.uid()) and (select go_private.is_confirmed_owner()));
create policy employee_profiles_owner_update on public.go_employee_profiles for update to authenticated
using(owner_id=(select auth.uid()) and (select go_private.is_confirmed_owner()))
with check(owner_id=(select auth.uid()) and (select go_private.is_confirmed_owner()));
comment on table public.go_employee_profiles is 'Owner-only employee directory. Email matches approved login accounts; profile creation never grants login access. Archiving a profile does not change account permissions.';