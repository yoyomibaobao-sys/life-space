import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const ADMIN = "00000000-0000-4000-8000-000000000001";
const TRIAL = "00000000-0000-4000-8000-0000000000a1";
const PLUS = "00000000-0000-4000-8000-0000000000a2";

const schema = `
  create role anon; create role authenticated; create role service_role bypassrls;
  create schema auth; create schema private;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create function public.is_app_admin(p_user_id uuid) returns boolean
    language sql stable as $$ select p_user_id = '${ADMIN}'::uuid $$;
  create table private.cloud_trial_claims (
    user_id uuid primary key, cleanup_due_at timestamptz,
    cleanup_started_at timestamptz, cleanup_completed_at timestamptz,
    converted_to_paid_at timestamptz, cleanup_last_attempt_at timestamptz,
    cleanup_attempt_count integer not null default 0,
    cleanup_last_error_code text, updated_at timestamptz not null default now()
  );
  create table public.user_memberships (
    user_id uuid primary key, plan text not null, paid_until timestamptz
  );
  create table public.membership_payments (
    id uuid primary key default gen_random_uuid(), user_id uuid not null,
    status text not null, provider_order_id text,
    updated_at timestamptz not null default now()
  );
  create table public.storage_deletion_jobs (
    id uuid primary key default gen_random_uuid(), owner_user_id uuid not null,
    source_type text not null, source_id uuid not null, status text not null default 'pending',
    constraint storage_deletion_jobs_source_type_check
      check (source_type in ('record','archive','cycle','account','media',
        'market_post','market_media','market_cover'))
  );
  create table public.storage_deletion_items (
    id uuid primary key default gen_random_uuid(),
    job_id uuid not null references public.storage_deletion_jobs(id),
    bucket_id text not null, object_path text not null
  );
  create table public.users (id uuid primary key, account_number text);
  create table public.profiles (id uuid primary key, username text);
  create table public.device_local_markers (user_id uuid primary key, marker text);
  create table public.archives (
    id uuid primary key default gen_random_uuid(), user_id uuid not null,
    cover_image_path text, cover_image_url text, cover_thumb_path text
  );
  create table public.records (
    id uuid primary key default gen_random_uuid(), user_id uuid not null,
    archive_id uuid not null, primary_image_path text, primary_image_url text,
    primary_thumb_path text
  );
  create table public.media (
    id uuid primary key default gen_random_uuid(), user_id uuid not null,
    record_id uuid not null, storage_path text, url text,
    thumb_path text, thumb_url text, type text, size_bytes bigint
  );
  create table public.market_posts (
    id uuid primary key default gen_random_uuid(), user_id uuid not null,
    cover_image_path text, cover_image_url text, cover_thumb_path text, cover_thumb_url text
  );
  create table public.market_media (
    id uuid primary key default gen_random_uuid(), user_id uuid not null,
    market_post_id uuid not null, path text, url text, thumb_path text, thumb_url text
  );
  create function public.media_object_path_from_public_url(p_url text)
  returns text language sql stable as $$
    select case when p_url like 'stored:%' then substring(p_url from 8) else null end $$;
`;

function extractCreateTable(sql, tableName) {
  const patterns = [
    new RegExp(`create table(?: if not exists)?\\s+public\\.${tableName}\\s*\\(`, "i"),
    new RegExp(`create table(?: if not exists)?\\s+"public"\\."${tableName}"\\s*\\(`, "i"),
  ];
  const match = patterns.map((pattern) => pattern.exec(sql)).find(Boolean);
  if (!match) throw new Error(`missing create table ${tableName}`);
  let depth = 0;
  for (let i = match.index; i < sql.length; i += 1) {
    const ch = sql[i];
    if (ch === "(") depth += 1;
    else if (ch === ")") depth -= 1;
    else if (ch === ";" && depth === 0) return sql.slice(match.index, i + 1);
  }
  throw new Error(`unterminated create table ${tableName}`);
}

function extractAlter(sql, constraintName) {
  const at = sql.indexOf(`"${constraintName}"`);
  if (at < 0) throw new Error(constraintName);
  const start = sql.lastIndexOf("ALTER TABLE", at);
  const end = sql.indexOf(";", at);
  return sql.slice(start, end + 1);
}

