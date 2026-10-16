import assert from "node:assert/strict";
import { open, readFile, mkdir, mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import {
  advanceTrialCleanupStorageObject,
  resumeTrialCleanupQuarantine,
  trialCleanupContentSha256,
} from "../lib/trial-cleanup-executor.ts";

const ADMIN = "00000000-0000-4000-8000-000000000001";
const USER = "00000000-0000-4000-8000-0000000000c1";
const ORIGINAL = Uint8Array.from([0xff, 0xd8, 0xff, 0xd9, 11, 22, 33, 44]);
const OTHER = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 99, 98, 97]);

const schema = `
  create role anon; create role authenticated; create role service_role bypassrls;
  create schema auth; create schema private; create schema storage;
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
  create table storage.objects (
    id uuid primary key default gen_random_uuid(),
    bucket_id text not null, name text not null,
    owner_id text, metadata jsonb not null default '{}'::jsonb
  );
  create function public.media_object_path_from_public_url(p_url text)
  returns text language sql stable as $$
    select case when p_url like 'stored:%' then substring(p_url from 8) else null end $$;
`;

async function createDb() {
  const db = new PGlite();
  await db.exec(schema);
  for (const file of [
    "supabase/migrations/20261013005152_trial_cleanup_job_provenance.sql",
    "supabase/migrations/20261013120000_trial_cleanup_execution_fence.sql",
    "supabase/migrations/20261013143000_trial_cleanup_capture_reference_fence.sql",
    "supabase/migrations/20261013160000_trial_cleanup_path_hold.sql",
    "supabase/migrations/20261013170000_trial_cleanup_restore_conflict.sql",
    "supabase/migrations/20261013180000_trial_cleanup_restore_claim.sql",
  ]) {
    await db.exec(await readFile(file, "utf8"));
  }
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [ADMIN]);
  return db;
}

async function readyClaim(db) {
  await db.query(
    `insert into private.cloud_trial_claims (user_id, cleanup_due_at)
     values ($1, now() - interval '2 years')`, [USER]);
  await db.query(
    "insert into public.users (id, account_number) values ($1, 'LSa-safe')", [USER]);
  await db.query(
    "insert into public.profiles (id, username) values ($1, 'keeper')", [USER]);
  const archive = (await db.query(
    "insert into public.archives (user_id) values ($1) returning id", [USER],
  )).rows[0].id;
  const record = (await db.query(
    "insert into public.records (user_id, archive_id) values ($1, $2) returning id",
    [USER, archive],
  )).rows[0].id;
  await db.query(
    "insert into public.media (user_id, record_id, storage_path, type) values ($1, $2, $3, 'image')",
    [USER, record, `${USER}/photo.jpg`],
  );
  const batchId = (await db.query(
    "select public.admin_stage_trial_cloud_cleanup(array['y1_3']) as result",
  )).rows[0].result.batch_id;
  await db.query("select public.admin_confirm_trial_cloud_cleanup($1)", [batchId]);
  await db.query("select public.preflight_trial_cloud_cleanup($1, 10)", [batchId]);
  const reserved = (await db.query(
    "select public.reserve_trial_cloud_cleanup_target($1, 10) as result", [batchId],
  )).rows[0].result;
  assert.equal(reserved.reserved, true);
  const prepared = (await db.query(
    "select public.prepare_trial_cloud_cleanup_storage_plan($1, $2) as result",
    [reserved.target_id, reserved.reservation_id],
  )).rows[0].result;
  assert.equal(prepared.prepared, true);
  const committed = (await db.query(
    "select public.commit_trial_cloud_cleanup_fence($1, $2) as result",
    [reserved.target_id, reserved.reservation_id],
  )).rows[0].result;
  assert.equal(committed.committed, true);
  assert.equal(committed.object_count, 1);
  return { fenceId: committed.fence_id, objectPath: `${USER}/photo.jpg` };
}

