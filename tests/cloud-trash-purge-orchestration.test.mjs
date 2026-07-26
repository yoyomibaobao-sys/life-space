import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL(
    "../supabase/migrations/20260718120000_add_cloud_trash_purge_orchestration.sql",
    import.meta.url
  ),
  "utf8"
);
const uploadHardeningMigration = readFileSync(
  new URL(
    "../supabase/migrations/20260718140000_harden_storage_upload_capacity_refunds.sql",
    import.meta.url
  ),
  "utf8"
);
const worker = readFileSync(
  new URL("../lib/server/storage-deletion-worker.ts", import.meta.url),
  "utf8"
);

test("purge orchestration is service-role only", () => {
  assert.match(
    migration,
    /revoke all on function public\.request_purge_trash_entry\(uuid, text, uuid\)[\s\S]*?from public, anon, authenticated;/i
  );
  assert.match(
    migration,
    /grant execute on function public\.request_purge_trash_entry\(uuid, text, uuid\)[\s\S]*?to service_role;/i
  );
});

test("legacy permanent delete RPCs are not callable by API roles", () => {
  for (const name of ["archive", "record", "media"]) {
    assert.match(
      migration,
      new RegExp(
        `revoke all on function public\\.request_delete_${name}\\(uuid\\)\\s+from public, anon, authenticated, service_role;`,
        "i"
      )
    );
  }
});

test("upload drain keeps legacy release until reservation hardening is installed", () => {
  assert.match(migration, /accepting_new_reservations boolean not null default false/i);
  assert.match(migration, /'upload_maintenance'::text/i);
  assert.doesNotMatch(
    migration,
    /revoke all on function public\.release_storage_bytes\(bigint\)/i
  );
  assert.match(
    uploadHardeningMigration,
    /revoke all on function public\.release_storage_bytes\(bigint\)[\s\S]*?from public, anon, authenticated, service_role;/i
  );
});

test("only an owned active root trash entry can begin purge", () => {
  assert.match(migration, /te\.owner_user_id = p_owner_user_id/i);
  assert.match(migration, /te\.root_type = p_target_type/i);
  assert.match(migration, /te\.root_id = p_target_id/i);
  assert.match(migration, /if v_entry\.status <> 'active'/i);
  assert.match(migration, /status = 'purging'/i);
});

test("trash entries have durable job linkage and cross-job item linkage", () => {
  assert.match(
    migration,
    /add column deletion_job_id uuid[\s\S]*?references public\.storage_deletion_jobs\(id\) on delete restrict/i
  );
  assert.match(
    migration,
    /create table public\.storage_deletion_job_items/i
  );
  assert.match(migration, /primary key \(job_id, item_id\)/i);
});

test("trusted bytes come from Storage metadata and are never estimated", () => {
  assert.match(migration, /from storage\.objects o/i);
  assert.match(migration, /o\.metadata ->> 'size'/i);
  assert.match(migration, /else null::bigint/i);
});

test("capacity settlement is item-bound and non-negative", () => {
  assert.match(migration, /from public\.storage_deletion_items i[\s\S]*?for update;/i);
  assert.match(migration, /v_item\.capacity_released_at/i);
  assert.match(
    migration,
    /storage_used = greatest\(coalesce\(p\.storage_used, 0\) - v_item\.size_bytes, 0\)/i
  );
  assert.match(
    migration,
    /p_result_code = 'retained_shared' then i\.capacity_released_at/i
  );
});

test("unknown bytes block purged state without blocking physical deletion", () => {
  assert.match(
    migration,
    /if v_item\.size_bytes is null then\s+v_requires_reconciliation := true;/i
  );
  assert.match(
    migration,
    /last_error_code = 'capacity_reconciliation_required'/i
  );
  assert.match(migration, /status = 'failed'/i);
});

test("job aggregation includes canonical items owned by another job", () => {
  assert.match(
    migration,
    /from public\.storage_deletion_job_items ji[\s\S]*?where ji\.job_id = p_job_id/i
  );
  assert.match(
    migration,
    /status in \('pending', 'processing', 'retry_wait'\)/i
  );
  assert.match(
    migration,
    /i\.status = 'failed'[\s\S]*?status = 'pending'[\s\S]*?attempts = 0/i
  );
});

test("a retained shared object can be safely reconsidered after its last reference is removed", () => {
  assert.match(
    migration,
    /i\.status = 'retained_shared'[\s\S]*?i\.result_code = 'retained_shared'/i,
  );
  assert.match(
    migration,
    /i\.capacity_released_at is null[\s\S]*?status = 'pending'[\s\S]*?result_code = null/i,
  );
});

test("archive and record purges include existing descendant root tombstones", () => {
  assert.match(migration, /v_related_entry_ids uuid\[\]/i);
  assert.match(migration, /te\.target_type = 'record'/i);
  assert.match(migration, /te\.target_type = 'media'/i);
  assert.match(
    migration,
    /where te\.id = any\(v_related_entry_ids\)[\s\S]*?status = 'purging'/i
  );
});

test("purged and failed trash states are derived from job terminal state", () => {
  assert.match(migration, /if v_job_status = 'failed'/i);
  assert.match(migration, /status = 'purged'/i);
  assert.match(migration, /purged_at = now\(\)/i);
});

test("worker refreshes all trash purges linked to a completed or failed item", () => {
  const calls = worker.match(/refresh_cloud_trash_purges_for_item/g) ?? [];
  assert.equal(calls.length, 2);
  assert.match(worker, /p_item_id: item\.item_id/i);
});
