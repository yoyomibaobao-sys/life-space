import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");
// Git checkout/archive may preserve CRLF in signed SQL; normalize only the
// in-memory test fixture so preflight boundary assertions remain portable.
const migration = read("supabase/migrations/20261108130901_adm_record_moderation_minimal.sql").replace(/\r\n/g, "\n");
const preflightMatch = migration.match(/do \$adm_preflight\$([\s\S]*?)\$adm_preflight\$;/);
if (!preflightMatch) throw new Error("ADM migration preflight block is missing");
const legacyTrialGuard = preflightMatch[1].match(
  /  -- Signed live-QA baseline:[\s\S]*?(?=\n\n  -- Freeze the complete RLS policy inventory)/
)?.[0];
if (!legacyTrialGuard) throw new Error("ADM live-QA Trial absence guard is missing");
const mediaBucketGuard = preflightMatch[1].match(
  /  -- The private media bucket is part of the Storage RLS authorization boundary\.[\s\S]*?(?=\n\n  -- RLS flags)/
)?.[0];
if (!mediaBucketGuard) throw new Error("ADM private media bucket guard is missing");
// PGlite intentionally does not reproduce the live QA's owners, ACLs, function
// fingerprints or view definitions. Exercise the migration body in PGlite,
// and execute the extracted live-QA Trial guard independently below.
const migrationForPglite = migration.replace(
  preflightMatch[0],
  "do $adm_preflight$ begin null; end $adm_preflight$;"
);

const setupSql = [
  "create role anon nologin;",
  "create role authenticated nologin;",
  "create role service_role nologin;",
  "create schema auth;",
  "create schema storage;",
  "create table storage.buckets (id text primary key, public boolean not null);",
  "insert into storage.buckets (id, public) values ('media', false);",
  "create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;",
  "create table public.archives (id uuid primary key, user_id uuid not null, is_public boolean not null default true, trashed_at timestamptz, trash_entry_id uuid, cover_image_path text, title text, category text, species_id uuid, species_name_snapshot text, system_name text, record_count integer not null default 0, view_count bigint not null default 0, status text, ended_at timestamptz, help_status text, help_opened_at timestamptz, help_resolved_at timestamptz, archive_summary text, created_at timestamptz not null default now());",
  "create table public.records (id uuid primary key, archive_id uuid not null, user_id uuid not null, visibility text not null default 'public', trashed_at timestamptz, trash_entry_id uuid, primary_image_path text, primary_thumb_path text, primary_image_url text, note text, record_time timestamptz, status_tag text, comment_count integer not null default 0, media_count integer not null default 0, created_at timestamptz not null default now());",
  "create table public.media (id uuid primary key, user_id uuid not null, record_id uuid, storage_path text, thumb_path text, url text, thumb_url text, trashed_at timestamptz, trash_entry_id uuid);",
  "create table public.experience_cards (id uuid primary key, archive_id uuid not null, user_id uuid not null, status text, published_at timestamptz, source_record_count integer);",
  "create table public.experience_card_records (card_id uuid not null, record_id uuid not null);",
  "create table public.market_posts (id uuid primary key, user_id uuid not null, status text, source_record_id uuid, cover_image_path text, cover_image_url text, cover_thumb_path text, cover_thumb_url text, cover_upload_reservation_id uuid);",
  "create table public.market_media (id uuid primary key, user_id uuid not null, market_post_id uuid not null, path text, url text, thumb_path text, thumb_url text, source_media_id uuid, source_record_id uuid, upload_reservation_id uuid);",
  "create table public.storage_upload_reservations (id uuid primary key, owner_user_id uuid not null, target_type text not null, target_id uuid not null, target_parent_id uuid, status text not null, settled_at timestamptz, cancelled_at timestamptz, reserved_bytes bigint not null default 200, actual_bytes bigint);",
  "create table public.storage_upload_reservation_paths (id uuid primary key, reservation_id uuid not null, owner_user_id uuid not null, object_path text not null, path_kind text not null, reserved_bytes bigint not null default 200, actual_bytes bigint, active boolean not null default true, deactivated_at timestamptz);",
  "create table public.support_submissions (id uuid primary key, user_id uuid not null, kind text not null, category text, status text not null default 'submitted', target_type text, target_id text, target_key text, supplement text, resolution text, resolved_by uuid, resolved_at timestamptz, admin_note text, updated_at timestamptz not null default now(), created_at timestamptz not null default now());",
  "create table public.support_submission_admin_events (id bigint generated always as identity primary key, submission_id uuid not null, actor_id uuid, previous_status text, next_status text, resolution text, admin_note text, occurred_at timestamptz not null default now());",
  "create table public.test_notifications (id bigint generated always as identity primary key, recipient_user_id uuid, notification_type text, related_url text, metadata jsonb);",
  "create table public.public_profiles (id uuid primary key, username text, avatar_url text, country_name text, region_name text, city_name text);",
  "create table storage.objects (id bigint generated always as identity primary key, bucket_id text not null, name text not null, owner_id text not null default '10000000-0000-4000-8000-000000000001');",
  "create function public.is_app_admin(p_user_id uuid) returns boolean language sql stable as $$ select p_user_id is not null and p_user_id = nullif(current_setting('test.admin_id', true), '')::uuid $$;",
  "create function public.media_object_path_from_public_url(p_url text) returns text language sql immutable as $$ select case when p_url is null then null when position('/storage/v1/object/public/media/' in p_url) > 0 then split_part(substr(p_url, position('/storage/v1/object/public/media/' in p_url) + length('/storage/v1/object/public/media/')), '?', 1) else null end $$;",
  "create function public.create_notification(uuid,uuid,text,text,text,uuid,uuid,uuid,text,jsonb) returns uuid language plpgsql as $$ begin if current_setting('test.fail_notification', true) = 'true' then raise exception 'test_notification_failure'; end if; if current_setting('test.fail_notification_after_first', true) = 'true' and (select count(*) from public.test_notifications) > coalesce(nullif(current_setting('test.notification_fail_base', true), '')::integer, 0) then raise exception 'test_notification_failure_after_first'; end if; insert into public.test_notifications (recipient_user_id, notification_type, related_url, metadata) values ($1, $3, $9, $10); return null; end $$;",
  "create function public.can_access_record(uuid) returns boolean language sql as $$ select false $$;",
  "create function public.is_experience_card_public(uuid) returns boolean language sql as $$ select false $$;",
  "create function public.can_access_market_post(uuid) returns boolean language sql as $$ select false $$;",
  "create function public.can_read_public_record_media_object(text) returns boolean language sql as $$ select false $$;",
  "create function public.can_read_public_market_media_object(text) returns boolean language sql as $$ select false $$;",
  "create function public.admin_update_support_submission(uuid,text,text,text) returns jsonb language sql as $$ select jsonb_build_object('ok', false, 'error', 'stub') $$;",
  "create function public.test_support_submission_audit() returns trigger language plpgsql as $$ begin insert into public.support_submission_admin_events (submission_id, actor_id, previous_status, next_status, resolution, admin_note) values (new.id, auth.uid(), old.status, new.status, new.resolution, new.admin_note); return new; end $$;",
  "create trigger support_submission_admin_audit_after_update after update on public.support_submissions for each row execute function public.test_support_submission_audit();",
  "alter table public.records enable row level security;",
  "alter table public.media enable row level security;",
  "alter table public.market_posts enable row level security;",
  "alter table public.market_media enable row level security;",
  "alter table storage.objects enable row level security;",
  "create policy records_select_own_or_public on public.records for select using (true);",
  "create policy media_select_own_or_public_record on public.media for select using (true);",
  "create policy market_posts_select_public_or_own on public.market_posts for select using (true);",
  "create policy market_media_select_visible_post on public.market_media for select using (true);",
  "create policy storage_owner_select on storage.objects for select to authenticated using (owner_id = auth.uid()::text);",
  "create policy media_public_record_select on storage.objects for select to anon, authenticated using (true);",
  "create policy media_public_market_select on storage.objects for select to anon, authenticated using (true);",
  "create view public.discovery_feed_view as select null::uuid as record_id, null::uuid as archive_id, null::uuid as user_id, null::text as note, null::timestamptz as record_time, null::text as status_tag, null::text as primary_image_url, null::integer as comment_count, null::integer as media_count, null::text as archive_title, null::text as archive_category, null::uuid as species_id, null::text as species_name_snapshot, null::text as username, null::text as avatar_url, null::text as system_name, null::integer as archive_record_count, null::bigint as archive_view_count, null::text as archive_status, null::timestamptz as archive_ended_at, null::text as archive_help_status, null::timestamptz as archive_help_opened_at, null::timestamptz as archive_help_resolved_at where false;",
  "create view public.discovery_view as select null::uuid as id, null::uuid as archive_id, null::text as note, null::timestamptz as record_time, null::uuid as user_id, null::text as archive_title, null::text as username, null::text as image_url, null::bigint as rn_archive, null::bigint as rn_user where false;",
  "create view public.discovery_project_feed_view as select null::uuid as archive_id, null::uuid as owner_user_id, null::text as archive_title, null::text as category, null::text as system_name, null::text as archive_summary, null::timestamptz as archive_created_at, null::timestamptz as archive_ended_at, null::uuid as latest_public_record_id, null::text as latest_public_record_note, null::timestamptz as latest_public_record_time, null::timestamptz as latest_public_record_created_at, null::text as latest_public_primary_image_url, null::text as species_name_snapshot, null::bigint as public_record_count, null::bigint as public_comment_count, null::boolean as has_public_help, null::timestamptz as public_activity_at, null::text as profile_display_name, null::text as profile_avatar_url, null::text as profile_region where false;",
  "grant usage on schema auth, storage to anon, authenticated, service_role;",
  "grant select on public.records, public.archives, public.media, public.market_posts, public.market_media, public.public_profiles to anon, authenticated;",
  "grant select on storage.objects to anon, authenticated;"
].join("\n");