async function crashAfterQuarantine(db, store, fenceId) {
  let claim = null;
  let crashed = false;
  await assert.rejects(() => advanceTrialCleanupStorageObject(async (name, args) => {
    if (name === "recheck_trial_cloud_cleanup_object" && !crashed) {
      crashed = true;
      return { data: null, error: { message: "worker crashed" } };
    }
    const result = await dbRpc(db)(name, args);
    if (name === "claim_trial_cloud_cleanup_storage_object") claim = result.data;
    return result;
  }, store, fenceId), /trial_cleanup_executor_rpc_failed/);
  assert.equal(claim.claimed, true);
  return claim;
}

function dbRpc(db) {
  return async (name, args) => {
    const keys = Object.keys(args);
    const values = keys.map((key) => (
      key === "p_metadata" ? JSON.stringify(args[key] ?? {}) : args[key]
    ));
    const placeholders = keys.map((key, index) => (
      key === "p_metadata" ? `$${index + 1}::jsonb` : `$${index + 1}`
    )).join(", ");
    const data = (await db.query(
      `select public.${name}(${placeholders}) as result`, values,
    )).rows[0].result;
    return { data, error: null };
  };
}

function fileStore(root, hooks = {}) {
  const full = (objectPath) => join(root, ...objectPath.split("/"));
  const metaOf = (objectPath) => `${full(objectPath)}.meta.json`;
  const created = [];
  return {
    conditionalCreate: "exclusive",
    created,
    full,
    async read({ objectPath }) {
      try {
        return await readFile(full(objectPath));
      } catch (error) {
        if (error.code === "ENOENT") return null;
        throw error;
      }
    },
    async describe({ objectPath }) {
      try {
        const meta = JSON.parse(await readFile(metaOf(objectPath), "utf8"));
        return {
          contentType: meta.contentType || null,
          cacheControl: meta.cacheControl || null,
          metadata: meta.metadata || {},
        };
      } catch (error) {
        if (error.code === "ENOENT") return null;
        throw error;
      }
    },
    async write({ objectPath }, body, options) {
      const path = full(objectPath);
      await mkdir(dirname(path), { recursive: true });
      if (options?.ifAbsent && hooks.plantOtherVersion && objectPath === hooks.objectPath) {
        const planted = await open(path, "wx");
        await planted.writeFile(OTHER);
        await planted.close();
      }
      if (options?.ifAbsent) {
        let handle;
        try {
          handle = await open(path, "wx");
        } catch (error) {
          if (error.code === "EEXIST") return "exists";
          throw error;
        }
        await handle.writeFile(body);
        await handle.close();
        created.push(objectPath);
      } else {
        await writeFile(path, body);
      }
      await writeFile(metaOf(objectPath), JSON.stringify({
        contentType: options?.contentType || null,
        cacheControl: options?.cacheControl || null,
        metadata: options?.metadata || {},
        restoreToken: options?.restoreToken || null,
      }));
      return "created";
    },
    async remove({ objectPath }) {
      try {
        await rm(full(objectPath));
        return "deleted";
      } catch (error) {
        if (error.code === "ENOENT") return "not_found";
        throw error;
      }
    },
  };
}

async function seedOriginal(store, objectPath) {
  await store.write({ bucketId: "media", objectPath }, ORIGINAL, {
    ifAbsent: true,
    contentType: "image/jpeg",
    metadata: { camera: "plot-a" },
  });
}

