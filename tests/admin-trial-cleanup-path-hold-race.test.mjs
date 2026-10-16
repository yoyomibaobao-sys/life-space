import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile, mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { advanceTrialCleanupStorageObject } from "../lib/trial-cleanup-executor.ts";

const ADMIN = "00000000-0000-4000-8000-000000000001";
const TRIAL = "00000000-0000-4000-8000-0000000000b1";
const PLUS = "00000000-0000-4000-8000-0000000000b2";
const OBJECT_PATH = `${TRIAL}/race.jpg`;

async function freePort() {
  return await new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

async function run(command, args, { stdin = null } = {}) {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"], shell: false });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${command} ${args.join(" ")} failed: ${stderr || stdout}`));
    });
    if (stdin != null) child.stdin.end(stdin);
    else child.stdin.end();
  });
}

async function waitReady(container) {
  for (let i = 0; i < 60; i += 1) {
    try {
      await run("docker", ["exec", container, "pg_isready", "-U", "postgres"]);
      return;
    } catch {
      await delay(500);
    }
  }
  throw new Error("postgres container did not become ready");
}

async function psql(container, sql, { asAdmin = false } = {}) {
  const wrapped = asAdmin
    ? `select set_config('request.jwt.claim.sub', '${ADMIN}', false);\n${sql}`
    : sql;
  return run("docker", ["exec", "-i", container, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-At"], {
    stdin: wrapped,
  });
}

async function psqlJson(container, sql) {
  const { stdout } = await psql(container, sql, { asAdmin: true });
  const line = stdout.trim().split(/\r?\n/).filter(Boolean).at(-1);
  return JSON.parse(line);
}

async function writeContainerFile(container, remotePath, contents) {
  const local = join(workDirGlobal, remotePath.replaceAll("/", "_"));
  await writeFile(local, contents);
  await run("docker", ["cp", local, `${container}:${remotePath}`]);
}

let workDirGlobal = null;