const ids = {
  owner: "10000000-0000-4000-8000-000000000001",
  admin: "10000000-0000-4000-8000-000000000002",
  reporter: "10000000-0000-4000-8000-000000000003",
  ownerB: "10000000-0000-4000-8000-000000000004",
  archiveA: "20000000-0000-4000-8000-000000000001",
  recordA: "30000000-0000-4000-8000-000000000001",
  reportA: "40000000-0000-4000-8000-000000000001",
  requestA: "50000000-0000-4000-8000-000000000001",
  requestRestore: "50000000-0000-4000-8000-000000000002",
  requestHideAgain: "50000000-0000-4000-8000-000000000006",
  requestLinkA: "50000000-0000-4000-8000-000000000004",
  requestRollbackLinkA: "50000000-0000-4000-8000-000000000005",
  requestNoopA: "50000000-0000-4000-8000-000000000008",
  requestStaleA: "50000000-0000-4000-8000-000000000009",
  archiveB: "20000000-0000-4000-8000-000000000002",
  recordB: "30000000-0000-4000-8000-000000000002",
  mediaA: "60000000-0000-4000-8000-000000000001",
  mediaB: "60000000-0000-4000-8000-000000000002",
  postB: "70000000-0000-4000-8000-000000000001",
  marketMediaB: "80000000-0000-4000-8000-000000000001",
  postIndependent: "70000000-0000-4000-8000-000000000002",
  marketMediaIndependent: "80000000-0000-4000-8000-000000000002",
  reservationIndependent: "90000000-0000-4000-8000-000000000001",
  postCover: "70000000-0000-4000-8000-000000000003",
  reservationCover: "90000000-0000-4000-8000-000000000002",
  archiveC: "20000000-0000-4000-8000-000000000003",
  recordC: "30000000-0000-4000-8000-000000000003",
  reportC: "40000000-0000-4000-8000-000000000003",
  reportC2: "40000000-0000-4000-8000-000000000007",
  reportA2: "40000000-0000-4000-8000-000000000004",
  reportA3: "40000000-0000-4000-8000-000000000005",
  reportA4: "40000000-0000-4000-8000-000000000006",
  requestC: "50000000-0000-4000-8000-000000000003",
  requestC2: "50000000-0000-4000-8000-000000000007",
  archiveForeign: "20000000-0000-4000-8000-000000000004",
  recordForeign: "30000000-0000-4000-8000-000000000004",
  mediaForeign: "60000000-0000-4000-8000-000000000006",
  postSharedAttack: "70000000-0000-4000-8000-000000000005",
  marketMediaSharedAttack: "80000000-0000-4000-8000-000000000005",
};

async function setAuth(db, userId, adminId = ids.admin) {
  await db.query(
    "select set_config('request.jwt.claim.sub', $1, false), set_config('test.admin_id', $2, false)",
    [userId ?? "", adminId ?? ""]
  );
}

async function scalar(db, sql, params = []) {
  const result = await db.query(sql, params);
  return result.rows[0]?.value;
}