test("a diverged original is kept and the quarantine copy stays", async () => {
  const db = await createDb();
  const root = await mkdtemp(join(tmpdir(), "trial-restore-"));
  try {
    const { fenceId, objectPath } = await readyClaim(db);
    const store = fileStore(root);
    await seedOriginal(store, objectPath);
    let removed = false;
    const step = await advanceTrialCleanupStorageObject(dbRpc(db), {
      ...store,
      async write(object, body, options) {
        const result = await store.write(object, body, options);
        if (String(object.objectPath).startsWith("trial-cleanup-quarantine/") && result === "created") {
          await writeFile(store.full(objectPath), OTHER);
        }
        return result;
      },
      async remove(object) {
        removed = true;
        return store.remove(object);
      },
    }, fenceId);
    assert.equal(step.outcome, "refused");
    assert.equal(step.reason, "object_overwritten");
    assert.equal(step.adminExecutionEnabled, false);
    assert.equal(removed, false);
    assert.equal(Buffer.compare(await readFile(store.full(objectPath)), OTHER), 0);
    const quarantine = store.created.find((path) => path.startsWith("trial-cleanup-quarantine/"));
    assert.equal(trialCleanupContentSha256(await readFile(store.full(quarantine))), trialCleanupContentSha256(ORIGINAL));
    const hold = (await db.query(
      "select status, conflict_reason, quarantine_path from private.trial_cloud_cleanup_path_holds where fence_id = $1",
      [fenceId],
    )).rows[0];
    assert.equal(hold.status, "conflict");
    assert.equal(hold.conflict_reason, "object_overwritten");
    assert.equal(hold.quarantine_path, quarantine);
    const platform = Number((await db.query(
      "select public.trial_cleanup_quarantine_platform_bytes($1) as bytes", [fenceId],
    )).rows[0].bytes);
    assert.equal(platform, ORIGINAL.byteLength);
    assert.equal((await db.query(
      "select public.trial_cleanup_object_counts_toward_owner_quota($1) as counts",
      [hold.quarantine_path],
    )).rows[0].counts, false);
    const purged = (await db.query(
      "select public.purge_trial_cleanup_quarantine($1) as result", [fenceId],
    )).rows[0].result;
    assert.equal(purged.purged, false);
    assert.equal(purged.retained, true);
    assert.equal(trialCleanupContentSha256(await readFile(store.full(quarantine))), trialCleanupContentSha256(ORIGINAL));
  } finally {
    await rm(root, { recursive: true, force: true });
    await db.close();
  }
});

test("an already released restore token never writes the original path", async () => {
  const db = await createDb();
  const root = await mkdtemp(join(tmpdir(), "trial-restore-"));
  try {
    const { fenceId, objectPath } = await readyClaim(db);
    const store = fileStore(root);
    await seedOriginal(store, objectPath);
    const claim = await crashAfterQuarantine(db, store, fenceId);
    await db.query(
      `update private.trial_cloud_cleanup_path_holds
       set status = 'released', restore_token = null
       where fence_id = $1 and object_path = $2`,
      [fenceId, claim.object_path],
    );
    await rm(store.full(claim.object_path));
    const fresh = fileStore(root);
    let writes = 0;
    const step = await resumeTrialCleanupQuarantine(dbRpc(db), {
      ...fresh,
      async write(object, body, options) {
        writes += 1;
        return fresh.write(object, body, options);
      },
    }, fenceId, claim.object_path, claim.claim_token);
    assert.equal(step.outcome, "refused");
    assert.equal(step.reason, "already_released");
    assert.equal(writes, 0);
    await assert.rejects(readFile(store.full(claim.object_path)), { code: "ENOENT" });
    const begun = (await db.query(
      "select public.begin_trial_cloud_cleanup_restore($1, $2, $3) as result",
      [fenceId, claim.object_path, claim.claim_token],
    )).rows[0].result;
    assert.equal(begun.already_released, true);
    assert.equal(begun.started, false);
    assert.equal(begun.restore_token, null);
  } finally {
    await rm(root, { recursive: true, force: true });
    await db.close();
  }
});