function schemaSql() {
  return `
    create extension if not exists pgcrypto;
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth;
    create schema private;
    create schema storage;
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
}

test("two PostgreSQL sessions and isolated Storage serialize authorize against a concurrent writer, and a version-blind delete stays closed", async () => {
  let container = null;
  let workDir = null;
  try {
    await run("docker", ["version"]);
  } catch {
    assert.fail("Docker is required for the dual-session path-hold race");
  }
  const port = await freePort();
  const name = `lifespace-path-hold-${port}`;
  await run("docker", [
    "run", "--rm", "-d", "--name", name,
    "-e", "POSTGRES_PASSWORD=test",
    "-p", `${port}:5432`,
    "postgres:16",
  ]);
  container = name;
  workDir = await mkdtemp(join(tmpdir(), "path-hold-"));
  workDirGlobal = workDir;
  try {
    await waitReady(container);
    await psql(container, schemaSql());
    for (const file of [
      "supabase/migrations/20261013005152_trial_cleanup_job_provenance.sql",
      "supabase/migrations/20261013120000_trial_cleanup_execution_fence.sql",
      "supabase/migrations/20261013143000_trial_cleanup_capture_reference_fence.sql",
      "supabase/migrations/20261013160000_trial_cleanup_path_hold.sql",
      "supabase/migrations/20261013170000_trial_cleanup_restore_conflict.sql",
      "supabase/migrations/20261013180000_trial_cleanup_restore_claim.sql",
    ]) {
      const sqlPath = join(workDir, file.replaceAll("/", "_"));
      await writeFile(sqlPath, await readFile(file, "utf8"));
      await run("docker", ["cp", sqlPath, `${container}:/tmp/migration.sql`]);
      await run("docker", [
        "exec", container, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1",
        "-f", "/tmp/migration.sql",
      ]);
    }

    await psql(container, `
      insert into auth.users values ('${TRIAL}'), ('${PLUS}');
      insert into private.cloud_trial_claims (user_id, cleanup_due_at)
        values ('${TRIAL}', now() - interval '2 years');
      insert into public.users values ('${TRIAL}', 'LSa-trial'), ('${PLUS}', 'LSa-plus');
      insert into public.profiles values ('${TRIAL}', 'trial'), ('${PLUS}', 'plus');
      insert into public.archives (id, user_id, cover_image_path)
        values ('00000000-0000-4000-8000-0000000000c1', '${TRIAL}', '${OBJECT_PATH}');
      insert into public.records (id, user_id, archive_id)
        values ('00000000-0000-4000-8000-0000000000c2', '${TRIAL}',
                '00000000-0000-4000-8000-0000000000c1');
      insert into public.media (user_id, record_id, storage_path, type)
        values ('${TRIAL}', '00000000-0000-4000-8000-0000000000c2', '${OBJECT_PATH}', 'image');
      insert into storage.objects (bucket_id, name, owner_id, metadata)
        values ('media', '${OBJECT_PATH}', '${TRIAL}', '{}'::jsonb);
    `);

    const batch = await psqlJson(container, `
      select public.admin_stage_trial_cloud_cleanup(array['y1_3']);
    `);
    await psql(container, `
      select public.admin_confirm_trial_cloud_cleanup('${batch.batch_id}'::uuid);
      select public.preflight_trial_cloud_cleanup('${batch.batch_id}'::uuid, 10);
    `, { asAdmin: true });
    const reserved = await psqlJson(container, `
      select public.reserve_trial_cloud_cleanup_target('${batch.batch_id}'::uuid, 10);
    `);
    assert.equal(reserved.reserved, true);
    await psql(container, `
      select public.prepare_trial_cloud_cleanup_storage_plan(
        '${reserved.target_id}'::uuid, '${reserved.reservation_id}'::uuid);
    `);
    const committed = await psqlJson(container, `
      select public.commit_trial_cloud_cleanup_fence(
        '${reserved.target_id}'::uuid, '${reserved.reservation_id}'::uuid);
    `);
    assert.equal(committed.committed, true);
    const claim = await psqlJson(container, `
      select public.claim_trial_cloud_cleanup_storage_object('${committed.fence_id}'::uuid);
    `);
    assert.equal(claim.claimed, true);

    // Session A keeps the authorize transaction open (and the path advisory
    // lock) while Session B tries to write the same object path.
    await writeContainerFile(container, "/tmp/session_a.sql", `
      begin;
      select public.authorize_trial_cloud_cleanup_object_delete(
        '${committed.fence_id}'::uuid, '${OBJECT_PATH}', '${claim.claim_token}'::uuid);
      select pg_sleep(6);
      commit;
    `);
    await writeContainerFile(container, "/tmp/session_b.sql", `
      set lock_timeout = '15s';
      insert into public.media (user_id, record_id, storage_path, type)
      values ('${PLUS}', '00000000-0000-4000-8000-0000000000c2', '${OBJECT_PATH}', 'image');
    `);

    const sessionA = spawn("docker", [
      "exec", container, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1",
      "-f", "/tmp/session_a.sql",
    ], { stdio: ["ignore", "pipe", "pipe"] });
    let sessionAOut = "";
    sessionA.stdout.on("data", (chunk) => { sessionAOut += chunk; });
    sessionA.stderr.on("data", (chunk) => { sessionAOut += chunk; });
    await delay(1200);

    const sessionB = spawn("docker", [
      "exec", container, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1",
      "-f", "/tmp/session_b.sql",
    ], { stdio: ["ignore", "pipe", "pipe"] });
    let sessionBOut = "";
    sessionB.stdout.on("data", (chunk) => { sessionBOut += chunk; });
    sessionB.stderr.on("data", (chunk) => { sessionBOut += chunk; });

    for (let i = 0; i < 30; i += 1) {
      const waiting = (await psql(container, `
        select count(*) from pg_stat_activity
        where state = 'active' and wait_event_type = 'Lock'
          and query ilike '%insert into public.media%';
      `)).stdout.trim().split(/\r?\n/).at(-1);
      if (waiting === "1") break;
      await delay(200);
    }

    const closedA = await new Promise((resolve) => {
      sessionA.on("close", (code) => resolve({ code, out: sessionAOut }));
    });
    const closedB = await new Promise((resolve) => {
      sessionB.on("close", (code) => resolve({ code, out: sessionBOut }));
    });
    assert.equal(closedA.code, 0, closedA.out);
    assert.match(closedA.out, /authorized/);
    assert.notEqual(closedB.code, 0, closedB.out);
    assert.match(closedB.out, /trial_cleanup_path_held/);

    await assert.rejects(psql(container, `
      insert into storage.objects (bucket_id, name, owner_id)
      values ('media', '${OBJECT_PATH}', '${PLUS}');
    `), /trial_cleanup_path_held/);

    const files = new Map([[OBJECT_PATH, new TextEncoder().encode("trial-original")]]);
    const store = {
      conditionalCreate: "exclusive",
      async read({ objectPath }) {
        return files.has(objectPath) ? files.get(objectPath) : null;
      },
      async write({ objectPath }, body, options) {
        if (options?.ifAbsent && files.has(objectPath)) return "exists";
        files.set(objectPath, body);
        return "created";
      },
      async remove({ objectPath }) {
        if (!files.has(objectPath)) return "not_found";
        files.delete(objectPath);
        return "deleted";
      },
    };

    const rpc = async (name, args) => {
      const literals = Object.values(args).map((value) => {
        if (value == null) return "null";
        if (typeof value === "number") return Number.isFinite(value) ? String(value) : "null";
        if (typeof value === "boolean") return value ? "true" : "false";
        if (typeof value === "object") {
          return `'${JSON.stringify(value).replace(/'/g, "''")}'::jsonb`;
        }
        return `'${String(value).replace(/'/g, "''")}'`;
      }).join(", ");
      const data = await psqlJson(container, `select public.${name}(${literals});`);
      return { data, error: null };
    };

    let removeCount = 0;
    const refused = await advanceTrialCleanupStorageObject(async (name, args) => {
      if (name === "claim_trial_cloud_cleanup_storage_object") {
        return { data: claim, error: null };
      }
      if (name === "complete_trial_cloud_cleanup_storage_object") {
        return {
          data: { completed: false, reason: "shared_path", admin_execution_enabled: false },
          error: null,
        };
      }
      return rpc(name, args);
    }, {
      ...store,
      async remove(object) {
        removeCount += 1;
        return store.remove(object);
      },
    }, committed.fence_id);
    assert.equal(refused.outcome, "refused");
    assert.equal(refused.reason, "version_guard_unavailable");
    assert.equal(removeCount, 0);
    assert.equal(new TextDecoder().decode(files.get(OBJECT_PATH)), "trial-original");

    await psql(container, `
      update private.trial_cloud_cleanup_object_work
      set status = 'failed', claim_token = null, claim_expires_at = null,
          authorization_token = null, authorization_expires_at = null, attempts = 1
      where fence_id = '${committed.fence_id}'::uuid and object_path = '${OBJECT_PATH}';
      update private.trial_cloud_cleanup_path_holds
      set status = 'released', restore_token = null
      where fence_id = '${committed.fence_id}'::uuid and object_path = '${OBJECT_PATH}';
    `);
    const reclaim = await psqlJson(container, `
      select public.claim_trial_cloud_cleanup_storage_object('${committed.fence_id}'::uuid);
    `);
    assert.equal(reclaim.claimed, true);
    const step = await advanceTrialCleanupStorageObject(async (name, args) => {
      if (name === "claim_trial_cloud_cleanup_storage_object") {
        return { data: reclaim, error: null };
      }
      return rpc(name, args);
    }, store, committed.fence_id);
    assert.equal(step.outcome, "refused");
    assert.equal(step.reason, "version_guard_unavailable");
    assert.equal(new TextDecoder().decode(files.get(OBJECT_PATH)), "trial-original");
    assert.equal(
      new TextDecoder().decode(files.get(
        `trial-cleanup-quarantine/${committed.fence_id}/${reclaim.claim_token}/${OBJECT_PATH}`,
      )),
      "trial-original",
    );

    await psql(container, `
      alter table public.membership_payments
        disable trigger membership_payments_defer_trial_cleanup_before_insert;
      insert into public.membership_payments
        (id, user_id, status, provider_order_id, capture_requested_at)
      values ('00000000-0000-4000-8000-0000000000d1', '${TRIAL}', 'expired', 'old-order',
              now() - interval '2 days');
      alter table public.membership_payments
        enable trigger membership_payments_defer_trial_cleanup_before_insert;
    `);
    const blocked = (await psql(container, `
      select private.trial_cleanup_payment_still_absent('${TRIAL}'::uuid);
    `)).stdout.trim().split(/\r?\n/).at(-1);
    assert.equal(blocked, "f");
    const reconciled = await psqlJson(container, `
      select public.reconcile_paypal_capture_intent(
        '00000000-0000-4000-8000-0000000000d1'::uuid, 'not_captured',
        'paypal api shows no capture');
    `);
    assert.equal(reconciled.reconciled, true);
    assert.equal(reconciled.deletion_allowed, false);
    assert.equal(reconciled.admin_execution_enabled, false);
  } finally {
    if (container) {
      try { await run("docker", ["rm", "-f", container]); } catch { /* already removed */ }
    }
    if (workDir) {
      try { await rm(workDir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  }
});
