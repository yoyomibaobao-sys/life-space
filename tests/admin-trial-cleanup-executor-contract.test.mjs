import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  advanceTrialCleanupStorageObject,
} from "../lib/trial-cleanup-executor.ts";

const fenceSql = readFileSync(
  new URL("../supabase/migrations/20261013120000_trial_cleanup_execution_fence.sql", import.meta.url),
  "utf8",
);
const holdSql = readFileSync(
  new URL("../supabase/migrations/20261013160000_trial_cleanup_path_hold.sql", import.meta.url),
  "utf8",
);
const provenanceSql = readFileSync(
  new URL("../supabase/migrations/20261013005152_trial_cleanup_job_provenance.sql", import.meta.url),
  "utf8",
);
const worker = readFileSync(
  new URL("../app/api/internal/storage-deletion-worker/route.ts", import.meta.url),
  "utf8",
);
const server = readFileSync(
  new URL("../lib/server/trial-cleanup-executor.ts", import.meta.url),
  "utf8",
);
const restoreSql = readFileSync(
  new URL("../supabase/migrations/20261013170000_trial_cleanup_restore_conflict.sql", import.meta.url),
  "utf8",
);
const claimSql = readFileSync(
  new URL("../supabase/migrations/20261013180000_trial_cleanup_restore_claim.sql", import.meta.url),
  "utf8",
);
const executor = readFileSync(
  new URL("../lib/trial-cleanup-executor.ts", import.meta.url),
  "utf8",
);