test("a restarted worker restores only from the persisted quarantine copy", async () => {
  const db = await createDb();
  const root = await mkdtemp(join(tmpdir(), "trial-restore-"));
  try {
    const { fenceId, objectPath } = await readyClaim(db);
    const store = fileStore(root);
    await seedOriginal(store, objectPath);
    const memory = Uint8Array.from(ORIGINAL);
    const claim = await crashAfterQuarantine(db, store, fenceId);
    memory.fill(0);
    await rm(store.full(claim.object_path));
    await rm(`${store.full(claim.object_path)}.meta.json`);
    const quarantine = store.created.find((path) => path.startsWith("trial-cleanup-quarantine/"));
    const quarantineBytes = await readFile(store.full(quarantine));
    const restarted = fileStore(root);
    const step = await resumeTrialCleanupQuarantine(
      dbRpc(db), restarted, fenceId, claim.object_path, claim.claim_token,
    );
    assert.equal(step.reason, "restored");
    assert.equal(step.adminExecutionEnabled, false);
    const restored = await readFile(restarted.full(claim.object_path));
    assert.deepEqual(restored, quarantineBytes);
    assert.equal(trialCleanupContentSha256(restored), trialCleanupContentSha256(ORIGINAL));
    assert.equal(memory.every((byte) => byte === 0), true);
    const meta = JSON.parse(await readFile(`${restarted.full(claim.object_path)}.meta.json`, "utf8"));
    assert.equal(meta.contentType, "image/jpeg");
    assert.equal(meta.metadata.camera, "plot-a");
    assert.equal(typeof meta.restoreToken, "string");
  } finally {
    await rm(root, { recursive: true, force: true });
    await db.close();
  }
});

test("a second worker does not receive a restore token or write the original", async () => {
  const db = await createDb();
  const root = await mkdtemp(join(tmpdir(), "trial-restore-"));
  try {
    const { fenceId, objectPath } = await readyClaim(db);
    const store = fileStore(root);
    await seedOriginal(store, objectPath);
    const claim = await crashAfterQuarantine(db, store, fenceId);
    const first = (await db.query(
      "select public.adopt_trial_cloud_cleanup_restore($1, $2, $3) as result",
      [fenceId, claim.object_path, claim.claim_token],
    )).rows[0].result;
    assert.equal(first.started, true);
    assert.equal(typeof first.restore_token, "string");
    const second = (await db.query(
      "select public.adopt_trial_cloud_cleanup_restore($1, $2, $3) as result",
      [fenceId, claim.object_path, claim.claim_token],
    )).rows[0].result;
    assert.equal(second.started, false);
    assert.equal(second.reason, "restore_in_progress");
    assert.equal(second.restore_token, null);
    const snapshot = (await db.query(
      "select public.read_trial_cloud_cleanup_quarantine($1, $2) as result",
      [fenceId, claim.object_path],
    )).rows[0].result;
    assert.equal(snapshot.status, "restoring");
    assert.equal(snapshot.restore_token, null);
    await writeFile(store.full(claim.object_path), OTHER);
    const fresh = fileStore(root);
    let writes = 0;
    const step = await resumeTrialCleanupQuarantine(dbRpc(db), {
      ...fresh,
      async write(object, body, options) {
        writes += 1;
        return fresh.write(object, body, options);
      },
    }, fenceId, claim.object_path, claim.claim_token);
    assert.equal(step.outcome, "refused");
    assert.equal(step.reason, "restore_in_progress");
    assert.equal(writes, 0);
    assert.equal(Buffer.compare(await readFile(store.full(claim.object_path)), OTHER), 0);
    assert.equal(fresh.created.some((path) => path === claim.object_path), false);
  } finally {
    await rm(root, { recursive: true, force: true });
    await db.close();
  }
});