async function createDb({ foreignKeys = false } = {}) {
  const db = new PGlite();
  await db.exec(schema);
  await db.exec(await readFile(
    "supabase/migrations/20261013005152_trial_cleanup_job_provenance.sql", "utf8"));
  await db.exec(await readFile(
    "supabase/migrations/20261013120000_trial_cleanup_execution_fence.sql", "utf8"));
  await db.exec(await readFile(
    "supabase/migrations/20261013143000_trial_cleanup_capture_reference_fence.sql", "utf8"));
  await db.exec(await readFile(
    "supabase/migrations/20261013160000_trial_cleanup_path_hold.sql", "utf8"));
  await db.exec(await readFile(
    "supabase/migrations/20261013170000_trial_cleanup_restore_conflict.sql", "utf8"));
  await db.exec(await readFile(
    "supabase/migrations/20261013180000_trial_cleanup_restore_claim.sql", "utf8"));
  if (foreignKeys) {
    const cards = await readFile(
      "supabase/migrations/20260730090616_add_experience_cards_v1.sql", "utf8");
    const interactions = await readFile(
      "supabase/migrations/20260808120000_add_experience_card_interactions.sql", "utf8");
    const locations = await readFile(
      "supabase/migrations/20260907212018_record_location_and_mobile_admin.sql", "utf8");
    const dumped = await readFile("supabase/schema.sql", "utf8");
    await db.exec([
      extractCreateTable(cards, "experience_cards"),
      extractCreateTable(cards, "experience_card_records"),
      extractCreateTable(interactions, "experience_card_comments"),
      extractCreateTable(locations, "record_locations"),
      extractCreateTable(dumped, "comments"),
      extractCreateTable(dumped, "archive_follows"),
      extractAlter(dumped, "comments_record_id_fkey"),
      extractAlter(dumped, "comments_user_id_fkey"),
      extractAlter(dumped, "archive_follows_archive_id_fkey"),
      extractAlter(dumped, "archive_follows_user_id_fkey"),
    ].join("\n"));
  }
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [ADMIN]);
  return db;
}

async function seedCloudUser(db, userId, { path = true } = {}) {
  await db.query("insert into auth.users (id) values ($1) on conflict do nothing", [userId]);
  await db.query(
    `insert into private.cloud_trial_claims (user_id, cleanup_due_at)
     values ($1, now() - interval '2 years')`, [userId]);
  await db.query(
    "insert into public.users (id, account_number) values ($1, $2)",
    [userId, `LSa-${userId.slice(-4)}`]);
  await db.query(
    "insert into public.profiles (id, username) values ($1, 'keeper')", [userId]);
  const archive = (await db.query(
    "insert into public.archives (user_id, cover_image_path) values ($1, $2) returning id",
    [userId, path ? `${userId}/cover.jpg` : null],
  )).rows[0].id;
  const record = (await db.query(
    "insert into public.records (user_id, archive_id) values ($1, $2) returning id",
    [userId, archive],
  )).rows[0].id;
  let mediaId = null;
  if (path) {
    mediaId = (await db.query(
      "insert into public.media (user_id, record_id, storage_path, type) values ($1, $2, $3, 'image') returning id",
      [userId, record, `${userId}/photo.jpg`],
    )).rows[0].id;
  }
  return { archive, record, mediaId };
}

async function quarantineAndComplete(db, fenceId, objectPath, claimToken, result = "deleted") {
  const authorized = (await db.query(
    "select public.authorize_trial_cloud_cleanup_object_delete($1, $2, $3) as result",
    [fenceId, objectPath, claimToken],
  )).rows[0].result;
  assert.equal(authorized.authorized, true);
  const quarantinePath = `trial-cleanup-quarantine/${fenceId}/${claimToken}/${objectPath}`;
  assert.equal((await db.query(
    "select public.record_trial_cloud_cleanup_quarantine($1, $2, $3, $4) as result",
    [fenceId, objectPath, claimToken, quarantinePath],
  )).rows[0].result.recorded, true);
  assert.equal((await db.query(
    "select public.recheck_trial_cloud_cleanup_object($1, $2, $3) as result",
    [fenceId, objectPath, claimToken],
  )).rows[0].result.clear, true);
  return (await db.query(
    "select public.complete_trial_cloud_cleanup_storage_object($1, $2, $3, $4) as result",
    [fenceId, objectPath, claimToken, result],
  )).rows[0].result;
}