test("ADM migration contains only the frozen R05/R06 SQL object whitelist", () => {
  const functionNames = [...migration.matchAll(/create or replace function public\.([a-z0-9_]+)\s*\(/gi)]
    .map((match) => match[1]).sort();
  assert.deepEqual(functionNames, [
    "admin_list_record_moderation_events",
    "admin_moderate_record",
    "admin_update_support_submission",
    "can_access_market_media",
    "can_access_market_post",
    "can_access_record",
    "can_read_public_market_media_object",
    "can_read_public_record_media_object",
    "get_my_record_moderation_status",
    "is_experience_card_public",
    "is_record_effectively_public",
    "reject_record_moderation_event_mutation",
  ].sort());

  const tableNames = [...migration.matchAll(/create table public\.([a-z0-9_]+)/gi)]
    .map((match) => match[1]).sort();
  assert.deepEqual(tableNames, ["record_moderation_events", "record_moderation_states"]);
  assert.match(migration, /id uuid primary key default pg_catalog\.gen_random_uuid\(\)/i);
  assert.doesNotMatch(migration, /record_moderation_events_id_seq/);
  assert.doesNotMatch(
    migration,
    /create table public\.record_moderation_events\s*\([\s\S]*?references public\.records/i
  );

  const viewNames = [...migration.matchAll(/create or replace view public\.([a-z0-9_]+)/gi)]
    .map((match) => match[1]).sort();
  assert.deepEqual(viewNames, [
    "discovery_feed_view",
    "discovery_project_feed_view",
    "discovery_view",
    "public_guide_record_projection",
  ]);

  const policyNames = [...migration.matchAll(/create policy ([a-z0-9_]+)/gi)]
    .map((match) => match[1]).sort();
  assert.deepEqual(policyNames, [
    "market_media_select_visible_post",
    "market_posts_select_public_or_own",
    "media_public_market_select",
    "media_public_record_select",
    "media_select_own_or_public_record",
    "records_select_own_or_public",
  ]);

  const triggerNames = [...migration.matchAll(/create trigger ([a-z0-9_]+)/gi)]
    .map((match) => match[1]);
  assert.deepEqual(triggerNames, ["record_moderation_events_immutable_guard"]);
  assert.doesNotMatch(migration, /\bcreate\s+(?:unique\s+)?index\b/i);

  const alteredTables = [...migration.matchAll(/alter table public\.([a-z0-9_]+)/gi)]
    .map((match) => match[1]).sort();
  assert.deepEqual(alteredTables, ["record_moderation_events", "record_moderation_states"]);
  assert.match(migration, /security_invoker\s*=\s*true,\s*security_barrier\s*=\s*true/i);
  assert.match(migration, /record_moderation_events_are_immutable/);
  assert.match(migration, /on conflict \(request_id\) do nothing/i);
  assert.match(migration, /action text not null check \(action in \('hide', 'restore', 'report_only'\)\)/i);
  assert.match(migration, /action = 'report_only' and next_version = previous_version/i);
  assert.match(migration, /request_id uuid not null unique/i);
  assert.match(preflightMatch[1], /storage\.buckets/);
  assert.match(mediaBucketGuard, /b\.id = 'media'[\s\S]*b\.public is false/i);
});

test("R09 live-QA preflight treats legacy Trial permissions as absent and rejects their reappearance", async () => {
  const requiredFunctions = preflightMatch[1]
    .split("  foreach v_missing in array array[")[2]
    ?.split("  ] loop")[0];
  assert.ok(requiredFunctions);
  assert.doesNotMatch(requiredFunctions, /can_read_trial_cloud_owner|can_read_trial_media_path/);

  const canAccessRecord = migration.match(
    /create or replace function public\.can_access_record\([\s\S]*?\$\$;/i
  )?.[0];
  assert.ok(canAccessRecord);
  assert.doesNotMatch(canAccessRecord, /can_read_trial_cloud_owner|can_read_trial_media_path/);
  assert.match(canAccessRecord, /auth\.uid\(\)\s*=\s*r\.user_id/);
  assert.match(canAccessRecord, /public\.is_record_effectively_public\(r\.id\)/);

  const db = new PGlite();
  try {
    await db.exec(setupSql);
    const runGuard = () => db.exec(`
      do $adm_trial_absence_test$
      declare
        v_failures text[] := array[]::text[];
      begin
        ${legacyTrialGuard}
        if cardinality(v_failures) > 0 then
          raise exception using errcode = '55000',
            message = 'legacy_trial_guard_failed: ' || array_to_string(v_failures, '; ');
        end if;
      end;
      $adm_trial_absence_test$;
    `);

    await runGuard();
    await db.exec(
      "create policy trial_cloud_archives_read on public.archives for select using (true);"
    );
    await assert.rejects(runGuard(), /legacy_trial_restrictive_policy_unexpectedly_present/);
    await db.exec("drop policy trial_cloud_archives_read on public.archives;");

    await db.exec(
      "create function public.can_read_trial_cloud_owner(uuid) returns boolean language sql as $$ select true $$;"
    );
    await assert.rejects(runGuard(), /legacy_trial_permission_helper_unexpectedly_present/);
    await db.exec("drop function public.can_read_trial_cloud_owner(uuid);");

    await db.exec(
      "create function public.can_read_trial_media_path(text) returns boolean language sql as $$ select true $$;"
    );
    await assert.rejects(runGuard(), /legacy_trial_permission_helper_unexpectedly_present/);
  } finally {
    await db.close();
  }
});

test("R10 Preflight requires the media bucket to exist and remain private", async () => {
  const db = new PGlite();
  try {
    await db.exec(setupSql);
    const runGuard = () => db.exec(`
      do $adm_media_bucket_test$
      declare
        v_failures text[] := array[]::text[];
      begin
        ${mediaBucketGuard}
        if cardinality(v_failures) > 0 then
          raise exception using errcode = '55000',
            message = 'media_bucket_guard_failed: ' || array_to_string(v_failures, '; ');
        end if;
      end;
      $adm_media_bucket_test$;
    `);

    await runGuard();
    await db.exec("update storage.buckets set public = true where id = 'media';");
    await assert.rejects(runGuard(), /media_bucket_missing_or_public/);
    await db.exec("update storage.buckets set public = false where id = 'media';");
    await db.exec("delete from storage.buckets where id = 'media';");
    await assert.rejects(runGuard(), /media_bucket_missing_or_public/);
  } finally {
    await db.close();
  }
});

test("R10 preflight pins the full live-QA RLS policy inventory and moderation lock order", () => {
  assert.match(preflightMatch[1], /d3208c0bceae6563bab8f7a55b4bd3d2/);
  for (const relation of [
    "('public','archives')",
    "('public','archive_cycles')",
    "('public','record_tags')",
    "('public','records')",
    "('public','media')",
    "('public','experience_cards')",
    "('public','experience_card_records')",
    "('public','market_posts')",
    "('public','market_media')",
    "('public','storage_upload_reservations')",
    "('public','storage_upload_reservation_paths')",
    "('public','support_submissions')",
    "('public','support_submission_admin_events')",
    "('storage','objects')",
  ]) {
    assert.ok(preflightMatch[1].includes(relation), `missing RLS policy inventory relation: ${relation}`);
  }

  const moderation = migration.match(
    /create or replace function public\.admin_moderate_record\([\s\S]*?\$\$;/i
  )?.[0];
  assert.ok(moderation);
  const recordLock = moderation.indexOf("from public.records r\n  where r.id = p_record_id\n  for update");
  const archiveLock = moderation.indexOf("from public.archives a\n  where a.id = v_record.archive_id\n  for update");
  const stateLock = moderation.indexOf("from public.record_moderation_states s\n  where s.record_id = p_record_id\n  for update");
  assert.ok(recordLock >= 0 && archiveLock > recordLock && stateLock > archiveLock);
  assert.ok((moderation.match(/order by s\.id\s+for update/gi) ?? []).length >= 2);
  assert.match(migration, /request_id uuid not null unique/i);
});

test("ADM migration installs in an isolated ephemeral PostgreSQL instance and enforces atomic moderation", async () => {
  const db = new PGlite();
  try {
    await db.exec(setupSql);

    await db.exec(migrationForPglite);

    await db.query(
      "insert into public.archives (id, user_id, is_public, title, cover_image_path) values ($1, $2, true, 'A', 'records/a/main.jpg')",
      [ids.archiveA, ids.owner]
    );
    await db.query(
      "insert into public.records (id, archive_id, user_id, visibility, note, record_time, primary_image_path) values ($1, $2, $3, 'public', 'A public record', now(), 'records/a/main.jpg')",
      [ids.recordA, ids.archiveA, ids.owner]
    );
    await db.query(
      "insert into public.media (id, user_id, record_id, storage_path, thumb_path) values ($1, $2, $3, 'records/a/main.jpg', 'records/a/thumb.jpg')",
      [ids.mediaA, ids.owner, ids.recordA]
    );
    await db.query(
      "insert into storage.objects (bucket_id, name) values ('media', 'records/a/main.jpg'), ('media', 'records/a/thumb.jpg'), ('media', 'records/b/main.jpg'), ('media', 'records/b/thumb.jpg'), ('media', 'records/b/primary-only.jpg'), ('media', 'records/b/primary-only-thumb.jpg'), ('media', 'records/b/wrong-owner.jpg'), ('media', 'records/b/wrong-storage-owner.jpg'), ('media', 'market/cover/main.jpg'), ('media', 'market/cover/thumb.jpg')"
    );

    const targetHashA = (await db.query("select md5($1::text) as value", [ids.recordA])).rows[0].value;
    const targetKeyA = "record:" + targetHashA;
    await db.query(
      "insert into public.support_submissions (id, user_id, kind, category, status, target_type, target_id, target_key) values ($1, $2, 'report', 'violence_threat_hate', 'submitted', 'record', $3, $4)",
      [ids.reportA, ids.reporter, ids.recordA, targetKeyA]
    );

    await setAuth(db, ids.admin);
    const hide = await db.query(
      "select public.admin_moderate_record($1, 'hide', 'violence_threat_hate', 'validated report', $2, 0, $3) as result",
      [ids.recordA, ids.requestA, ids.reportA]
    );
    assert.equal(hide.rows[0].result.ok, true);
    assert.equal(hide.rows[0].result.is_hidden, true);
    assert.equal(Number(hide.rows[0].result.version), 1);
    assert.equal(hide.rows[0].result.updated_count, 1);

    const state = await db.query(
      "select is_hidden, version from public.record_moderation_states where record_id = $1",
      [ids.recordA]
    );
    assert.equal(state.rows[0].is_hidden, true);
    assert.equal(Number(state.rows[0].version), 1);

    const report = await db.query(
      "select status, resolution from public.support_submissions where id = $1",
      [ids.reportA]
    );
    assert.equal(report.rows[0].status, "resolved");
    assert.equal(report.rows[0].resolution, "action_taken");

    assert.equal(await scalar(db, "select count(*)::int as value from public.record_moderation_events"), 1);
    assert.equal(await scalar(db, "select count(*)::int as value from public.support_submission_admin_events"), 1);
    assert.equal(await scalar(db, "select count(*)::int as value from public.test_notifications"), 1);
    assert.equal(await scalar(db, "select public.is_record_effectively_public($1) as value", [ids.recordA]), false);
    assert.equal(await scalar(db, "select public.can_read_public_record_media_object('records/a/main.jpg') as value"), false);
    await setAuth(db, null, ids.admin);
    await db.query("set role anon");
    const hiddenStorageObject = await db.query("select name from storage.objects where bucket_id = 'media' and name = 'records/a/main.jpg'");
    assert.equal(hiddenStorageObject.rows.length, 0);
    await assert.rejects(db.query("select * from public.record_moderation_states"), /permission denied/);
    await assert.rejects(db.query("select * from public.record_moderation_events"), /permission denied/);
    await db.query("reset role");

    await setAuth(db, ids.admin);
    const replay = await db.query(
      "select public.admin_moderate_record($1, 'hide', 'violence_threat_hate', 'validated report', $2, 0, $3) as result",
      [ids.recordA, ids.requestA, ids.reportA]
    );
    assert.equal(replay.rows[0].result.ok, true);
    assert.equal(replay.rows[0].result.already_applied, true);
    assert.equal(await scalar(db, "select count(*)::int as value from public.record_moderation_events"), 1);
    assert.equal(await scalar(db, "select count(*)::int as value from public.test_notifications"), 1);

    const conflict = await db.query(
      "select public.admin_moderate_record($1, 'hide', 'violence_threat_hate', 'different note', $2, 0, $3) as result",
      [ids.recordA, ids.requestA, ids.reportA]
    );
    assert.equal(conflict.rows[0].result.error, "request_id_conflict");

    const legacyActionTaken = await db.query(
      "select public.admin_update_support_submission($1, 'resolved', 'action_taken', 'must not bypass') as result",
      [ids.reportA]
    );
    assert.equal(legacyActionTaken.rows[0].result.error, "moderation_rpc_required");

    await db.query(
      "insert into public.support_submissions (id, user_id, kind, category, status, target_type, target_id, target_key) values ($1, $2, 'report', 'violence_threat_hate', 'submitted', 'record', $3, $4), ($5, $2, 'report', 'violence_threat_hate', 'needs_info', 'record', $3, $4)",
      [ids.reportA2, ids.reporter, ids.recordA, targetKeyA, ids.reportA3]
    );
    const linkedExistingHide = await db.query(
      "select public.admin_moderate_record($1, 'hide', 'violence_threat_hate', 'follow-up reports', $2, 1, $3) as result",
      [ids.recordA, ids.requestLinkA, ids.reportA2]
    );
    assert.equal(linkedExistingHide.rows[0].result.ok, true);
    assert.equal(linkedExistingHide.rows[0].result.linked_existing_hide, true);
    assert.equal(linkedExistingHide.rows[0].result.already_applied, false);
    assert.ok(linkedExistingHide.rows[0].result.event_id);
    assert.equal(linkedExistingHide.rows[0].result.action, "report_only");
    assert.equal(linkedExistingHide.rows[0].result.updated_count, 2);
    assert.equal(Number(linkedExistingHide.rows[0].result.version), 1);
    assert.equal(
      await scalar(db, "select count(*)::int as value from public.record_moderation_events"),
      2
    );
    const reportOnlyEvent = await db.query(
      "select action, previous_is_hidden, next_is_hidden, previous_version, next_version, previous_effective_public, next_effective_public from public.record_moderation_events where request_id = $1",
      [ids.requestLinkA]
    );
    assert.deepEqual(
      reportOnlyEvent.rows.map((row) => [row.action, row.previous_is_hidden, row.next_is_hidden, Number(row.previous_version), Number(row.next_version), row.previous_effective_public, row.next_effective_public]),
      [["report_only", true, true, 1, 1, false, false]]
    );
    assert.equal(
      await scalar(db, "select count(*)::int as value from public.support_submission_admin_events"),
      3
    );
    assert.equal(
      await scalar(db, "select count(*)::int as value from public.test_notifications"),
      3
    );
    const linkedReports = await db.query(
      "select id, status, resolution from public.support_submissions where id in ($1, $2) order by id",
      [ids.reportA2, ids.reportA3]
    );
    assert.deepEqual(
      linkedReports.rows.map((row) => [row.status, row.resolution]),
      [["resolved", "action_taken"], ["resolved", "action_taken"]]
    );
    const linkedState = await db.query(
      "select is_hidden, version, source_submission_id, last_request_id from public.record_moderation_states where record_id = $1",
      [ids.recordA]
    );
    assert.equal(linkedState.rows[0].is_hidden, true);
    assert.equal(Number(linkedState.rows[0].version), 1);
    assert.equal(linkedState.rows[0].source_submission_id, ids.reportA2);
    assert.equal(linkedState.rows[0].last_request_id, ids.requestLinkA);

    const linkedReplay = await db.query(
      "select public.admin_moderate_record($1, 'hide', 'violence_threat_hate', 'follow-up reports', $2, 1, $3) as result",
      [ids.recordA, ids.requestLinkA, ids.reportA2]
    );
    assert.equal(linkedReplay.rows[0].result.ok, true, JSON.stringify(linkedReplay.rows[0].result));
    assert.equal(linkedReplay.rows[0].result.already_applied, true);
    assert.equal(linkedReplay.rows[0].result.linked_existing_hide, true);
    assert.equal(linkedReplay.rows[0].result.event_id, linkedExistingHide.rows[0].result.event_id);
    assert.equal(
      await scalar(db, "select count(*)::int as value from public.record_moderation_events"),
      2
    );
    assert.equal(
      await scalar(db, "select count(*)::int as value from public.test_notifications"),
      3
    );
    const linkedConflict = await db.query(
      "select public.admin_moderate_record($1, 'hide', 'violence_threat_hate', 'different note', $2, 1, $3) as result",
      [ids.recordA, ids.requestLinkA, ids.reportA2]
    );
    assert.equal(linkedConflict.rows[0].result.error, "request_id_conflict");
    const linkedCrossActionConflict = await db.query(
      "select public.admin_moderate_record($1, 'restore', null, 'wrong action reuse', $2, 1, null) as result",
      [ids.recordA, ids.requestLinkA]
    );
    assert.equal(linkedCrossActionConflict.rows[0].result.error, "request_id_conflict");
    // New request IDs do not turn one already-closed report into new audit evidence.
    const newlyNamedReplay = await db.query(
      "select public.admin_moderate_record($1, 'hide', 'violence_threat_hate', 'follow-up reports', $2, 1, $3) as result",
      [ids.recordA, ids.requestNoopA, ids.reportA2]
    );
    assert.equal(newlyNamedReplay.rows[0].result.ok, false);
    assert.equal(newlyNamedReplay.rows[0].result.error, "already_resolved");
    assert.equal(newlyNamedReplay.rows[0].result.no_change, true);
    const staleResolvedAttempt = await db.query(
      "select public.admin_moderate_record($1, 'hide', 'violence_threat_hate', 'follow-up reports', $2, 0, $3) as result",
      [ids.recordA, ids.requestStaleA, ids.reportA2]
    );
    assert.equal(staleResolvedAttempt.rows[0].result.error, "version_conflict");
    assert.equal(await scalar(db, "select count(*)::int as value from public.record_moderation_events"), 2);
    assert.equal(await scalar(db, "select count(*)::int as value from public.support_submission_admin_events"), 3);
    assert.equal(await scalar(db, "select count(*)::int as value from public.test_notifications"), 3);


    await db.query(
      "insert into public.support_submissions (id, user_id, kind, category, status, target_type, target_id, target_key) values ($1, $2, 'report', 'violence_threat_hate', 'submitted', 'record', $3, $4)",
      [ids.reportA4, ids.reporter, ids.recordA, targetKeyA]
    );
    await db.query("select set_config('test.fail_notification', 'true', false)");
    await assert.rejects(
      db.query(
        "select public.admin_moderate_record($1, 'hide', 'violence_threat_hate', 'rollback linked report', $2, 1, $3)",
        [ids.recordA, ids.requestRollbackLinkA, ids.reportA4]
      ),
      /test_notification_failure/
    );
    await db.query("select set_config('test.fail_notification', 'false', false)");
    const rolledBackLinkedReport = await db.query(
      "select status, resolution from public.support_submissions where id = $1",
      [ids.reportA4]
    );
    assert.equal(rolledBackLinkedReport.rows[0].status, "submitted");
    assert.equal(rolledBackLinkedReport.rows[0].resolution, null);
    const stateAfterLinkedRollback = await db.query(
      "select source_submission_id, last_request_id, version, is_hidden from public.record_moderation_states where record_id = $1",
      [ids.recordA]
    );
    assert.equal(stateAfterLinkedRollback.rows[0].source_submission_id, ids.reportA2);
    assert.equal(stateAfterLinkedRollback.rows[0].last_request_id, ids.requestLinkA);
    assert.equal(Number(stateAfterLinkedRollback.rows[0].version), 1);
    assert.equal(stateAfterLinkedRollback.rows[0].is_hidden, true);
    assert.equal(
      await scalar(db, "select count(*)::int as value from public.record_moderation_events"),
      2
    );
    assert.equal(
      await scalar(db, "select count(*)::int as value from public.support_submission_admin_events"),
      3
    );
    assert.equal(
      await scalar(db, "select count(*)::int as value from public.test_notifications"),
      3
    );

    await setAuth(db, ids.admin);
    assert.equal(await scalar(db, "select public.can_access_record($1) as value", [ids.recordA]), false);
    assert.equal(
      await scalar(db, "select public.can_read_public_record_media_object('records/a/main.jpg') as value"),
      false
    );
    await db.query("set role authenticated");
    const adminCannotReadHiddenRecord = await db.query(
      "select id from public.records where id = $1",
      [ids.recordA]
    );
    assert.equal(adminCannotReadHiddenRecord.rows.length, 0);
    await db.query("reset role");

    await setAuth(db, ids.owner);
    const ownerStatus = await db.query(
      "select * from public.get_my_record_moderation_status($1)",
      [ids.recordA]
    );
    assert.equal(ownerStatus.rows.length, 1);
    assert.equal(ownerStatus.rows[0].is_hidden, true);
    assert.equal(Number(ownerStatus.rows[0].version), 1);
    assert.equal(await scalar(db, "select public.can_access_record($1) as value", [ids.recordA]), true);
    await db.query("set role authenticated");
    const ownerRecordRead = await db.query("select id from public.records where id = $1", [ids.recordA]);
    const ownerMediaRead = await db.query("select id from public.media where id = $1", [ids.mediaA]);
    assert.equal(ownerRecordRead.rows.length, 1);
    assert.equal(ownerMediaRead.rows.length, 1);
    await assert.rejects(
      db.query("select * from public.record_moderation_states"),
      /permission denied/
    );
    await db.query("reset role");

    await setAuth(db, ids.reporter);
    const nonOwnerStatus = await db.query(
      "select * from public.get_my_record_moderation_status($1)",
      [ids.recordA]
    );
    assert.equal(nonOwnerStatus.rows.length, 0);
    assert.equal(await scalar(db, "select public.can_access_record($1) as value", [ids.recordA]), false);
    await db.query("set role authenticated");
    const nonOwnerRecordRead = await db.query("select id from public.records where id = $1", [ids.recordA]);
    const nonOwnerMediaRead = await db.query("select id from public.media where id = $1", [ids.mediaA]);
    assert.equal(nonOwnerRecordRead.rows.length, 0);
    assert.equal(nonOwnerMediaRead.rows.length, 0);
    const deniedModeration = await db.query(
      "select public.admin_moderate_record($1, 'hide', 'violence_threat_hate', 'not admin', $2, 1, null) as result",
      [ids.recordA, ids.requestC]
    );
    assert.equal(deniedModeration.rows[0].result.error, "permission_denied");
    const nonAdminEvents = await db.query(
      "select * from public.admin_list_record_moderation_events($1, 50, 0)",
      [ids.recordA]
    );
    assert.equal(nonAdminEvents.rows.length, 0);
    await assert.rejects(
      db.query("select * from public.record_moderation_events"),
      /permission denied/
    );
    await db.query("reset role");
    await db.query("set role service_role");
    await assert.rejects(
      db.query("select * from public.record_moderation_events"),
      /permission denied/
    );
    await db.query("reset role");

    await setAuth(db, ids.admin);
    await db.query("update public.records set visibility = 'private' where id = $1", [ids.recordA]);
    const restore = await db.query(
      "select public.admin_moderate_record($1, 'restore', null, 'owner changed visibility', $2, 1, null) as result",
      [ids.recordA, ids.requestRestore]
    );
    assert.equal(restore.rows[0].result.ok, true);
    assert.equal(restore.rows[0].result.is_hidden, false);
    assert.equal(Number(restore.rows[0].result.version), 2);
    assert.equal(await scalar(db, "select public.is_record_effectively_public($1) as value", [ids.recordA]), false);
    const linkedReplayAfterRestore = await db.query(
      "select public.admin_moderate_record($1, 'hide', 'violence_threat_hate', 'follow-up reports', $2, 1, $3) as result",
      [ids.recordA, ids.requestLinkA, ids.reportA2]
    );
    assert.equal(linkedReplayAfterRestore.rows[0].result.ok, true);
    assert.equal(linkedReplayAfterRestore.rows[0].result.already_applied, true);
    assert.equal(linkedReplayAfterRestore.rows[0].result.action, "report_only");

    const events = await db.query(
      "select * from public.admin_list_record_moderation_events($1, 50, 0)",
      [ids.recordA]
    );
    assert.equal(events.rows.length, 3);
    assert.equal(Number(events.rows[0].next_version), 2);
    const firstAuditPage = await db.query(
      "select * from public.admin_list_record_moderation_events($1, 1, 0)",
      [ids.recordA]
    );
    const secondAuditPage = await db.query(
      "select * from public.admin_list_record_moderation_events($1, 1, 1)",
      [ids.recordA]
    );
    assert.equal(firstAuditPage.rows.length, 1);
    assert.equal(secondAuditPage.rows.length, 1);
    assert.notEqual(firstAuditPage.rows[0].event_id, secondAuditPage.rows[0].event_id);

    await assert.rejects(
      db.query("update public.record_moderation_events set admin_note = 'tamper' where record_id = $1", [ids.recordA]),
      /record_moderation_events_are_immutable/
    );
    await assert.rejects(
      db.query("delete from public.record_moderation_events where record_id = $1", [ids.recordA]),
      /record_moderation_events_are_immutable/
    );

    await db.query(
      "insert into public.archives (id, user_id, is_public, title) values ($1, $2, true, 'B')",
      [ids.archiveB, ids.owner]
    );
    await db.query(
      "insert into public.records (id, archive_id, user_id, visibility, note, record_time, primary_image_path, primary_thumb_path) values ($1, $2, $3, 'public', 'B public record', now(), 'records/b/primary-only.jpg', 'records/b/primary-only-thumb.jpg')",
      [ids.recordB, ids.archiveB, ids.owner]
    );
    await db.query(
      "insert into public.media (id, user_id, record_id, storage_path, thumb_path) values ($1, $2, $3, 'records/b/main.jpg', 'records/b/thumb.jpg')",
      [ids.mediaB, ids.owner, ids.recordB]
    );
    const linkedCrossRecordConflict = await db.query(
      "select public.admin_moderate_record($1, 'hide', 'violence_threat_hate', 'cross-record request reuse', $2, 0, null) as result",
      [ids.recordB, ids.requestLinkA]
    );
    assert.equal(linkedCrossRecordConflict.rows[0].result.error, "request_id_conflict");
    assert.equal(
      await scalar(db, "select public.can_read_public_record_media_object('records/b/primary-only.jpg') as value"),
      false
    );
    assert.equal(
      await scalar(db, "select public.can_read_public_record_media_object('records/b/primary-only-thumb.jpg') as value"),
      false
    );
    assert.equal(
      await scalar(db, "select public.can_read_public_record_media_object('records/b/main.jpg') as value"),
      true
    );
    assert.equal(
      await scalar(db, "select public.can_read_public_record_media_object('records/b/thumb.jpg') as value"),
      true
    );

    await db.query(
      "insert into public.media (id, user_id, record_id, storage_path, thumb_path) values ('60000000-0000-4000-8000-000000000003', $1, $2, 'records/a/main.jpg', 'records/a/thumb.jpg')",
      [ids.owner, ids.recordB]
    );
    assert.equal(await scalar(db, "select public.can_read_public_record_media_object('records/a/main.jpg') as value"), true);
    await db.query("set role anon");
    const sharedStorageObject = await db.query("select name from storage.objects where bucket_id = 'media' and name = 'records/a/main.jpg'");
    assert.equal(sharedStorageObject.rows.length, 1);
    await db.query("reset role");
    await db.query(
      "insert into public.media (id, user_id, record_id, storage_path) values ('60000000-0000-4000-8000-000000000004', $1, $2, 'records/b/wrong-owner.jpg')",
      [ids.reporter, ids.recordB]
    );
    assert.equal(await scalar(db, "select public.can_read_public_record_media_object('records/b/wrong-owner.jpg') as value"), false);
    await db.query(
      "update storage.objects set owner_id = $1 where bucket_id = 'media' and name = 'records/b/wrong-owner.jpg'",
      [ids.reporter]
    );
    await db.query(
      "insert into public.media (id, user_id, record_id, storage_path) values ('60000000-0000-4000-8000-000000000005', $1, $2, 'records/b/wrong-storage-owner.jpg')",
      [ids.owner, ids.recordB]
    );
    await db.query(
      "update storage.objects set owner_id = $1 where bucket_id = 'media' and name = 'records/b/wrong-storage-owner.jpg'",
      [ids.reporter]
    );
    assert.equal(
      await scalar(db, "select public.can_read_public_record_media_object('records/b/wrong-storage-owner.jpg') as value"),
      false
    );

    // Re-publish A only for this isolated case, then hide it again while B
    // remains a distinct valid public reference to the same Storage object.
    await db.query("update public.records set visibility = 'public' where id = $1", [ids.recordA]);
    const hideAgain = await db.query(
      "select public.admin_moderate_record($1, 'hide', 'violence_threat_hate', 'second hide for shared-reference test', $2, 2, null) as result",
      [ids.recordA, ids.requestHideAgain]
    );
    assert.equal(hideAgain.rows[0].result.ok, true);
    assert.equal(hideAgain.rows[0].result.is_hidden, true);
    assert.equal(Number(hideAgain.rows[0].result.version), 3);
    assert.equal(await scalar(db, "select public.is_record_effectively_public($1) as value", [ids.recordA]), false);
    assert.equal(
      await scalar(db, "select public.can_read_public_record_media_object('records/a/main.jpg') as value"),
      true
    );
    await db.query("set role anon");
    const sharedAfterAHidden = await db.query(
      "select name from storage.objects where bucket_id = 'media' and name = 'records/a/main.jpg'"
    );
    assert.equal(sharedAfterAHidden.rows.length, 1);
    await db.query("reset role");

    await setAuth(db, null, ids.admin);
    await db.query("set role anon");
    const guideRows = await db.query(
      "select id, archive_id, note, record_time, primary_image_url, visibility, created_at from public.public_guide_record_projection order by id"
    );
    await db.query("reset role");
    assert.deepEqual(guideRows.rows.map((row) => row.id).sort(), [ids.recordB].sort());

    await db.query(
      "insert into public.market_posts (id, user_id, status, source_record_id) values ('70000000-0000-4000-8000-000000000004', $1, 'active', $2)",
      [ids.owner, ids.recordA]
    );
    assert.equal(
      await scalar(db, "select public.can_access_market_post('70000000-0000-4000-8000-000000000004') as value"),
      false
    );
    await db.query(
      "insert into public.market_posts (id, user_id, status, source_record_id) values ('70000000-0000-4000-8000-000000000005', $1, 'active', $2)",
      [ids.owner, ids.recordB]
    );
    assert.equal(
      await scalar(db, "select public.can_access_market_post('70000000-0000-4000-8000-000000000005') as value"),
      true
    );

    await db.query(
      "insert into public.market_posts (id, user_id, status, source_record_id) values ($1, $2, 'active', null)",
      [ids.postB, ids.owner]
    );
    await db.query(
      "insert into public.market_media (id, user_id, market_post_id, path, thumb_path, source_media_id, source_record_id) values ($1, $2, $3, 'records/b/main.jpg', 'records/b/thumb.jpg', $4, $5)",
      [ids.marketMediaB, ids.owner, ids.postB, ids.mediaB, ids.recordB]
    );
    assert.equal(await scalar(db, "select public.can_access_market_media($1) as value", [ids.marketMediaB]), true);
    assert.equal(await scalar(db, "select public.can_read_public_market_media_object('records/b/main.jpg') as value"), true);

    await db.query(
      "insert into public.market_media (id, user_id, market_post_id, path, source_media_id, source_record_id) values ('80000000-0000-4000-8000-000000000003', $1, $2, 'records/a/main.jpg', $3, $4)",
      [ids.owner, ids.postB, ids.mediaA, ids.recordA]
    );
    assert.equal(await scalar(db, "select public.can_access_market_media('80000000-0000-4000-8000-000000000003') as value"), false);

    await db.query(
      "insert into public.market_posts (id, user_id, status) values ($1, $2, 'active')",
      [ids.postIndependent, ids.owner]
    );
    await db.query(
      "insert into public.storage_upload_reservations (id, owner_user_id, target_type, target_id, target_parent_id, status, reserved_bytes, actual_bytes) values ($1, $2, 'market_media', $3, $4, 'reserved', 200, null)",
      [ids.reservationIndependent, ids.owner, ids.marketMediaIndependent, ids.postIndependent]
    );
    await db.query(
      "insert into public.storage_upload_reservation_paths (id, reservation_id, owner_user_id, object_path, path_kind, reserved_bytes, actual_bytes, active, deactivated_at) values ('91000000-0000-4000-8000-000000000001', $1, $2, 'market/unreserved/main.jpg', 'main', 120, null, true, null), ('91000000-0000-4000-8000-000000000002', $1, $2, 'market/unreserved/thumb.jpg', 'thumb', 60, null, true, null)",
      [ids.reservationIndependent, ids.owner]
    );
    // The existing BEFORE INSERT market-media settlement trigger first sees
    // uploaded objects and a reserved row, then settles the reservation and
    // deactivates its path rows in the same insert transaction. PGlite's
    // fixture reproduces those exact persisted post-trigger values below.
    await db.query(
      "insert into storage.objects (bucket_id, name, owner_id) values ('media', 'market/unreserved/main.jpg', $1), ('media', 'market/unreserved/thumb.jpg', $1)",
      [ids.owner]
    );
    await db.query(
      "insert into public.market_media (id, user_id, market_post_id, path, thumb_path, upload_reservation_id) values ($1, $2, $3, 'market/unreserved/main.jpg', 'market/unreserved/thumb.jpg', $4)",
      [ids.marketMediaIndependent, ids.owner, ids.postIndependent, ids.reservationIndependent]
    );
    await db.query(
      "update public.storage_upload_reservations set status = 'settled', settled_at = now(), actual_bytes = 140 where id = $1",
      [ids.reservationIndependent]
    );
    await db.query(
      "update public.storage_upload_reservation_paths set actual_bytes = case path_kind when 'main' then 100 else 40 end, active = false, deactivated_at = now() where reservation_id = $1",
      [ids.reservationIndependent]
    );
    await db.query(
      "insert into public.storage_upload_reservation_paths (id, reservation_id, owner_user_id, object_path, path_kind, reserved_bytes, actual_bytes, active, deactivated_at) values ('91000000-0000-4000-8000-000000000003', $1, $2, 'market/unreserved/extra.jpg', 'extra', 1, 1, false, now())",
      [ids.reservationIndependent, ids.owner]
    );
    assert.equal(await scalar(db, "select public.can_access_market_media($1) as value", [ids.marketMediaIndependent]), false);
    await db.query(
      "delete from public.storage_upload_reservation_paths where id = '91000000-0000-4000-8000-000000000003'"
    );
    assert.equal(await scalar(db, "select public.can_access_market_media($1) as value", [ids.marketMediaIndependent]), true);
    assert.equal(await scalar(db, "select public.can_read_public_market_media_object('market/unreserved/main.jpg') as value"), true);
    assert.equal(await scalar(db, "select public.can_read_public_market_media_object('market/unreserved/thumb.jpg') as value"), true);

    await db.query(
      "update public.storage_upload_reservations set actual_bytes = 139 where id = $1",
      [ids.reservationIndependent]
    );
    assert.equal(await scalar(db, "select public.can_access_market_media($1) as value", [ids.marketMediaIndependent]), false);
    assert.equal(await scalar(db, "select public.can_read_public_market_media_object('market/unreserved/main.jpg') as value"), false);
    await db.query(
      "update public.storage_upload_reservations set actual_bytes = 140 where id = $1",
      [ids.reservationIndependent]
    );

    await db.query(
      "update public.storage_upload_reservation_paths set actual_bytes = 39 where reservation_id = $1 and path_kind = 'thumb'",
      [ids.reservationIndependent]
    );
    assert.equal(await scalar(db, "select public.can_access_market_media($1) as value", [ids.marketMediaIndependent]), false);
    await db.query(
      "update public.storage_upload_reservation_paths set actual_bytes = 40 where reservation_id = $1 and path_kind = 'thumb'",
      [ids.reservationIndependent]
    );

    await db.query(
      "update public.storage_upload_reservation_paths set actual_bytes = 99 where reservation_id = $1 and path_kind = 'main'",
      [ids.reservationIndependent]
    );
    assert.equal(await scalar(db, "select public.can_access_market_media($1) as value", [ids.marketMediaIndependent]), false);
    await db.query(
      "update public.storage_upload_reservation_paths set actual_bytes = 100 where reservation_id = $1 and path_kind = 'main'",
      [ids.reservationIndependent]
    );

    await db.query(
      "update public.storage_upload_reservation_paths set reserved_bytes = 39 where reservation_id = $1 and path_kind = 'thumb'",
      [ids.reservationIndependent]
    );
    assert.equal(await scalar(db, "select public.can_access_market_media($1) as value", [ids.marketMediaIndependent]), false);
    await db.query(
      "update public.storage_upload_reservation_paths set reserved_bytes = 60 where reservation_id = $1 and path_kind = 'thumb'",
      [ids.reservationIndependent]
    );

    await db.query(
      "update public.storage_upload_reservation_paths set object_path = 'market/unreserved/wrong-main.jpg' where reservation_id = $1 and path_kind = 'main'",
      [ids.reservationIndependent]
    );
    assert.equal(await scalar(db, "select public.can_access_market_media($1) as value", [ids.marketMediaIndependent]), false);
    await db.query(
      "update public.storage_upload_reservation_paths set object_path = 'market/unreserved/main.jpg' where reservation_id = $1 and path_kind = 'main'",
      [ids.reservationIndependent]
    );

    await db.query(
      "update public.storage_upload_reservations set target_id = '80000000-0000-4000-8000-000000000099' where id = $1",
      [ids.reservationIndependent]
    );
    assert.equal(await scalar(db, "select public.can_access_market_media($1) as value", [ids.marketMediaIndependent]), false);
    await db.query(
      "update public.storage_upload_reservations set target_id = $2 where id = $1",
      [ids.reservationIndependent, ids.marketMediaIndependent]
    );
    await db.query(
      "update public.storage_upload_reservations set target_parent_id = '70000000-0000-4000-8000-000000000099' where id = $1",
      [ids.reservationIndependent]
    );
    assert.equal(await scalar(db, "select public.can_access_market_media($1) as value", [ids.marketMediaIndependent]), false);
    await db.query(
      "update public.storage_upload_reservations set target_parent_id = $2 where id = $1",
      [ids.reservationIndependent, ids.postIndependent]
    );

    await db.query(
      "update public.storage_upload_reservations set status = 'reserved', settled_at = null where id = $1",
      [ids.reservationIndependent]
    );
    assert.equal(await scalar(db, "select public.can_access_market_media($1) as value", [ids.marketMediaIndependent]), false);
    await db.query(
      "update public.storage_upload_reservations set status = 'settled', settled_at = now() where id = $1",
      [ids.reservationIndependent]
    );

    await db.query(
      "delete from storage.objects where bucket_id = 'media' and name = 'market/unreserved/thumb.jpg'"
    );
    assert.equal(await scalar(db, "select public.can_access_market_media($1) as value", [ids.marketMediaIndependent]), false);
    await db.query(
      "insert into storage.objects (bucket_id, name, owner_id) values ('media', 'market/unreserved/thumb.jpg', $1)",
      [ids.owner]
    );

    await db.query(
      "update public.market_media set thumb_path = 'market/unreserved/wrong-thumb.jpg' where id = $1",
      [ids.marketMediaIndependent]
    );
    assert.equal(await scalar(db, "select public.can_access_market_media($1) as value", [ids.marketMediaIndependent]), false);
    await db.query(
      "update public.market_media set thumb_path = 'market/unreserved/thumb.jpg' where id = $1",
      [ids.marketMediaIndependent]
    );

    await db.query(
      "update storage.objects set owner_id = $1 where bucket_id = 'media' and name = 'market/unreserved/thumb.jpg'",
      [ids.reporter]
    );
    assert.equal(await scalar(db, "select public.can_access_market_media($1) as value", [ids.marketMediaIndependent]), false);
    await db.query(
      "update storage.objects set owner_id = $1 where bucket_id = 'media' and name = 'market/unreserved/thumb.jpg'",
      [ids.owner]
    );

    await db.query("set role anon");
    const independentMarketObject = await db.query("select name from storage.objects where bucket_id = 'media' and name = 'market/unreserved/main.jpg'");
    assert.equal(independentMarketObject.rows.length, 1);
    const independentMarketThumb = await db.query("select name from storage.objects where bucket_id = 'media' and name = 'market/unreserved/thumb.jpg'");
    assert.equal(independentMarketThumb.rows.length, 1);
    await db.query("reset role");

    await db.query(
      "insert into public.market_posts (id, user_id, status, cover_image_path, cover_thumb_path, cover_upload_reservation_id) values ($1, $2, 'active', 'market/cover/main.jpg', 'market/cover/thumb.jpg', $3)",
      [ids.postCover, ids.owner, ids.reservationCover]
    );
    await db.query(
      "insert into public.storage_upload_reservations (id, owner_user_id, target_type, target_id, target_parent_id, status, settled_at, reserved_bytes, actual_bytes) values ($1, $2, 'market_cover', $3, null, 'settled', now(), 200, 140)",
      [ids.reservationCover, ids.owner, ids.postCover]
    );
    await db.query(
      "insert into public.storage_upload_reservation_paths (id, reservation_id, owner_user_id, object_path, path_kind, reserved_bytes, actual_bytes, active, deactivated_at) values ('92000000-0000-4000-8000-000000000001', $1, $2, 'market/cover/main.jpg', 'main', 120, 100, false, now()), ('92000000-0000-4000-8000-000000000002', $1, $2, 'market/cover/thumb.jpg', 'thumb', 60, 40, false, now())",
      [ids.reservationCover, ids.owner]
    );
    assert.equal(await scalar(db, "select public.can_read_public_market_media_object('market/cover/main.jpg') as value"), true);
    assert.equal(await scalar(db, "select public.can_read_public_market_media_object('market/cover/thumb.jpg') as value"), true);
    await db.query(
      "update public.storage_upload_reservations set actual_bytes = 139 where id = $1",
      [ids.reservationCover]
    );
    assert.equal(await scalar(db, "select public.can_read_public_market_media_object('market/cover/main.jpg') as value"), false);
    assert.equal(await scalar(db, "select public.can_read_public_market_media_object('market/cover/thumb.jpg') as value"), false);
    await db.query(
      "update public.storage_upload_reservations set actual_bytes = 140 where id = $1",
      [ids.reservationCover]
    );
    await db.query("set role anon");
    const marketCoverObjects = await db.query("select name from storage.objects where bucket_id = 'media' and name in ('market/cover/main.jpg', 'market/cover/thumb.jpg')");
    assert.equal(marketCoverObjects.rows.length, 2);
    await db.query("reset role");
    await db.query("update public.market_posts set cover_thumb_path = 'market/cover/wrong-thumb.jpg' where id = $1", [ids.postCover]);
    assert.equal(await scalar(db, "select public.can_read_public_market_media_object('market/cover/main.jpg') as value"), false);
    assert.equal(await scalar(db, "select public.can_read_public_market_media_object('market/cover/thumb.jpg') as value"), false);

    await db.query(
      "insert into public.archives (id, user_id, is_public, title) values ($1, $2, true, 'C')",
      [ids.archiveC, ids.owner]
    );
    await db.query(
      "insert into public.records (id, archive_id, user_id, visibility, note, record_time) values ($1, $2, $3, 'public', 'C record', now())",
      [ids.recordC, ids.archiveC, ids.owner]
    );
    const targetHashC = (await db.query("select md5($1::text) as value", [ids.recordC])).rows[0].value;
    await db.query(
      "insert into public.support_submissions (id, user_id, kind, category, status, target_type, target_id, target_key) values ($1, $2, 'report', 'other_severe', 'submitted', 'record', $3, $4)",
      [ids.reportC, ids.reporter, ids.recordC, "record:" + targetHashC]
    );

    await setAuth(db, ids.admin);
    await db.query("select set_config('test.fail_notification', 'true', false)");
    await assert.rejects(
      db.query(
        "select public.admin_moderate_record($1, 'hide', 'other_severe', 'rollback test', $2, 0, $3)",
        [ids.recordC, ids.requestC, ids.reportC]
      ),
      /test_notification_failure/
    );
    await db.query("select set_config('test.fail_notification', 'false', false)");
    assert.equal(await scalar(db, "select count(*)::int as value from public.record_moderation_states where record_id = $1", [ids.recordC]), 0);
    const rolledBackReport = await db.query(
      "select status from public.support_submissions where id = $1",
      [ids.reportC]
    );
    assert.equal(rolledBackReport.rows[0].status, "submitted");
    assert.equal(await scalar(db, "select count(*)::int as value from public.record_moderation_events where record_id = $1", [ids.recordC]), 0);
    assert.equal(await scalar(db, "select count(*)::int as value from public.support_submission_admin_events where submission_id = $1", [ids.reportC]), 0);
    // When the second of two report notifications fails, the first notification
    // and every related report, moderation-state and audit write must roll back.
    await db.query(
      "insert into public.support_submissions (id,user_id,kind,category,status,target_type,target_id,target_key) values ($1,$2,'report','other_severe','submitted','record',$3,$4)",
      [ids.reportC2, ids.ownerB, ids.recordC, "record:" + targetHashC]
    );
    const notificationsBeforeSecondFailure = await scalar(
      db, "select count(*)::int as value from public.test_notifications"
    );
    await db.query("select set_config('test.notification_fail_base', $1, false)", [
      String(notificationsBeforeSecondFailure)
    ]);
    await db.query("select set_config('test.fail_notification_after_first', 'true', false)");
    await assert.rejects(
      db.query(
        "select public.admin_moderate_record($1, 'hide', 'other_severe', 'second notification rollback', $2, 0, $3)",
        [ids.recordC, ids.requestC2, ids.reportC]
      ),
      /test_notification_failure_after_first/
    );
    await db.query("select set_config('test.fail_notification_after_first', 'false', false)");
    assert.equal(
      await scalar(db, "select count(*)::int as value from public.test_notifications"),
      notificationsBeforeSecondFailure
    );
    const bothRolledBack = await db.query(
      "select id,status,resolution from public.support_submissions where id in ($1,$2) order by id",
      [ids.reportC, ids.reportC2]
    );
    assert.deepEqual(
      bothRolledBack.rows.map((x) => [x.status, x.resolution]),
      [["submitted", null], ["submitted", null]]
    );
    assert.equal(
      await scalar(db, "select count(*)::int as value from public.record_moderation_states where record_id=$1", [ids.recordC]), 0
    );
    assert.equal(
      await scalar(db, "select count(*)::int as value from public.record_moderation_events where record_id=$1", [ids.recordC]), 0
    );
    assert.equal(
      await scalar(db, "select count(*)::int as value from public.support_submission_admin_events where submission_id in ($1,$2)", [ids.reportC, ids.reportC2]), 0
    );
  } finally {
    await db.close();
  }
});



test("F-07 already-hidden report_only rolls back when the second notification fails", async () => {
  const db = new PGlite();
  try {
    await db.exec(setupSql);
    await db.exec(migrationForPglite);
    await db.query(
      "insert into public.archives(id,user_id,is_public,title) values ($1,$2,true,'F07 isolated')",
      [ids.archiveC, ids.owner]
    );
    await db.query(
      "insert into public.records(id,archive_id,user_id,visibility,note,record_time) values ($1,$2,$3,'public','F07 record',now())",
      [ids.recordC, ids.archiveC, ids.owner]
    );
    await setAuth(db, ids.admin);
    const hide = (await db.query(
      "select public.admin_moderate_record($1,'hide','other_severe','F07 initial hide',$2,0,null) as result",
      [ids.recordC, ids.requestC]
    )).rows[0].result;
    assert.equal(hide.ok, true);
    assert.equal(hide.action, "hide");
    assert.equal(Number(hide.version), 1);

    const targetKey = "record:" + (await db.query(
      "select md5($1::text) as value", [ids.recordC]
    )).rows[0].value;
    await db.query(
      "insert into public.support_submissions(id,user_id,kind,category,status,target_type,target_id,target_key) values ($1,$2,'report','other_severe','submitted','record',$3,$4),($5,$6,'report','other_severe','submitted','record',$3,$4)",
      [ids.reportC, ids.reporter, ids.recordC, targetKey, ids.reportC2, ids.ownerB]
    );

    const readReports = async () => (await db.query(
      "select id,status,resolution,resolved_by,resolved_at,admin_note from public.support_submissions where id in ($1,$2) order by id",
      [ids.reportC, ids.reportC2]
    )).rows;
    const readState = async () => (await db.query(
      "select is_hidden,version,hidden_by,hidden_at,reason_code,source_submission_id,last_request_id,updated_at from public.record_moderation_states where record_id=$1",
      [ids.recordC]
    )).rows[0];
    const beforeReports = await readReports();
    const beforeState = await readState();
    assert.equal(beforeState.is_hidden, true);
    assert.equal(Number(beforeState.version), 1);
    const beforeNotifications = await scalar(db, "select count(*)::int as value from public.test_notifications");
    const beforeEvents = await scalar(db, "select count(*)::int as value from public.record_moderation_events");
    const beforeSupportAudit = await scalar(db, "select count(*)::int as value from public.support_submission_admin_events");
    assert.equal(beforeEvents, 1);
    assert.equal(beforeNotifications, 0);

    await db.query("select set_config('test.notification_fail_base',$1,false)", [String(beforeNotifications)]);
    await db.query("select set_config('test.fail_notification_after_first','true',false)");
    await assert.rejects(
      db.query(
        "select public.admin_moderate_record($1,'hide','other_severe','F07 report-only followup',$2,1,$3) as result",
        [ids.recordC, ids.requestC2, ids.reportC]
      ),
      /test_notification_failure_after_first/
    );
    await db.query("select set_config('test.fail_notification_after_first','false',false)");

    assert.deepEqual(await readReports(), beforeReports, "both open reports must roll back");
    assert.deepEqual(await readState(), beforeState, "hide state, version and metadata must remain unchanged");
    assert.equal(await scalar(db, "select count(*)::int as value from public.test_notifications"), beforeNotifications);
    assert.equal(await scalar(db, "select count(*)::int as value from public.record_moderation_events"), beforeEvents);
    assert.equal(await scalar(db, "select count(*)::int as value from public.support_submission_admin_events"), beforeSupportAudit);
    assert.equal(await scalar(
      db, "select count(*)::int as value from public.record_moderation_events where request_id=$1", [ids.requestC2]
    ), 0, "failed report_only request_id must not be committed");

    const f07RollbackEvidence = {
      openReports: (await readReports()).map((r) => [r.status, r.resolution]),
      state: { is_hidden: (await readState()).is_hidden, version: Number((await readState()).version), last_request_id: (await readState()).last_request_id },
      notifications: await scalar(db, "select count(*)::int as value from public.test_notifications"),
      moderationEvents: await scalar(db, "select count(*)::int as value from public.record_moderation_events"),
      supportAudit: await scalar(db, "select count(*)::int as value from public.support_submission_admin_events"),
      failedRequestEvents: await scalar(db, "select count(*)::int as value from public.record_moderation_events where request_id=$1", [ids.requestC2])
    };
    // The same request_id is safe to retry after the failed transaction: one actual closure.
    const success = (await db.query(
      "select public.admin_moderate_record($1,'hide','other_severe','F07 report-only followup',$2,1,$3) as result",
      [ids.recordC, ids.requestC2, ids.reportC]
    )).rows[0].result;
    assert.equal(success.ok, true);
    assert.equal(success.action, "report_only");
    assert.equal(success.already_applied, false);
    assert.equal(success.updated_count, 2);
    assert.equal(Number(success.version), 1);
    assert.ok(success.event_id);
    assert.deepEqual(
      (await readReports()).map((r) => [r.status, r.resolution]),
      [["resolved", "action_taken"], ["resolved", "action_taken"]]
    );
    assert.equal(await scalar(db, "select count(*)::int as value from public.test_notifications"), beforeNotifications + 2);
    assert.equal(await scalar(db, "select count(*)::int as value from public.support_submission_admin_events"), beforeSupportAudit + 2);
    assert.equal(await scalar(db, "select count(*)::int as value from public.record_moderation_events"), beforeEvents + 1);
    const afterSuccessState = await readState();
    assert.equal(afterSuccessState.is_hidden, true);
    assert.equal(Number(afterSuccessState.version), 1);
    assert.equal(await scalar(
      db, "select count(*)::int as value from public.record_moderation_events where request_id=$1 and action='report_only'",
      [ids.requestC2]
    ), 1);

    const replay = (await db.query(
      "select public.admin_moderate_record($1,'hide','other_severe','F07 report-only followup',$2,1,$3) as result",
      [ids.recordC, ids.requestC2, ids.reportC]
    )).rows[0].result;
    assert.equal(replay.ok, true);
    assert.equal(replay.already_applied, true);
    assert.equal(replay.event_id, success.event_id);
    assert.deepEqual(await readState(), afterSuccessState);
    assert.equal(await scalar(db, "select count(*)::int as value from public.test_notifications"), beforeNotifications + 2);
    assert.equal(await scalar(db, "select count(*)::int as value from public.support_submission_admin_events"), beforeSupportAudit + 2);
    assert.equal(await scalar(db, "select count(*)::int as value from public.record_moderation_events"), beforeEvents + 1);
    const conflictingReplay = (await db.query(
      "select public.admin_moderate_record($1,'hide','other_severe','F07 changed note',$2,1,$3) as result",
      [ids.recordC, ids.requestC2, ids.reportC]
    )).rows[0].result;
    assert.equal(conflictingReplay.error, "request_id_conflict");
    console.log("F07_TRANSACTION_EVIDENCE " + JSON.stringify({
      initialHide: { is_hidden: beforeState.is_hidden, version: Number(beforeState.version), openReports: beforeReports.length, notifications: beforeNotifications, moderationEvents: beforeEvents, supportAudit: beforeSupportAudit },
      secondNotificationFailure: "test_notification_failure_after_first",
      afterRollback: f07RollbackEvidence,
      afterRetryAndReplay: { action: success.action, updatedReports: success.updated_count, is_hidden: (await readState()).is_hidden, version: Number((await readState()).version), notifications: await scalar(db, "select count(*)::int as value from public.test_notifications"), moderationEvents: await scalar(db, "select count(*)::int as value from public.record_moderation_events"), supportAudit: await scalar(db, "select count(*)::int as value from public.support_submission_admin_events"), replayAlreadyApplied: replay.already_applied, sameAuditEvent: replay.event_id === success.event_id, differentPayloadConflict: conflictingReplay.error }
    }));
  } finally {
    await db.close();
  }
});

test("R11 synthetic A/B Storage ownership validates shared market media and covers", async () => {
  const db = new PGlite();
  const privateMain = "records/b/private-main.jpg";
  const privateThumb = "records/b/private-thumb.jpg";
  const validMain = "records/a/valid-main.jpg";
  const validThumb = "records/a/valid-thumb.jpg";
  const byMedia = ids.marketMediaSharedAttack;
  const byRecord = "80000000-0000-4000-8000-000000000006";
  try {
    await db.exec(setupSql);
    await db.exec(migrationForPglite);
    await db.query(
      "insert into public.archives(id,user_id,is_public,title) values ($1,$2,true,'A'),($3,$4,false,'B')",
      [ids.archiveA, ids.owner, ids.archiveForeign, ids.ownerB]
    );
    await db.query(
      "insert into public.records(id,archive_id,user_id,visibility,note,record_time) values ($1,$2,$3,'public','A record',now()),($4,$5,$6,'private','B private record',now())",
      [ids.recordA, ids.archiveA, ids.owner, ids.recordForeign, ids.archiveForeign, ids.ownerB]
    );
    await db.query(
      "insert into storage.objects(bucket_id,name,owner_id) values ('media',$1,$3),('media',$2,$3)",
      [privateMain, privateThumb, ids.ownerB]
    );
    await db.query(
      "insert into public.media(id,user_id,record_id,storage_path,thumb_path) values ($1,$2,$3,$4,$5),($6,$7,$8,$4,$5)",
      [ids.mediaA, ids.owner, ids.recordA, privateMain, privateThumb, ids.mediaForeign, ids.ownerB, ids.recordForeign]
    );
    await db.query(
      "insert into public.market_posts(id,user_id,status,source_record_id,cover_image_path,cover_thumb_path) values ($1,$2,'active',$3,$4,$5)",
      [ids.postSharedAttack, ids.owner, ids.recordA, privateMain, privateThumb]
    );
    await db.query(
      "insert into public.market_media(id,user_id,market_post_id,path,thumb_path,source_media_id,source_record_id) values ($1,$2,$3,$4,$5,$6,$7),($8,$2,$3,$4,$5,null,$7)",
      [byMedia, ids.owner, ids.postSharedAttack, privateMain, privateThumb, ids.mediaA, ids.recordA, byRecord]
    );

    // B's real private Storage ownership remains independently readable by B.
    await setAuth(db, ids.ownerB);
    await db.query("set role authenticated");
    const bPrivateObjects = await db.query(
      "select name from storage.objects where bucket_id = 'media' and name in ($1,$2)",
      [privateMain, privateThumb]
    );
    assert.equal(bPrivateObjects.rows.length, 2);
    await db.query("reset role");

    // A cannot use a market post it owns to borrow B's private image paths.
    await setAuth(db, ids.owner);
    await db.query("set role authenticated");
    const aPrivateObjects = await db.query(
      "select name from storage.objects where bucket_id = 'media' and name in ($1,$2)",
      [privateMain, privateThumb]
    );
    assert.equal(aPrivateObjects.rows.length, 0);
    await db.query("reset role");

    for (const principal of [ids.owner, ids.reporter]) {
      await setAuth(db, principal);
      // The owner keeps market-media metadata; neither user may read B's bytes.
      const ownerMetadata = principal === ids.owner;
      assert.equal(await scalar(db, "select public.can_access_market_media($1) as value", [byMedia]), ownerMetadata);
      assert.equal(await scalar(db, "select public.can_access_market_media($1) as value", [byRecord]), ownerMetadata);
      assert.equal(await scalar(db, "select public.can_read_public_market_media_object($1) as value", [privateMain]), false);
      assert.equal(await scalar(db, "select public.can_read_public_market_media_object($1) as value", [privateThumb]), false);
    }
    await db.query("select set_config('request.jwt.claim.sub', '', false)");
    await db.query("set role anon");
    assert.equal(await scalar(db, "select public.can_access_market_media($1) as value", [byMedia]), false);
    assert.equal(await scalar(db, "select public.can_access_market_media($1) as value", [byRecord]), false);
    assert.equal(await scalar(db, "select public.can_read_public_market_media_object($1) as value", [privateMain]), false);
    assert.equal(await scalar(db, "select public.can_read_public_market_media_object($1) as value", [privateThumb]), false);
    await db.query("reset role");

    // Each object's owner is checked independently. The synthetic Storage fixture
    // enforces owner_id NOT NULL: use empty/missing objects for unknown attribution.
    await db.query("update storage.objects set owner_id=$1 where bucket_id='media' and name=$2", [ids.owner, privateMain]);
    await setAuth(db, ids.owner);
    assert.equal(await scalar(db, "select public.can_access_market_media($1) as value", [byMedia]), true);
    assert.equal(await scalar(db, "select public.can_read_public_market_media_object($1) as value", [privateMain]), true);
    assert.equal(await scalar(db, "select public.can_read_public_market_media_object($1) as value", [privateThumb]), false);
    await db.query("update storage.objects set owner_id=$1 where bucket_id='media' and name=$2", [ids.ownerB, privateMain]);
    await db.query("update storage.objects set owner_id=$1 where bucket_id='media' and name=$2", [ids.owner, privateThumb]);
    assert.equal(await scalar(db, "select public.can_read_public_market_media_object($1) as value", [privateMain]), false);
    assert.equal(await scalar(db, "select public.can_read_public_market_media_object($1) as value", [privateThumb]), true);
    await setAuth(db, ids.reporter);
    assert.equal(await scalar(db, "select public.can_access_market_media($1) as value", [byMedia]), false);
    assert.equal(await scalar(db, "select public.can_access_market_media($1) as value", [byRecord]), false);
    assert.equal(await scalar(db, "select public.can_read_public_market_media_object($1) as value", [privateMain]), false);
    assert.equal(await scalar(db, "select public.can_read_public_market_media_object($1) as value", [privateThumb]), false);
    await db.query("update storage.objects set owner_id='' where bucket_id='media' and name=$1", [privateMain]);
    await setAuth(db, ids.owner);
    assert.equal(await scalar(db, "select public.can_read_public_market_media_object($1) as value", [privateMain]), false);
    await db.query("delete from storage.objects where bucket_id='media' and name=$1", [privateMain]);
    assert.equal(await scalar(db, "select public.can_read_public_market_media_object($1) as value", [privateMain]), false);
    await db.query("insert into storage.objects(bucket_id,name,owner_id) values ('media',$1,$2)", [privateMain, ids.ownerB]);
    await db.query("update storage.objects set owner_id=$1 where bucket_id='media' and name=$2", [ids.ownerB, privateThumb]);

    // A legitimate source reference with both objects owned by A remains visible.
    await db.query(
      "insert into storage.objects(bucket_id,name,owner_id) values ('media',$1,$3),('media',$2,$3)",
      [validMain, validThumb, ids.owner]
    );
    await db.query(
      "update public.media set storage_path=$1,thumb_path=$2 where id=$3",
      [validMain, validThumb, ids.mediaA]
    );
    await db.query(
      "update public.market_media set path=$1,thumb_path=$2 where id in ($3,$4)",
      [validMain, validThumb, byMedia, byRecord]
    );
    await db.query(
      "update public.market_posts set cover_image_path=$1,cover_thumb_path=$2 where id=$3",
      [validMain, validThumb, ids.postSharedAttack]
    );
    for (const principal of [ids.owner, ids.reporter]) {
      await setAuth(db, principal);
      assert.equal(await scalar(db, "select public.can_access_market_media($1) as value", [byMedia]), true);
      assert.equal(await scalar(db, "select public.can_access_market_media($1) as value", [byRecord]), true);
      assert.equal(await scalar(db, "select public.can_read_public_market_media_object($1) as value", [validMain]), true);
      assert.equal(await scalar(db, "select public.can_read_public_market_media_object($1) as value", [validThumb]), true);
    }

    // Owner may see their own private source, but the public cannot re-expose it.
    await db.query("update public.records set visibility='private' where id=$1", [ids.recordA]);
    await setAuth(db, ids.reporter);
    assert.equal(await scalar(db, "select public.can_access_market_media($1) as value", [byMedia]), false);
    assert.equal(await scalar(db, "select public.can_read_public_market_media_object($1) as value", [validMain]), false);
    await setAuth(db, ids.owner);
    assert.equal(await scalar(db, "select public.can_access_market_media($1) as value", [byMedia]), true);
  } finally {
    await db.close();
  }
});

test("seven-file UI scope uses the public projection and combined moderation RPC", () => {
  const support = read("app/admin/support/page.tsx");
  const audit = read("components/support/AdminSupportAudit.tsx");
  const card = read("components/archive-detail/ArchiveRecordCard.tsx");
  const plant = read("app/plant/[id]/page.tsx");
  const guide = read("components/plant-detail/GuideDetailView.tsx");

  assert.match(support, /admin_moderate_record/);
  assert.match(support, /admin_list_record_moderation_events/);
  assert.match(support, /resolution === "action_taken"/);
  assert.match(support, /const canTakeReportAction =[\s\S]*?group\.target_type === "record"/);
  assert.match(audit, /admin_list_record_moderation_events/);
  assert.match(card, /get_my_record_moderation_status/);
  assert.match(card, /recordModerationLookup\?\.recordId === item\.id/);
  assert.match(card, /typeof row\?\.is_hidden !== "boolean"/);
  assert.match(card, /status: "unknown"/);
  assert.match(card, /mode === "owner"/);
  assert.match(card, /!localStatusLabel/);
  assert.match(plant, /public_guide_record_projection/);
  assert.match(plant, /recordScope === "all"/);
  assert.match(plant, /from\("records"\)/);
  assert.match(guide, /public_guide_record_projection/);
  assert.doesNotMatch(guide, /\.from\("records"\)/);
});