test("an expired claim and an old token never write the original path", async () => {
  const db = await createDb();
  const root = await mkdtemp(join(tmpdir(), "trial-restore-"));
  try {
    const { fenceId, objectPath } = await readyClaim(db);
    const store = fileStore(root);
    await seedOriginal(store, objectPath);
    const claim = await crashAfterQuarantine(db, store, fenceId);
    const begun = (await db.query(
      "select public.begin_trial_cloud_cleanup_restore($1, $2, $3) as result",
      [fenceId, claim.object_path, claim.claim_token],
    )).rows[0].result;
    assert.equal(begun.started, true);
    await db.query(
      `update private.trial_cloud_cleanup_object_work
       set claim_expires_at = clock_timestamp() - interval '1 minute'
       where fence_id = $1`,
      [fenceId],
    );
    let writes = 0;
    const expired = fileStore(root);
    const expiredStep = await resumeTrialCleanupQuarantine(dbRpc(db), {
      ...expired,
      async write(object, body, options) {
        writes += 1;
        return expired.write(object, body, options);
      },
    }, fenceId, claim.object_path, claim.claim_token);
    assert.equal(expiredStep.outcome, "refused");
    assert.equal(expiredStep.reason, "claim_expired");
    assert.equal(writes, 0);
    assert.equal(Buffer.compare(await readFile(store.full(claim.object_path)), ORIGINAL), 0);

    await db.query(
      `update private.trial_cloud_cleanup_path_holds
       set restore_lease_expires_at = clock_timestamp() - interval '1 minute'
       where fence_id = $1`,
      [fenceId],
    );
    const reclaimed = (await db.query(
      "select public.claim_trial_cloud_cleanup_storage_object($1) as result", [fenceId],
    )).rows[0].result;
    assert.equal(reclaimed.claimed, true);
    assert.notEqual(reclaimed.claim_token, claim.claim_token);
    const oldStep = await resumeTrialCleanupQuarantine(
      dbRpc(db), expired, fenceId, claim.object_path, claim.claim_token,
    );
    assert.equal(oldStep.outcome, "refused");
    assert.equal(oldStep.reason, "claim_mismatch");
    assert.equal(writes, 0);
    await writeFile(store.full(claim.object_path), OTHER);
    const newer = await resumeTrialCleanupQuarantine(
      dbRpc(db), fileStore(root), fenceId, claim.object_path, reclaimed.claim_token,
    );
    assert.equal(newer.outcome, "refused");
    assert.equal(newer.reason, "object_overwritten");
    assert.equal(Buffer.compare(await readFile(store.full(claim.object_path)), OTHER), 0);
  } finally {
    await rm(root, { recursive: true, force: true });
    await db.close();
  }
});

test("a crashed restore can be reclaimed only by the new claim token", async () => {
  const db = await createDb();
  const root = await mkdtemp(join(tmpdir(), "trial-restore-"));
  try {
    const { fenceId, objectPath } = await readyClaim(db);
    const store = fileStore(root);
    await seedOriginal(store, objectPath);
    const claim = await crashAfterQuarantine(db, store, fenceId);
    await db.query(
      `update private.trial_cloud_cleanup_object_work
       set claim_expires_at = clock_timestamp() - interval '1 minute'
       where fence_id = $1`,
      [fenceId],
    );
    const reclaimed = (await db.query(
      "select public.claim_trial_cloud_cleanup_storage_object($1) as result", [fenceId],
    )).rows[0].result;
    assert.equal(reclaimed.claimed, true);
    await rm(store.full(claim.object_path));
    let writes = 0;
    const oldStore = fileStore(root);
    const oldStep = await resumeTrialCleanupQuarantine(dbRpc(db), {
      ...oldStore,
      async write(object, body, options) {
        writes += 1;
        return oldStore.write(object, body, options);
      },
    }, fenceId, claim.object_path, claim.claim_token);
    assert.equal(oldStep.reason, "claim_mismatch");
    assert.equal(writes, 0);
    await assert.rejects(readFile(store.full(claim.object_path)), { code: "ENOENT" });
    const step = await resumeTrialCleanupQuarantine(
      dbRpc(db), fileStore(root), fenceId, claim.object_path, reclaimed.claim_token,
    );
    assert.equal(step.reason, "restored");
    assert.equal(Buffer.compare(await readFile(store.full(claim.object_path)), ORIGINAL), 0);
  } finally {
    await rm(root, { recursive: true, force: true });
    await db.close();
  }
});

