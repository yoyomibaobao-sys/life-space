-- Require the current signup policy versions and record append-only server-side
-- evidence without changing the current account-number or cloud-trial lifecycle.
-- Account creation remains immediate; cloud trial claiming remains a separate,
-- email-confirmed user action handled by the claimable-cloud-trial migration.

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
  source text not null default 'signup' check (source = 'signup'),
  created_at timestamptz not null default now(),
  unique (user_id, consent_key, policy_version)
);

comment on table public.account_legal_consents is
  'Append-only server-side evidence of policy versions accepted during account signup.';
comment on column public.account_legal_consents.accepted_at is
  'Server timestamp from the auth-user creation event, never a browser-supplied timestamp.';

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
    (p_user_id, 'terms_of_service', v_policy_version, v_accepted_at, 'signup'),
    (p_user_id, 'privacy_notice', v_policy_version, v_accepted_at, 'signup'),
    (p_user_id, 'cross_border_processing', v_policy_version, v_accepted_at, 'signup')
  on conflict (user_id, consent_key, policy_version) do nothing;
end;
$$;

revoke all on function private.record_signup_legal_consents(
  uuid,
  jsonb,
  timestamptz
) from public, anon, authenticated, service_role;

comment on function private.record_signup_legal_consents(uuid, jsonb, timestamptz) is
  'Auth-trigger-only validation and append-only recording of signup policy versions.';

create or replace function public.handle_new_user()
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
    new.created_at
  );

  return new;
end;
$$;

revoke all on function public.handle_new_user()
  from public, anon, authenticated, service_role;

comment on function public.handle_new_user() is
  'Auth INSERT trigger: validates signup consent and atomically creates the permanent local-free account. Cloud trial access is never granted here.';

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();

-- Defensive cleanup only: the superseded PR #60 used this trigger to defer
-- account/trial allocation until email confirmation. The current model must not.
drop trigger if exists on_auth_user_email_confirmed on auth.users;
drop function if exists private.handle_user_email_confirmation();

notify pgrst, 'reload schema';

commit;