test("the execution fence is service-only and stays off the generic worker", () => {
  assert.match(fenceSql, /grant execute on function public\.commit_trial_cloud_cleanup_fence\(uuid, uuid\)\s+to service_role/);
  assert.match(fenceSql, /grant execute on function public\.claim_trial_cloud_cleanup_storage_object\(uuid\)\s+to service_role/);
  assert.match(fenceSql, /grant execute on function public\.close_trial_cloud_cleanup_database\(uuid, uuid\)\s+to service_role/);
  assert.match(holdSql, /grant execute on function public\.record_trial_cloud_cleanup_quarantine/);
  assert.match(holdSql, /grant execute on function public\.reconcile_paypal_capture_intent/);
  assert.match(holdSql, /trial_cleanup_path_held/);
  assert.doesNotMatch(fenceSql, /grant execute on function public\.commit_trial_cloud_cleanup_fence[\s\S]*to authenticated/);
  assert.doesNotMatch(fenceSql, /insert into public\.storage_deletion_items|insert into public\.storage_deletion_jobs/i);
  assert.match(fenceSql, /admin_execution_enabled', false/);
  assert.match(provenanceSql, /raise exception 'trial_admin_storage_delete_not_enabled'/);
  assert.doesNotMatch(worker, /commit_trial_cloud_cleanup_fence|claim_trial_cloud_cleanup_storage_object|runTrialCleanupStorageStep/);
  assert.match(server, /trial_cleanup_executor_disabled/);
  assert.match(server, /TRIAL_ADMIN_CLEANUP_EXECUTOR_ENABLED !== "true"/);
  assert.match(server, /upsert: false/);
  assert.doesNotMatch(server, /upsert: true/);
  assert.match(server, /conditionalCreate: "exclusive"/);
  assert.match(server, /options\?\.contentType/);
  assert.match(restoreSql, /trial_cleanup_quarantine_no_client_access/);
  assert.match(restoreSql, /quarantine_retained_until_explicit_resolution/);
  assert.match(restoreSql, /restore_in_progress/);
  assert.doesNotMatch(restoreSql, /grant execute on function public\.mark_trial_cloud_cleanup_restore_conflict[\s\S]{0,240}to authenticated/);
  assert.match(claimSql, /adopt_trial_cloud_cleanup_restore/);
  assert.match(claimSql, /claim_expired/);
  assert.match(claimSql, /trial_cleanup_quarantine_platform_bytes/);
  assert.doesNotMatch(claimSql, /grant execute on function public\.adopt_trial_cloud_cleanup_restore[\s\S]{0,200}to authenticated/);
  assert.match(executor, /version_guard_unavailable/);
  assert.doesNotMatch(executor, /store\.remove/);
  assert.match(server, /trial_cleanup_version_guard_unavailable/);
  assert.doesNotMatch(server, /\.remove\(\[/);
});

function memoryStore(initial = {}) {
  const files = new Map(Object.entries(initial).map(([path, text]) => [
    path, new TextEncoder().encode(text),
  ]));
  return {
    files,
    async read({ objectPath }) {
      return files.has(objectPath) ? files.get(objectPath) : null;
    },
    conditionalCreate: "exclusive",
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
}

test("one storage step quarantines and refuses a version-blind delete", async () => {
  const token = "00000000-0000-4000-8000-0000000000bb";
  const objectPath = "00000000-0000-4000-8000-0000000000cc/photo.jpg";
  const calls = [];
  let removed = false;
  const store = memoryStore({ [objectPath]: "original-bytes" });
  const step = await advanceTrialCleanupStorageObject(async (name, args) => {
    calls.push(name);
    if (name === "claim_trial_cloud_cleanup_storage_object") {
      return { data: {
        claimed: true, admin_execution_enabled: false, bucket_id: "media",
        owner_user_id: "00000000-0000-4000-8000-0000000000cc",
        object_path: objectPath, claim_token: token,
      }, error: null };
    }
    if (name === "authorize_trial_cloud_cleanup_object_delete") {
      return { data: { authorized: true, admin_execution_enabled: false }, error: null };
    }
    if (name === "record_trial_cloud_cleanup_quarantine_manifest") {
      assert.match(args.p_quarantine_path, /^trial-cleanup-quarantine\//);
      assert.match(args.p_content_sha256, /^[0-9a-f]{64}$/);
      assert.equal(args.p_content_type, "application/octet-stream");
      assert.equal(args.p_content_bytes, new TextEncoder().encode("original-bytes").byteLength);
      return { data: { recorded: true, admin_execution_enabled: false }, error: null };
    }
    if (name === "recheck_trial_cloud_cleanup_object") {
      return { data: { clear: true, admin_execution_enabled: false }, error: null };
    }
    if (name === "fail_trial_cloud_cleanup_storage_object") {
      assert.equal(args.p_error_code, "version_guard_unavailable");
      return { data: { failed: true, admin_execution_enabled: false }, error: null };
    }
    throw new Error(`unexpected ${name}`);
  }, {
    ...store,
    async remove(object) {
      removed = true;
      store.files.set(object.objectPath, new TextEncoder().encode("newer-version"));
      return store.remove(object);
    },
  }, "00000000-0000-4000-8000-0000000000aa");
  assert.equal(step.outcome, "refused");
  assert.equal(step.reason, "version_guard_unavailable");
  assert.equal(step.adminExecutionEnabled, false);
  assert.equal(removed, false);
  assert.equal(new TextDecoder().decode(store.files.get(objectPath)), "original-bytes");
  assert.deepEqual(calls, [
    "claim_trial_cloud_cleanup_storage_object",
    "authorize_trial_cloud_cleanup_object_delete",
    "record_trial_cloud_cleanup_quarantine_manifest",
    "recheck_trial_cloud_cleanup_object",
    "fail_trial_cloud_cleanup_storage_object",
  ]);

  const idle = await advanceTrialCleanupStorageObject(async () => ({
    data: { claimed: false, reason: "idle", admin_execution_enabled: false }, error: null,
  }), memoryStore(), "00000000-0000-4000-8000-0000000000aa");
  assert.equal(idle.outcome, "idle");
});

test("a claim is not permission to delete when the fresh reference check fails", async () => {
  let deleted = false;
  const step = await advanceTrialCleanupStorageObject(async (name) => {
    if (name === "claim_trial_cloud_cleanup_storage_object") {
      return { data: {
        claimed: true, admin_execution_enabled: false, bucket_id: "media",
        owner_user_id: "00000000-0000-4000-8000-0000000000cc",
        object_path: "00000000-0000-4000-8000-0000000000cc/photo.jpg",
        claim_token: "00000000-0000-4000-8000-0000000000bb",
      }, error: null };
    }
    if (name === "authorize_trial_cloud_cleanup_object_delete") {
      return { data: {
        authorized: false, reason: "shared_path", admin_execution_enabled: false,
      }, error: null };
    }
    throw new Error(`unexpected ${name}`);
  }, {
    async read() { return new TextEncoder().encode("x"); },
    async write() {},
    async remove() { deleted = true; return "deleted"; },
  }, "00000000-0000-4000-8000-0000000000aa");
  assert.equal(step.outcome, "refused");
  assert.equal(step.reason, "shared_path");
  assert.equal(deleted, false);
});

test("a name-only remove is not used after the byte compare", async () => {
  const objectPath = "00000000-0000-4000-8000-0000000000cc/photo.jpg";
  const store = memoryStore({ [objectPath]: "original-bytes" });
  let removed = false;
  const step = await advanceTrialCleanupStorageObject(async (name) => {
    if (name === "claim_trial_cloud_cleanup_storage_object") {
      return { data: {
        claimed: true, admin_execution_enabled: false, bucket_id: "media",
        owner_user_id: "00000000-0000-4000-8000-0000000000cc",
        object_path: objectPath,
        claim_token: "00000000-0000-4000-8000-0000000000bb",
      }, error: null };
    }
    if (name === "authorize_trial_cloud_cleanup_object_delete"
      || name === "record_trial_cloud_cleanup_quarantine_manifest"
      || name === "recheck_trial_cloud_cleanup_object"
      || name === "fail_trial_cloud_cleanup_storage_object") {
      return { data: {
        authorized: true, recorded: true, clear: true, failed: true,
        admin_execution_enabled: false,
      }, error: null };
    }
    throw new Error(`unexpected ${name}`);
  }, {
    ...store,
    async remove() {
      removed = true;
      store.files.set(objectPath, new TextEncoder().encode("newer-version"));
      return "deleted";
    },
  }, "00000000-0000-4000-8000-0000000000aa");
  assert.equal(step.outcome, "refused");
  assert.equal(step.reason, "version_guard_unavailable");
  assert.equal(removed, false);
  assert.equal(new TextDecoder().decode(store.files.get(objectPath)), "original-bytes");
});