test("a matching compare does not remove a newer object version", async () => {
  const db = await createDb();
  const root = await mkdtemp(join(tmpdir(), "trial-restore-"));
  try {
    const { fenceId, objectPath } = await readyClaim(db);
    const store = fileStore(root);
    await seedOriginal(store, objectPath);
    let removed = false;
    const step = await advanceTrialCleanupStorageObject(dbRpc(db), {
      ...store,
      async remove(object) {
        removed = true;
        await writeFile(store.full(objectPath), OTHER);
        return store.remove(object);
      },
    }, fenceId);
    assert.equal(step.outcome, "refused");
    assert.equal(step.reason, "version_guard_unavailable");
    assert.equal(step.adminExecutionEnabled, false);
    assert.equal(removed, false);
    assert.equal(Buffer.compare(await readFile(store.full(objectPath)), ORIGINAL), 0);
    const hold = (await db.query(
      `select status, content_bytes, quarantine_path
       from private.trial_cloud_cleanup_path_holds where fence_id = $1`,
      [fenceId],
    )).rows[0];
    assert.equal(hold.status, "released");
    assert.equal(Number(hold.content_bytes), ORIGINAL.byteLength);
    assert.match(hold.quarantine_path, /^trial-cleanup-quarantine\//);
    assert.equal(Buffer.compare(await readFile(store.full(hold.quarantine_path)), ORIGINAL), 0);
    const platform = Number((await db.query(
      "select public.trial_cleanup_quarantine_platform_bytes($1) as bytes", [fenceId],
    )).rows[0].bytes);
    assert.equal(platform, ORIGINAL.byteLength);
    assert.equal((await db.query(
      "select public.trial_cleanup_object_counts_toward_owner_quota($1) as counts",
      [hold.quarantine_path],
    )).rows[0].counts, false);
  } finally {
    await rm(root, { recursive: true, force: true });
    await db.close();
  }
});

test("a failed conditional create leaves the version that won the path", async () => {
  const db = await createDb();
  const root = await mkdtemp(join(tmpdir(), "trial-restore-"));
  try {
    const { fenceId, objectPath } = await readyClaim(db);
    const store = fileStore(root);
    await seedOriginal(store, objectPath);
    const claim = await crashAfterQuarantine(db, store, fenceId);
    await rm(store.full(claim.object_path));
    const contending = fileStore(root, { plantOtherVersion: true, objectPath: claim.object_path });
    const step = await resumeTrialCleanupQuarantine(
      dbRpc(db), contending, fenceId, claim.object_path, claim.claim_token,
    );
    assert.equal(step.outcome, "refused");
    assert.equal(step.reason, "conditional_write_failed");
    assert.equal(Buffer.compare(await readFile(store.full(claim.object_path)), OTHER), 0);
    assert.equal(contending.created.includes(claim.object_path), false);
    const hold = (await db.query(
      "select status, conflict_reason from private.trial_cloud_cleanup_path_holds where fence_id = $1",
      [fenceId],
    )).rows[0];
    assert.equal(hold.status, "conflict");
    assert.equal(hold.conflict_reason, "conditional_write_failed");
  } finally {
    await rm(root, { recursive: true, force: true });
    await db.close();
  }
});

test("quarantine copies are hidden from client roles and excluded from owner quota", async () => {
  const db = await createDb();
  try {
    const quota = (await db.query(
      "select public.trial_cleanup_object_counts_toward_owner_quota($1) as user_path, public.trial_cleanup_object_counts_toward_owner_quota($2) as quarantine",
      [`${USER}/photo.jpg`, `trial-cleanup-quarantine/fence/token/${USER}/photo.jpg`],
    )).rows[0];
    assert.equal(quota.user_path, true);
    assert.equal(quota.quarantine, false);
    await db.exec(`
      grant usage on schema storage to anon, authenticated;
      grant select, insert on storage.objects to anon, authenticated;
      create policy storage_objects_read_all on storage.objects
        for select to anon, authenticated using (true);
    `);
    await db.query(
      "insert into storage.objects (bucket_id, name) values ('media', $1), ('media', $2)",
      [`trial-cleanup-quarantine/fence/token/${USER}/photo.jpg`, `${USER}/photo.jpg`],
    );
    await db.exec("set role anon");
    const visible = (await db.query(
      "select name from storage.objects order by name",
    )).rows.map((row) => row.name);
    assert.deepEqual(visible, [`${USER}/photo.jpg`]);
    await assert.rejects(db.query(
      "insert into storage.objects (bucket_id, name) values ('media', 'trial-cleanup-quarantine/other.jpg')",
    ), /row-level security|trial_cleanup_quarantine/);
    await db.exec("reset role");
  } finally {
    await db.close();
  }
});