async function reserveAndCommit(db, userId, { prepare = true } = {}) {
  const batchId = (await db.query(
    "select public.admin_stage_trial_cloud_cleanup(array['y1_3']) as result",
  )).rows[0].result.batch_id;
  await db.query("select public.admin_confirm_trial_cloud_cleanup($1)", [batchId]);
  await db.query("select public.preflight_trial_cloud_cleanup($1, 10)", [batchId]);
  const reserved = (await db.query(
    "select public.reserve_trial_cloud_cleanup_target($1, 10) as result", [batchId],
  )).rows[0].result;
  assert.equal(reserved.reserved, true);
  if (prepare) {
    const prepared = (await db.query(
      "select public.prepare_trial_cloud_cleanup_storage_plan($1, $2) as result",
      [reserved.target_id, reserved.reservation_id],
    )).rows[0].result;
    assert.equal(prepared.prepared, true);
  }
  const committed = (await db.query(
    "select public.commit_trial_cloud_cleanup_fence($1, $2) as result",
    [reserved.target_id, reserved.reservation_id],
  )).rows[0].result;
  return { reserved, committed };
}

async function addRecords(db, userId, archiveId, count) {
  const ids = [];
  for (let i = 0; i < count; i += 1) {
    ids.push((await db.query(
      "insert into public.records (user_id, archive_id) values ($1, $2) returning id",
      [userId, archiveId],
    )).rows[0].id);
  }
  return ids;
}

async function insertCard(db, userId, archiveId, recordIds, coverMediaId = null) {
  const cardId = (await db.query(
    `insert into public.experience_cards
       (user_id, archive_id, title, source_record_count, status, cover_media_id)
     values ($1, $2, 'Bed notes', 3, 'draft', $3) returning id`,
    [userId, archiveId, coverMediaId],
  )).rows[0].id;
  for (const recordId of recordIds) {
    await db.query(
      "insert into public.experience_card_records (card_id, record_id) values ($1, $2)",
      [cardId, recordId],
    );
  }
  return cardId;
}

