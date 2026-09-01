-- Reserve formal account numbers and launch-trial capacity only after email
-- confirmation, and keep a durable server-side record of signup consent.

begin;

create table if not exists public.account_legal_consents (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  consent_key text not null check (
    consent_key in (
      'terms_of_service',
      'privacy_notice',
      'cross_border_processing'
    )
  ),
  policy_version text not null check (
    policy_version ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
  ),
  accepted_at timestamptz not null,
  source text not null default 'signup' check (source in ('signup')),
  created_at timestamptz not null default now(),
  unique (user_id, consent_key, policy_version)
);

comment on table public.account_legal_consents is
  'Append-only server-side evidence of the policy versions accepted during account signup.';
comment on column public.account_legal_consents.accepted_at is
  'Server timestamp from the auth-user creation event, not a browser-supplied timestamp.';

alter table public.account_legal_consents enable row level security;

revoke all on table public.account_legal_consents
  from public, anon, authenticated;
revoke all on sequence public.account_legal_consents_id_seq
  from public, anon, authenticated;

grant select on table public.account_legal_consents
  to authenticated, service_role;

drop policy if exists account_legal_consents_select_own
  on public.account_legal_consents;
create policy account_legal_consents_select_own
on public.account_legal_consents
for select
to authenticated
using (user_id = (select auth.uid()));

create or replace function private.record_signup_legal_consents(
  p_user_id uuid,
  p_metadata jsonb,
  p_accepted_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_metadata jsonb := coalesce(p_metadata, '{}'::jsonb);
  v_policy_version constant text := '2026-09-01';
  v_accepted_at timestamptz := coalesce(p_accepted_at, now());
begin
  if coalesce(v_metadata ->> 'legal_terms_accepted', 'false') <> 'true'
     or coalesce(v_metadata ->> 'privacy_notice_accepted', 'false') <> 'true'
     or coalesce(v_metadata ->> 'cross_border_consent', 'false') <> 'true'
     or coalesce(v_metadata ->> 'legal_terms_version', '') <> v_policy_version
     or coalesce(v_metadata ->> 'privacy_notice_version', '') <> v_policy_version
     or coalesce(v_metadata ->> 'cross_border_consent_version', '') <> v_policy_version then
    raise exception using
      errcode = 'P0001',
      message = 'signup_legal_consents_required';
  end if;

  insert into public.account_legal_consents (
    user_id,
    consent_key,
    policy_version,
    accepted_at,
    source
  )
  values
    (
      p_user_id,
      'terms_of_service',
      v_policy_version,
      v_accepted_at,
      'signup'
    ),
    (
      p_user_id,
      'privacy_notice',
      v_policy_version,
      v_accepted_at,
      'signup'
    ),
    (
      p_user_id,
      'cross_border_processing',
      v_policy_version,
      v_accepted_at,
      'signup'
    )
  on conflict (user_id, consent_key, policy_version) do nothing;
end;
$$;

revoke all on function private.record_signup_legal_consents(
  uuid,
  jsonb,
  timestamptz
) from public, anon, authenticated, service_role;

comment on function private.record_signup_legal_consents(uuid, jsonb, timestamptz) is
  'Auth-trigger-only validation and recording of the signup policy versions.';

-- Auth INSERT now creates only the profile and consent evidence. Formal rank
-- and bounded trial allocation wait until the email is confirmed.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_username text := coalesce(
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'user'
  );
begin
  perform private.record_signup_legal_consents(
    new.id,
    new.raw_user_meta_data,
    new.created_at
  );

  insert into public.profiles (
    id,
    email,
    username,
    created_at,
    updated_at
  )
  values (
    new.id,
    new.email,
    v_username,
    new.created_at at time zone 'UTC',
    now() at time zone 'UTC'
  )
  on conflict (id) do update
  set
    email = excluded.email,
    username = coalesce(public.profiles.username, excluded.username);

  -- Admin-created, OAuth, or locally configured accounts may arrive already
  -- confirmed. The initializer is idempotent, so this path is safe to retry.
  if new.email_confirmed_at is not null then
    perform *
    from private.initialize_new_account(
      new.id,
      new.email,
      new.email_confirmed_at
    );
  end if;

  return new;
end;
$$;

revoke all on function public.handle_new_user()
  from public, anon, authenticated, service_role;

comment on function public.handle_new_user() is
  'Auth INSERT trigger: validates consent, creates the profile, and defers formal account allocation until email confirmation.';

create or replace function private.handle_user_email_confirmation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.record_signup_legal_consents(
    new.id,
    new.raw_user_meta_data,
    new.created_at
  );

  perform *
  from private.initialize_new_account(
    new.id,
    new.email,
    new.email_confirmed_at
  );

  return new;
end;
$$;

revoke all on function private.handle_user_email_confirmation()
  from public, anon, authenticated, service_role;

comment on function private.handle_user_email_confirmation() is
  'Auth UPDATE trigger: atomically allocates the formal account identity and any eligible launch trial after email confirmation.';

comment on function private.initialize_new_account(uuid, text, timestamptz) is
  'Trigger-only confirmed-account finalizer. The timestamp is the confirmation time; retries cannot consume a second rank or trial slot.';

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();

drop trigger if exists on_auth_user_email_confirmed on auth.users;
create trigger on_auth_user_email_confirmed
after update of email_confirmed_at on auth.users
for each row
when (
  old.email_confirmed_at is null
  and new.email_confirmed_at is not null
)
execute function private.handle_user_email_confirmation();

commit;
