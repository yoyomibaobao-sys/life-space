import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const ADMIN = "00000000-0000-4000-8000-000000000001";

const schema = `
  create role anon; create role authenticated; create role service_role bypassrls;
  create schema auth; create schema private;
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
    status text not null, provider_order_id text, provider_capture_id text,
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

async function createDb() {
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
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [ADMIN]);
  return db;
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

async function seedCloudUser(db, userId, { path = true, due = "2 years" } = {}) {
  await db.query(
    `insert into private.cloud_trial_claims (user_id, cleanup_due_at)
     values ($1, now() - interval '${due}')`, [userId]);
  await db.query(
    "insert into public.users (id, account_number) values ($1, $2)",
    [userId, `LSa-${userId.slice(-4)}`]);
  await db.query(
    "insert into public.profiles (id, username) values ($1, $2)",
    [userId, "keeper"]);
  await db.query(
    "insert into public.device_local_markers (user_id, marker) values ($1, 'saf-local')",
    [userId]);
  const archive = (await db.query(
    "insert into public.archives (user_id, cover_image_path) values ($1, $2) returning id",
    [userId, path ? `${userId}/cover.jpg` : null],
  )).rows[0].id;
  const record = (await db.query(
    "insert into public.records (user_id, archive_id) values ($1, $2) returning id",
    [userId, archive],
  )).rows[0].id;
  if (path) {
    await db.query(
      "insert into public.media (user_id, record_id, storage_path, type) values ($1, $2, $3, 'image')",
      [userId, record, `${userId}/photo.jpg`],
    );
  }
}

async function reserveReady(db, userId, { prepare = true } = {}) {
  const batchId = (await db.query(
    "select public.admin_stage_trial_cloud_cleanup(array['y1_3']) as result",
  )).rows[0].result.batch_id;
  await db.query("select public.admin_confirm_trial_cloud_cleanup($1)", [batchId]);
  await db.query("select public.preflight_trial_cloud_cleanup($1, 10)", [batchId]);
  const reserved = (await db.query(
    "select public.reserve_trial_cloud_cleanup_target($1, 10) as result", [batchId],
  )).rows[0].result;
  assert.equal(reserved.reserved, true);
  assert.equal(reserved.target_id !== undefined, true);
  const owner = (await db.query(
    "select user_id from private.trial_cloud_cleanup_targets where id = $1",
    [reserved.target_id],
  )).rows[0].user_id;
  assert.equal(owner, userId);
  if (prepare) {
    const prepared = (await db.query(
      "select public.prepare_trial_cloud_cleanup_storage_plan($1, $2) as result",
      [reserved.target_id, reserved.reservation_id],
    )).rows[0].result;
    assert.equal(prepared.prepared, true);
    assert.equal(prepared.safe_to_delete, false);
  }
  return reserved;
}

test("fence commit blocks payment and Plus, then resumes object deletion without the legacy queue", async () => {
  const db = await createDb();
  try {
    const userId = "00000000-0000-4000-8000-000000000010";
    const plusId = "00000000-0000-4000-8000-000000000011";
    await seedCloudUser(db, userId);
    await db.query(
      "insert into public.users (id, account_number) values ($1, 'plus')", [plusId]);
    await db.query(
      "insert into public.profiles (id, username) values ($1, 'plus')", [plusId]);
    await db.query(
      "insert into public.user_memberships (user_id, plan, paid_until) values ($1, 'basic', now() + interval '1 year')",
      [plusId]);
    await db.query(
      "insert into public.membership_payments (user_id, status) values ($1, 'confirmed')",
      [plusId]);
    await db.query(
      "insert into public.archives (user_id, cover_image_path) values ($1, $2)",
      [plusId, `${plusId}/kept.jpg`]);
    const legacy = (await db.query(
      "insert into public.storage_deletion_jobs (owner_user_id, source_type, source_id) values ($1, 'media', gen_random_uuid()) returning id",
      [userId],
    )).rows[0].id;
    await db.query(
      "insert into public.storage_deletion_items (job_id, bucket_id, object_path) values ($1, 'media', $2)",
      [legacy, `${userId}/ordinary.jpg`]);

    const reserved = await reserveReady(db, userId);
    const committed = (await db.query(
      "select public.commit_trial_cloud_cleanup_fence($1, $2) as result",
      [reserved.target_id, reserved.reservation_id],
    )).rows[0].result;
    assert.equal(committed.committed, true);
    assert.equal(committed.irreversible, true);
    assert.equal(committed.admin_execution_enabled, false);
    assert.equal(committed.object_count, 2);
    assert.equal(committed.target_status, "deleting");
    const again = (await db.query(
      "select public.commit_trial_cloud_cleanup_fence($1, $2) as result",
      [reserved.target_id, reserved.reservation_id],
    )).rows[0].result;
    assert.equal(again.already_recorded, true);
    assert.equal(again.fence_id, committed.fence_id);

    await assert.rejects(db.query(
      "insert into public.membership_payments (user_id, status, provider_order_id) values ($1, 'pending_payment', 'paypal-capture')",
      [userId],
    ), /trial_cleanup_in_progress/);
    await assert.rejects(db.query(
      "insert into public.user_memberships (user_id, plan, paid_until) values ($1, 'basic', now() + interval '1 year')",
      [userId],
    ), /trial_cleanup_in_progress/);
    assert.equal((await db.query(
      "select count(*)::int as n from public.storage_deletion_items",
    )).rows[0].n, 1);

    const first = (await db.query(
      "select public.claim_trial_cloud_cleanup_storage_object($1) as result",
      [committed.fence_id],
    )).rows[0].result;
    assert.equal(first.claimed, true);
    assert.equal(first.admin_execution_enabled, false);
    assert.equal((await db.query(
      "select public.fail_trial_cloud_cleanup_storage_object($1, $2, $3, 'storage_timeout') as result",
      [committed.fence_id, first.object_path, first.claim_token],
    )).rows[0].result.failed, true);
    const retried = (await db.query(
      "select public.claim_trial_cloud_cleanup_storage_object($1) as result",
      [committed.fence_id],
    )).rows[0].result;
    assert.equal(retried.claimed, true);
    assert.equal(retried.object_path, first.object_path);
    assert.notEqual(retried.claim_token, first.claim_token);
    await db.query(
      "update private.trial_cloud_cleanup_object_work set claim_expires_at = now() - interval '1 minute' where fence_id = $1 and object_path = $2",
      [committed.fence_id, retried.object_path],
    );
    assert.equal((await db.query(
      "select public.authorize_trial_cloud_cleanup_object_delete($1, $2, $3) as result",
      [committed.fence_id, retried.object_path, retried.claim_token],
    )).rows[0].result.reason, "claim_mismatch");
    const resumed = (await db.query(
      "select public.claim_trial_cloud_cleanup_storage_object($1) as result",
      [committed.fence_id],
    )).rows[0].result;
    assert.equal(resumed.object_path, first.object_path);
    assert.equal((await quarantineAndComplete(
      db, committed.fence_id, resumed.object_path, resumed.claim_token,
    )).completed, true);

    const second = (await db.query(
      "select public.claim_trial_cloud_cleanup_storage_object($1) as result",
      [committed.fence_id],
    )).rows[0].result;
    assert.equal(second.claimed, true);
    assert.notEqual(second.object_path, first.object_path);
    const done = await quarantineAndComplete(
      db, committed.fence_id, second.object_path, second.claim_token, "not_found");
    assert.equal(done.completed, true);
    assert.equal(done.remaining_objects, 0);
    assert.equal((await db.query(
      "select status from private.trial_cloud_cleanup_targets where id = $1",
      [reserved.target_id],
    )).rows[0].status, "awaiting_storage");

    const closed = (await db.query(
      "select public.close_trial_cloud_cleanup_database($1, $2) as result",
      [reserved.target_id, committed.fence_id],
    )).rows[0].result;
    assert.equal(closed.closed, true);
    assert.equal(closed.admin_execution_enabled, false);
    assert.equal((await db.query(
      "select count(*)::int as n from public.archives where user_id = $1", [userId],
    )).rows[0].n, 0);
    assert.equal((await db.query(
      "select count(*)::int as n from public.records where user_id = $1", [userId],
    )).rows[0].n, 0);
    assert.equal((await db.query(
      "select count(*)::int as n from public.media where user_id = $1", [userId],
    )).rows[0].n, 0);
    assert.equal((await db.query(
      "select username from public.profiles where id = $1", [userId],
    )).rows[0].username, "keeper");
    assert.equal((await db.query(
      "select account_number from public.users where id = $1", [userId],
    )).rows[0].account_number, `LSa-${userId.slice(-4)}`);
    assert.equal((await db.query(
      "select marker from public.device_local_markers where user_id = $1", [userId],
    )).rows[0].marker, "saf-local");
    assert.equal((await db.query(
      "select count(*)::int as n from public.archives where user_id = $1", [plusId],
    )).rows[0].n, 1);
    assert.equal((await db.query(
      "select status from public.membership_payments where user_id = $1", [plusId],
    )).rows[0].status, "confirmed");
    assert.equal((await db.query(
      "select plan from public.user_memberships where user_id = $1", [plusId],
    )).rows[0].plan, "basic");
    assert.equal((await db.query(
      "select count(*)::int as n from public.storage_deletion_items where job_id = $1",
      [legacy],
    )).rows[0].n, 1);
    assert.equal((await db.query(
      "select cleanup_completed_at is not null as done from private.cloud_trial_claims where user_id = $1",
      [userId],
    )).rows[0].done, true);
    const repeated = (await db.query(
      "select public.close_trial_cloud_cleanup_database($1, $2) as result",
      [reserved.target_id, committed.fence_id],
    )).rows[0].result;
    assert.equal(repeated.already_recorded, true);
  } finally { await db.close(); }
});

test("payment or Plus before the fence keeps the reservation revocable and the cloud rows", async () => {
  const db = await createDb();
  try {
    const paypalUser = "00000000-0000-4000-8000-000000000012";
    await seedCloudUser(db, paypalUser);
    const reserved = await reserveReady(db, paypalUser);
    await db.query(
      "insert into public.membership_payments (user_id, status, provider_order_id) values ($1, 'pending_payment', 'captured-order')",
      [paypalUser]);
    const blocked = (await db.query(
      "select public.commit_trial_cloud_cleanup_fence($1, $2) as result",
      [reserved.target_id, reserved.reservation_id],
    )).rows[0].result;
    assert.equal(blocked.committed, false);
    assert.equal(blocked.irreversible, false);
    assert.equal((await db.query(
      "select status from private.trial_cloud_cleanup_targets where id = $1",
      [reserved.target_id],
    )).rows[0].status, "deferred_payment");
    assert.equal((await db.query(
      "select count(*)::int as n from public.archives where user_id = $1", [paypalUser],
    )).rows[0].n, 1);
    assert.equal((await db.query(
      "select count(*)::int as n from private.trial_cloud_cleanup_fences",
    )).rows[0].n, 0);

    const plusUser = "00000000-0000-4000-8000-000000000013";
    await seedCloudUser(db, plusUser, { due: "30 months" });
    const plusReserved = await reserveReady(db, plusUser);
    await db.query(
      "insert into public.user_memberships (user_id, plan, paid_until) values ($1, 'basic', now() + interval '1 year')",
      [plusUser]);
    const plusBlocked = (await db.query(
      "select public.commit_trial_cloud_cleanup_fence($1, $2) as result",
      [plusReserved.target_id, plusReserved.reservation_id],
    )).rows[0].result;
    assert.equal(plusBlocked.committed, false);
    assert.equal((await db.query(
      "select status from private.trial_cloud_cleanup_targets where id = $1",
      [plusReserved.target_id],
    )).rows[0].status, "skipped_paid");
    assert.equal((await db.query(
      "select count(*)::int as n from public.media where user_id = $1", [plusUser],
    )).rows[0].n, 1);
  } finally { await db.close(); }
});

test("shared or drifted storage plans cannot cross into irreversible deletion", async () => {
  const db = await createDb();
  try {
    const owner = "00000000-0000-4000-8000-000000000014";
    const other = "00000000-0000-4000-8000-000000000015";
    await seedCloudUser(db, owner);
    await db.query(
      "insert into public.archives (user_id, cover_image_path) values ($1, $2)",
      [other, `${owner}/cover.jpg`]);
    const reserved = await reserveReady(db, owner, { prepare: false });
    assert.equal((await db.query(
      "select public.prepare_trial_cloud_cleanup_storage_plan($1, $2) as result",
      [reserved.target_id, reserved.reservation_id],
    )).rows[0].result.prepared, false);
    await db.query("delete from public.archives where user_id = $1", [other]);
    assert.equal((await db.query(
      "select public.prepare_trial_cloud_cleanup_storage_plan($1, $2) as result",
      [reserved.target_id, reserved.reservation_id],
    )).rows[0].result.prepared, true);
    await db.query(
      "insert into public.media (user_id, record_id, storage_path, type) select $1, id, $2, 'image' from public.records where user_id = $1 limit 1",
      [owner, `${owner}/extra.jpg`],
    );
    const drifted = (await db.query(
      "select public.commit_trial_cloud_cleanup_fence($1, $2) as result",
      [reserved.target_id, reserved.reservation_id],
    )).rows[0].result;
    assert.equal(drifted.committed, false);
    assert.equal(drifted.reason, "plan_stale");
    assert.equal((await db.query(
      "select status from private.trial_cloud_cleanup_targets where id = $1",
      [reserved.target_id],
    )).rows[0].status, "reserved");
  } finally { await db.close(); }
});

test("a forced payment after storage completion stops database close and preserves cloud rows", async () => {
  const db = await createDb();
  try {
    const userId = "00000000-0000-4000-8000-000000000016";
    await seedCloudUser(db, userId, { path: false });
    const reserved = await reserveReady(db, userId);
    const committed = (await db.query(
      "select public.commit_trial_cloud_cleanup_fence($1, $2) as result",
      [reserved.target_id, reserved.reservation_id],
    )).rows[0].result;
    assert.equal(committed.object_count, 0);
    assert.equal(committed.target_status, "awaiting_storage");
    await db.exec(
      "alter table public.membership_payments disable trigger membership_payments_defer_trial_cleanup_before_insert");
    await db.query(
      "insert into public.membership_payments (user_id, status) values ($1, 'confirmed')",
      [userId]);
    const halted = (await db.query(
      "select public.close_trial_cloud_cleanup_database($1, $2) as result",
      [reserved.target_id, committed.fence_id],
    )).rows[0].result;
    assert.equal(halted.closed, false);
    assert.equal(halted.reason, "payment_conflict");
    assert.equal((await db.query(
      "select count(*)::int as n from public.archives where user_id = $1", [userId],
    )).rows[0].n, 1);
    assert.equal((await db.query(
      "select username from public.profiles where id = $1", [userId],
    )).rows[0].username, "keeper");
    assert.equal((await db.query(
      "select status from private.trial_cloud_cleanup_fences where id = $1",
      [committed.fence_id],
    )).rows[0].status, "halted_paid");
  } finally { await db.close(); }
});

test("exhausted object retries do not close the database or enqueue the legacy worker", async () => {
  const db = await createDb();
  try {
    const userId = "00000000-0000-4000-8000-000000000017";
    await seedCloudUser(db, userId, { path: false });
    await db.query(
      "update public.archives set cover_image_path = $2 where user_id = $1",
      [userId, `${userId}/only.jpg`]);
    const reserved = await reserveReady(db, userId);
    const committed = (await db.query(
      "select public.commit_trial_cloud_cleanup_fence($1, $2) as result",
      [reserved.target_id, reserved.reservation_id],
    )).rows[0].result;
    assert.equal(committed.object_count, 1);
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const claimed = (await db.query(
        "select public.claim_trial_cloud_cleanup_storage_object($1) as result",
        [committed.fence_id],
      )).rows[0].result;
      assert.equal(claimed.claimed, true, `attempt ${attempt}`);
      assert.equal((await db.query(
        "select public.fail_trial_cloud_cleanup_storage_object($1, $2, $3, 'storage_timeout') as result",
        [committed.fence_id, claimed.object_path, claimed.claim_token],
      )).rows[0].result.failed, true);
    }
    const exhausted = (await db.query(
      "select public.claim_trial_cloud_cleanup_storage_object($1) as result",
      [committed.fence_id],
    )).rows[0].result;
    assert.equal(exhausted.claimed, false);
    assert.equal(exhausted.reason, "retry_exhausted");
    const closed = (await db.query(
      "select public.close_trial_cloud_cleanup_database($1, $2) as result",
      [reserved.target_id, committed.fence_id],
    )).rows[0].result;
    assert.equal(closed.closed, false);
    assert.equal(closed.reason, "storage_incomplete");
    assert.equal((await db.query(
      "select count(*)::int as n from public.archives where user_id = $1", [userId],
    )).rows[0].n, 1);
    assert.equal((await db.query(
      "select count(*)::int as n from public.storage_deletion_items",
    )).rows[0].n, 0);
    await assert.rejects(db.query(`
      insert into public.storage_deletion_jobs
        (owner_user_id, source_type, source_id, job_origin, trial_cleanup_target_id)
      values ($1, 'trial_admin', $2, 'trial_admin', $2)
      returning id
    `, [userId, reserved.target_id]).then((job) => db.query(
      "insert into public.storage_deletion_items (job_id, bucket_id, object_path) values ($1, 'media', $2)",
      [job.rows[0].id, `${userId}/only.jpg`],
    )), /trial_admin_storage_delete_not_enabled/);
  } finally { await db.close(); }
});

test("authenticated callers cannot commit or close a cleanup fence", async () => {
  const db = await createDb();
  try {
    const userId = "00000000-0000-4000-8000-000000000018";
    await seedCloudUser(db, userId, { path: false });
    const reserved = await reserveReady(db, userId);
    await db.query("set role authenticated");
    await assert.rejects(db.query(
      "select public.commit_trial_cloud_cleanup_fence($1, $2)",
      [reserved.target_id, reserved.reservation_id],
    ), /permission denied/i);
    await db.query("reset role");
    assert.equal((await db.query(
      "select status from private.trial_cloud_cleanup_targets where id = $1",
      [reserved.target_id],
    )).rows[0].status, "reserved");
  } finally { await db.close(); }
});