test("capture intent and a started fence cannot overlap into a charged account with deleted rows", async () => {
  const manual = await readFile(
    "supabase/migrations/20261012230036_manual_trial_cloud_cleanup.sql", "utf8");
  assert.match(manual, /trial_manual_cleanup_migration_incomplete/);
  const fence = await readFile(
    "supabase/migrations/20261013143000_trial_cleanup_capture_reference_fence.sql", "utf8");
  assert.match(fence, /grant execute on function public\.begin_paypal_membership_capture\(uuid\)\s+to service_role/);
  assert.match(fence, /admin_execution_enabled', false/);

  const delayed = await createDb();
  try {
    const seeded = await seedCloudUser(delayed, TRIAL, { path: false });
    const paymentId = (await delayed.query(
      "insert into public.membership_payments (user_id, status) values ($1, 'expired') returning id",
      [TRIAL],
    )).rows[0].id;
    const batchId = (await delayed.query(
      "select public.admin_stage_trial_cloud_cleanup(array['y1_3']) as result",
    )).rows[0].result.batch_id;
    await delayed.query("select public.admin_confirm_trial_cloud_cleanup($1)", [batchId]);
    await delayed.query("select public.preflight_trial_cloud_cleanup($1, 10)", [batchId]);
    const reserved = (await delayed.query(
      "select public.reserve_trial_cloud_cleanup_target($1, 10) as result", [batchId],
    )).rows[0].result;
    assert.equal(reserved.reserved, true);
    await delayed.query(
      "select public.prepare_trial_cloud_cleanup_storage_plan($1, $2)",
      [reserved.target_id, reserved.reservation_id]);
    const intent = (await delayed.query(
      "select public.begin_paypal_membership_capture($1) as result", [paymentId],
    )).rows[0].result;
    assert.equal(intent.ok, true);
    assert.equal(intent.admin_execution_enabled, false);
    assert.equal((await delayed.query(
      "select capture_requested_at is not null as marked from public.membership_payments where id = $1",
      [paymentId],
    )).rows[0].marked, true);
    const blocked = (await delayed.query(
      "select public.commit_trial_cloud_cleanup_fence($1, $2) as result",
      [reserved.target_id, reserved.reservation_id],
    )).rows[0].result;
    assert.equal(blocked.committed, false);
    assert.equal(blocked.irreversible, false);
    assert.equal((await delayed.query(
      "select count(*)::int as n from private.trial_cloud_cleanup_fences",
    )).rows[0].n, 0);
    assert.equal((await delayed.query(
      "select count(*)::int as n from public.archives where id = $1", [seeded.archive],
    )).rows[0].n, 1);
    await delayed.query(
      "update public.membership_payments set status = 'confirmed' where id = $1",
      [paymentId]);
    await delayed.query(
      "insert into public.user_memberships (user_id, plan, paid_until) values ($1, 'basic', now() + interval '1 year')",
      [TRIAL]);
    assert.equal((await delayed.query(
      "select plan from public.user_memberships where user_id = $1", [TRIAL],
    )).rows[0].plan, "basic");
    assert.equal((await delayed.query(
      "select count(*)::int as n from public.archives where user_id = $1", [TRIAL],
    )).rows[0].n, 1);
  } finally { await delayed.close(); }

  const started = await createDb();
  try {
    await seedCloudUser(started, TRIAL, { path: false });
    const { reserved, committed } = await reserveAndCommit(started, TRIAL);
    assert.equal(committed.committed, true);
    assert.equal(committed.target_status, "awaiting_storage");
    await started.query(
      "alter table public.membership_payments disable trigger membership_payments_defer_trial_cleanup_before_insert");
    const paymentId = (await started.query(
      "insert into public.membership_payments (user_id, status, provider_order_id) values ($1, 'expired', 'paypal-order') returning id",
      [TRIAL],
    )).rows[0].id;
    const refused = (await started.query(
      "select public.begin_paypal_membership_capture($1) as result", [paymentId],
    )).rows[0].result;
    assert.equal(refused.ok, false);
    assert.equal(refused.error_message, "trial_cleanup_in_progress");
    assert.equal((await started.query(
      "select capture_requested_at is null as unmarked from public.membership_payments where id = $1",
      [paymentId],
    )).rows[0].unmarked, true);
    await assert.rejects(started.query(
      "insert into public.user_memberships (user_id, plan, paid_until) values ($1, 'basic', now() + interval '1 year')",
      [TRIAL],
    ), /trial_cleanup_in_progress/);
    await started.query(
      "update public.membership_payments set capture_requested_at = clock_timestamp(), status = 'confirmed' where id = $1",
      [paymentId]);
    await started.query(
      "insert into public.user_memberships (user_id, plan, paid_until) values ($1, 'basic', now() + interval '1 year')",
      [TRIAL]);
    assert.equal((await started.query(
      "select status from private.trial_cloud_cleanup_targets where id = $1",
      [reserved.target_id],
    )).rows[0].status, "skipped_paid");
    assert.equal((await started.query(
      "select count(*)::int as n from public.archives where user_id = $1", [TRIAL],
    )).rows[0].n, 1);
    const closed = (await started.query(
      "select public.close_trial_cloud_cleanup_database($1, $2) as result",
      [reserved.target_id, committed.fence_id],
    )).rows[0].result;
    assert.equal(closed.closed, false);
    assert.equal(closed.admin_execution_enabled, false);
  } finally { await started.close(); }
});

test("real foreign keys cascade only the trial account and refuse another account's card, cover, source, or location", async () => {
  const db = await createDb({ foreignKeys: true });
  try {
    const actions = (await db.query(`
      select c.conname, c.confdeltype
      from pg_constraint c
      join pg_class r on r.oid = c.conrelid
      where c.contype = 'f'
        and c.conname in (
          'experience_cards_archive_id_fkey',
          'experience_cards_cover_media_id_fkey',
          'experience_card_records_record_id_fkey',
          'record_locations_record_id_fkey',
          'comments_record_id_fkey',
          'archive_follows_archive_id_fkey'
        )
    `)).rows;
    const action = Object.fromEntries(actions.map((row) => [row.conname, row.confdeltype]));
    assert.equal(action.experience_cards_archive_id_fkey, "c");
    assert.equal(action.experience_cards_cover_media_id_fkey, "n");
    assert.equal(action.experience_card_records_record_id_fkey, "c");
    assert.equal(action.record_locations_record_id_fkey, "c");
    assert.equal(action.comments_record_id_fkey, "c");
    assert.equal(action.archive_follows_archive_id_fkey, "c");

    const trial = await seedCloudUser(db, TRIAL, { path: false });
    const trialRecords = [trial.record, ...(await addRecords(db, TRIAL, trial.archive, 2))];
    const trialCard = await insertCard(db, TRIAL, trial.archive, trialRecords);
    await db.query(
      "insert into public.record_locations (record_id, user_id, label) values ($1, $2, 'trial bed')",
      [trial.record, TRIAL]);
    await db.query(
      "insert into public.comments (record_id, user_id, content) values ($1, $2, 'trial note')",
      [trial.record, TRIAL]);
    await db.query(
      "insert into public.archive_follows (archive_id, user_id) values ($1, $2)",
      [trial.archive, TRIAL]);

    await db.query("insert into auth.users (id) values ($1)", [PLUS]);
    await db.query(
      "insert into public.users (id, account_number) values ($1, 'plus')", [PLUS]);
    await db.query(
      "insert into public.profiles (id, username) values ($1, 'plus')", [PLUS]);
    await db.query(
      "insert into public.user_memberships (user_id, plan, paid_until) values ($1, 'basic', now() + interval '1 year')",
      [PLUS]);
    const plusArchive = (await db.query(
      "insert into public.archives (user_id) values ($1) returning id", [PLUS],
    )).rows[0].id;
    const plusRecord = (await db.query(
      "insert into public.records (user_id, archive_id) values ($1, $2) returning id",
      [PLUS, plusArchive],
    )).rows[0].id;
    const plusRecords = [plusRecord, ...(await addRecords(db, PLUS, plusArchive, 2))];
    const plusCard = await insertCard(db, PLUS, plusArchive, plusRecords);
    await db.query(
      "insert into public.record_locations (record_id, user_id, label) values ($1, $2, 'plus bed')",
      [plusRecord, PLUS]);
    await db.query(
      "insert into public.comments (record_id, user_id, content) values ($1, $2, 'plus on plus')",
      [plusRecord, PLUS]);
    await db.query(
      "insert into public.comments (record_id, user_id, content) values ($1, $2, 'plus on trial')",
      [trial.record, PLUS]);
    await db.query(
      "insert into public.archive_follows (archive_id, user_id) values ($1, $2)",
      [plusArchive, PLUS]);
    await db.query(
      "insert into public.archive_follows (archive_id, user_id) values ($1, $2)",
      [trial.archive, PLUS]);
    await db.query(
      "insert into public.experience_card_comments (card_id, user_id, content) values ($1, $2, 'plus on own card')",
      [plusCard, PLUS]);

    const { committed } = await reserveAndCommit(db, TRIAL);
    assert.equal(committed.object_count, 0);
    const closed = (await db.query(
      "select public.close_trial_cloud_cleanup_database($1, $2) as result",
      [committed.target_id, committed.fence_id],
    )).rows[0].result;
    assert.equal(closed.closed, true);
    assert.equal(closed.admin_execution_enabled, false);
    assert.equal((await db.query(
      "select count(*)::int as n from public.archives where user_id = $1", [TRIAL],
    )).rows[0].n, 0);
    assert.equal((await db.query(
      "select count(*)::int as n from public.experience_cards where id = $1", [trialCard],
    )).rows[0].n, 0);
    assert.equal((await db.query(
      "select count(*)::int as n from public.record_locations where user_id = $1", [TRIAL],
    )).rows[0].n, 0);
    assert.equal((await db.query(
      "select count(*)::int as n from public.comments where content = 'plus on trial'",
    )).rows[0].n, 0);
    assert.equal((await db.query(
      "select count(*)::int as n from public.archive_follows where archive_id = $1",
      [trial.archive],
    )).rows[0].n, 0);
    assert.equal((await db.query(
      "select username from public.profiles where id = $1", [TRIAL],
    )).rows[0].username, "keeper");
    assert.equal((await db.query(
      "select id from public.archives where id = $1", [plusArchive],
    )).rows[0].id, plusArchive);
    assert.equal((await db.query(
      "select id from public.experience_cards where id = $1", [plusCard],
    )).rows[0].id, plusCard);
    assert.equal((await db.query(
      "select label from public.record_locations where record_id = $1", [plusRecord],
    )).rows[0].label, "plus bed");
    assert.equal((await db.query(
      "select content from public.comments where record_id = $1", [plusRecord],
    )).rows[0].content, "plus on plus");
    assert.equal((await db.query(
      "select count(*)::int as n from public.archive_follows where archive_id = $1 and user_id = $2",
      [plusArchive, PLUS],
    )).rows[0].n, 1);
    assert.equal((await db.query(
      "select content from public.experience_card_comments where card_id = $1", [plusCard],
    )).rows[0].content, "plus on own card");
    assert.equal((await db.query(
      "select plan from public.user_memberships where user_id = $1", [PLUS],
    )).rows[0].plan, "basic");
  } finally { await db.close(); }

  async function refuse(setup, reason) {
    const refused = await createDb({ foreignKeys: true });
    try {
      const trial = await seedCloudUser(refused, TRIAL, { path: false });
      await addRecords(refused, TRIAL, trial.archive, 2);
      await refused.query("insert into auth.users (id) values ($1)", [PLUS]);
      await refused.query(
        "insert into public.users (id, account_number) values ($1, 'plus')", [PLUS]);
      const plusArchive = (await refused.query(
        "insert into public.archives (user_id) values ($1) returning id", [PLUS],
      )).rows[0].id;
      const plusRecord = (await refused.query(
        "insert into public.records (user_id, archive_id) values ($1, $2) returning id",
        [PLUS, plusArchive],
      )).rows[0].id;
      const plusRecords = [plusRecord, ...(await addRecords(refused, PLUS, plusArchive, 2))];
      await setup(refused, trial, { plusArchive, plusRecord, plusRecords });
      const { reserved, committed } = await reserveAndCommit(refused, TRIAL);
      assert.equal(committed.committed, true);
      const result = (await refused.query(
        "select public.close_trial_cloud_cleanup_database($1, $2) as result",
        [reserved.target_id, committed.fence_id],
      )).rows[0].result;
      assert.equal(result.closed, false);
      assert.equal(result.reason, reason);
      assert.equal((await refused.query(
        "select count(*)::int as n from public.archives where user_id = $1", [TRIAL],
      )).rows[0].n, 1);
      assert.equal((await refused.query(
        "select count(*)::int as n from public.archives where user_id = $1", [PLUS],
      )).rows[0].n, 1);
      assert.equal((await refused.query(
        "select count(*)::int as n from public.experience_cards where user_id = $1", [PLUS],
      )).rows[0].n, 1);
    } finally { await refused.close(); }
  }

  await refuse(async (refused, trial, plus) => {
    await insertCard(refused, PLUS, trial.archive, plus.plusRecords);
  }, "cross_account_experience_card");

  await refuse(async (refused, trial, plus) => {
    await insertCard(refused, PLUS, plus.plusArchive, [trial.record, plus.plusRecords[0], plus.plusRecords[1]]);
  }, "cross_account_card_record");

  await refuse(async (refused, trial, plus) => {
    await insertCard(refused, PLUS, plus.plusArchive, plus.plusRecords);
    await refused.query(
      "insert into public.record_locations (record_id, user_id, label) values ($1, $2, 'plus on trial')",
      [trial.record, PLUS]);
  }, "cross_account_location");

  const covered = await createDb({ foreignKeys: true });
  try {
    const trial = await seedCloudUser(covered, TRIAL);
    await covered.query("insert into auth.users (id) values ($1)", [PLUS]);
    await covered.query(
      "insert into public.users (id, account_number) values ($1, 'plus')", [PLUS]);
    const plusArchive = (await covered.query(
      "insert into public.archives (user_id) values ($1) returning id", [PLUS],
    )).rows[0].id;
    const plusRecord = (await covered.query(
      "insert into public.records (user_id, archive_id) values ($1, $2) returning id",
      [PLUS, plusArchive],
    )).rows[0].id;
    const plusRecords = [plusRecord, ...(await addRecords(covered, PLUS, plusArchive, 2))];
    const { reserved, committed } = await reserveAndCommit(covered, TRIAL);
    let guard = 0;
    while (guard < 4) {
      const claim = (await covered.query(
        "select public.claim_trial_cloud_cleanup_storage_object($1) as result",
        [committed.fence_id],
      )).rows[0].result;
      if (claim.claimed !== true) break;
      const done = await quarantineAndComplete(
        covered, committed.fence_id, claim.object_path, claim.claim_token);
      assert.equal(done.completed, true);
      guard += 1;
    }
    const plusCard = await insertCard(covered, PLUS, plusArchive, plusRecords, trial.mediaId);
    const result = (await covered.query(
      "select public.close_trial_cloud_cleanup_database($1, $2) as result",
      [reserved.target_id, committed.fence_id],
    )).rows[0].result;
    assert.equal(result.closed, false);
    assert.equal(result.reason, "cross_account_cover");
    assert.equal((await covered.query(
      "select cover_media_id from public.experience_cards where id = $1", [plusCard],
    )).rows[0].cover_media_id, trial.mediaId);
    assert.equal((await covered.query(
      "select count(*)::int as n from public.media where id = $1", [trial.mediaId],
    )).rows[0].n, 1);
  } finally { await covered.close(); }
});

test("a shared or replaced reference after claim is not deleted, and an expired claim cannot be reused", async () => {
  const shared = await createDb();
  try {
    const seeded = await seedCloudUser(shared, TRIAL);
    const { reserved, committed } = await reserveAndCommit(shared, TRIAL);
    let claim = null;
    for (let i = 0; i < 2; i += 1) {
      const next = (await shared.query(
        "select public.claim_trial_cloud_cleanup_storage_object($1) as result",
        [committed.fence_id],
      )).rows[0].result;
      if (next.object_path.endsWith("/photo.jpg")) claim = next;
    }
    assert.equal(claim.claimed, true);
    const authorized = (await shared.query(
      "select public.authorize_trial_cloud_cleanup_object_delete($1, $2, $3) as result",
      [committed.fence_id, claim.object_path, claim.claim_token],
    )).rows[0].result;
    assert.equal(authorized.authorized, true);
    await assert.rejects(shared.query(
      "insert into public.media (user_id, record_id, storage_path, type) values ($1, $2, $3, 'image')",
      [PLUS, seeded.record, claim.object_path],
    ), /trial_cleanup_path_held/);
    assert.equal((await shared.query(
      "select count(*)::int as n from public.media where storage_path = $1",
      [claim.object_path],
    )).rows[0].n, 1);
    const quarantinePath = `trial-cleanup-quarantine/${committed.fence_id}/${claim.claim_token}/${claim.object_path}`;
    assert.equal((await shared.query(
      "select public.record_trial_cloud_cleanup_quarantine($1, $2, $3, $4) as result",
      [committed.fence_id, claim.object_path, claim.claim_token, quarantinePath],
    )).rows[0].result.recorded, true);
    assert.equal((await shared.query(
      "select public.recheck_trial_cloud_cleanup_object($1, $2, $3) as result",
      [committed.fence_id, claim.object_path, claim.claim_token],
    )).rows[0].result.clear, true);
    assert.equal((await shared.query(
      "select public.complete_trial_cloud_cleanup_storage_object($1, $2, $3, 'deleted') as result",
      [committed.fence_id, claim.object_path, claim.claim_token],
    )).rows[0].result.completed, true);
    assert.equal((await shared.query(
      "select count(*)::int as n from public.archives where user_id = $1", [TRIAL],
    )).rows[0].n, 1);
  } finally { await shared.close(); }

  const replaced = await createDb();
  try {
    await seedCloudUser(replaced, TRIAL);
    const { reserved, committed } = await reserveAndCommit(replaced, TRIAL);
    let claim = null;
    for (let i = 0; i < 2; i += 1) {
      const next = (await replaced.query(
        "select public.claim_trial_cloud_cleanup_storage_object($1) as result",
        [committed.fence_id],
      )).rows[0].result;
      if (next.object_path.endsWith("/photo.jpg")) claim = next;
    }
    await replaced.query(
      "update public.media set storage_path = $2 where storage_path = $1",
      [claim.object_path, `${TRIAL}/replaced.jpg`]);
    const authorized = (await replaced.query(
      "select public.authorize_trial_cloud_cleanup_object_delete($1, $2, $3) as result",
      [committed.fence_id, claim.object_path, claim.claim_token],
    )).rows[0].result;
    assert.equal(authorized.authorized, false);
    assert.equal(authorized.reason, "plan_replaced");
    assert.equal((await replaced.query(
      "select storage_path from public.media where user_id = $1 and storage_path like '%replaced.jpg'",
      [TRIAL],
    )).rows[0].storage_path, `${TRIAL}/replaced.jpg`);
    const closed = (await replaced.query(
      "select public.close_trial_cloud_cleanup_database($1, $2) as result",
      [reserved.target_id, committed.fence_id],
    )).rows[0].result;
    assert.equal(closed.closed, false);
    assert.equal(closed.reason, "storage_incomplete");
  } finally { await replaced.close(); }

  const leased = await createDb();
  try {
    await seedCloudUser(leased, TRIAL);
    const { committed } = await reserveAndCommit(leased, TRIAL);
    const first = (await leased.query(
      "select public.claim_trial_cloud_cleanup_storage_object($1) as result",
      [committed.fence_id],
    )).rows[0].result;
    const second = (await leased.query(
      "select public.claim_trial_cloud_cleanup_storage_object($1) as result",
      [committed.fence_id],
    )).rows[0].result;
    assert.equal(first.claimed, true);
    assert.equal(second.claimed, true);
    assert.notEqual(first.object_path, second.object_path);
    assert.notEqual(first.claim_token, second.claim_token);
    const idle = (await leased.query(
      "select public.claim_trial_cloud_cleanup_storage_object($1) as result",
      [committed.fence_id],
    )).rows[0].result;
    assert.equal(idle.claimed, false);
    assert.equal(idle.reason, "idle");
    await leased.query(
      "update private.trial_cloud_cleanup_object_work set claim_expires_at = clock_timestamp() - interval '1 second' where claim_token = $1",
      [first.claim_token]);
    const stale = (await leased.query(
      "select public.authorize_trial_cloud_cleanup_object_delete($1, $2, $3) as result",
      [committed.fence_id, first.object_path, first.claim_token],
    )).rows[0].result;
    assert.equal(stale.authorized, false);
    assert.equal(stale.reason, "claim_mismatch");
    const reclaimed = (await leased.query(
      "select public.claim_trial_cloud_cleanup_storage_object($1) as result",
      [committed.fence_id],
    )).rows[0].result;
    assert.equal(reclaimed.claimed, true);
    assert.equal(reclaimed.object_path, first.object_path);
    assert.notEqual(reclaimed.claim_token, first.claim_token);
    const oldComplete = (await leased.query(
      "select public.complete_trial_cloud_cleanup_storage_object($1, $2, $3, 'deleted') as result",
      [committed.fence_id, first.object_path, first.claim_token],
    )).rows[0].result;
    assert.equal(oldComplete.completed, false);
    assert.equal(oldComplete.reason, "claim_mismatch");
    const fresh = (await leased.query(
      "select public.authorize_trial_cloud_cleanup_object_delete($1, $2, $3) as result",
      [committed.fence_id, reclaimed.object_path, reclaimed.claim_token],
    )).rows[0].result;
    assert.equal(fresh.authorized, true);
    assert.equal((await leased.query(
      "select count(*)::int as n from public.archives where user_id = $1", [TRIAL],
    )).rows[0].n, 1);
  } finally { await leased.close(); }
});
