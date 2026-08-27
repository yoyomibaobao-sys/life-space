import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

const hardeningPath =
  "supabase/migrations/20260718140000_harden_storage_upload_capacity_refunds.sql";
const marketBindingPath =
  "supabase/migrations/20260718150000_bind_market_upload_capacity_reservations.sql";
const recoveryPath =
  "supabase/migrations/20260718160000_resume_storage_uploads_after_reservation_deploy.sql";
const binaryUploadCompatibilityPath =
  "supabase/migrations/20260726120000_accept_binary_upload_content_length.sql";
const mainOnlyCapacityPath =
  "supabase/migrations/20260726130000_count_only_main_media_toward_user_capacity.sql";

test("stage one blocks new reservations but preserves legacy drain refunds", async () => {
  const migration = await source(
    "supabase/migrations/20260718120000_add_cloud_trash_purge_orchestration.sql"
  );

  assert.match(migration, /accepting_new_reservations boolean not null default false/i);
  assert.match(migration, /'upload_maintenance'::text/i);
  assert.match(migration, /grant execute on function public\.reserve_storage_bytes\(bigint\) to authenticated/i);
  assert.doesNotMatch(migration, /revoke all on function public\.release_storage_bytes\(bigint\)/i);
});

test("final migration installs owner-bound single-use reservation tables", async () => {
  const migration = await source(hardeningPath);

  assert.match(migration, /create table public\.storage_upload_reservations/i);
  assert.match(migration, /status in \('reserved', 'settled', 'cancelled'\)/i);
  assert.match(migration, /unique \(id, owner_user_id\)/i);
  assert.match(migration, /create table public\.storage_upload_reservation_paths/i);
  assert.match(migration, /where active;/i);
  assert.match(migration, /enable row level security/gi);
  assert.match(migration, /revoke all on table public\.storage_upload_reservations from public, anon, authenticated/i);
});

test("new RPCs bind identity to auth uid and never accept an owner parameter", async () => {
  const migration = await source(marketBindingPath);

  for (const name of [
    "reserve_storage_upload",
    "cancel_storage_upload_reservation",
    "settle_storage_upload_reservation",
  ]) {
    assert.match(migration, new RegExp(`function public\\.${name}\\(`, "i"));
  }
  assert.match(migration, /v_user_id uuid := auth\.uid\(\)/gi);
  assert.doesNotMatch(
    migration,
    /function public\.(?:reserve_storage_upload|cancel_storage_upload_reservation|settle_storage_upload_reservation)\([\s\S]{0,180}p_owner_user_id/i
  );
});

test("reservation creation uses a client request id for lost-response idempotency", async () => {
  const migration = await source(marketBindingPath);
  const helper = await source("lib/storage-usage.ts");

  assert.match(migration, /function public\.reserve_storage_upload\(\s*p_reservation_id uuid/i);
  assert.match(migration, /where r\.id = p_reservation_id[\s\S]*for update/i);
  assert.match(migration, /'already_reserved'::text/i);
  assert.match(migration, /'reservation_conflict'::text/i);
  assert.match(helper, /const reservationId = params\.reservationId \|\| crypto\.randomUUID\(\)/);
  assert.match(helper, /p_reservation_id: reservationId/);
});

test("Storage writes require an active path reservation and trusted metadata size", async () => {
  const migration = await source(hardeningPath);

  assert.match(migration, /can_upload_reserved_media_object\(name, metadata\)/gi);
  assert.match(migration, /p_metadata->>'size'/gi);
  assert.match(migration, /reserved_bytes/gi);
  assert.match(migration, /create policy media_insert_own_path/i);
  assert.match(migration, /create policy media_update_own_path/i);
  assert.match(migration, /get_referenced_storage_paths/);
  assert.match(migration, /'storage_path_in_use'::text/);
});

test("binary Storage uploads validate contentLength with a completed-size fallback", async () => {
  const migration = await source(binaryUploadCompatibilityPath);

  assert.match(
    migration,
    /create or replace function public\.can_upload_reserved_media_object\(/i
  );
  assert.match(
    migration,
    /coalesce\(\s*p_metadata->>'contentLength',\s*p_metadata->>'size'/i
  );
  assert.match(migration, /\)::bigint <= rp\.reserved_bytes/i);
  assert.match(
    migration,
    /revoke all[\s\S]*can_upload_reserved_media_object\(text, jsonb\)[\s\S]*from public, anon/i
  );
  assert.match(
    migration,
    /grant execute[\s\S]*can_upload_reserved_media_object\(text, jsonb\)[\s\S]*to authenticated/i
  );
  assert.doesNotMatch(migration, /disable row level security|drop policy/i);
});

test("media insertion measures both objects but settles only main user capacity", async () => {
  const binding = await source(marketBindingPath);
  const migration = await source(mainOnlyCapacityPath);

  assert.match(binding, /add column upload_reservation_id uuid/i);
  assert.match(binding, /foreign key \(upload_reservation_id, user_id\)/i);
  assert.match(binding, /before insert on public\.media/i);
  assert.match(binding, /new\.size_bytes := v_actual_bytes/i);
  assert.match(binding, /new\.thumb_path := v_reserved_thumb_path/i);
  assert.match(migration, /private_owned_media_object_size/gi);
  assert.match(migration, /v_actual_bytes := v_main_bytes \+ v_thumb_bytes/i);
  assert.match(
    migration,
    /v_refund_bytes := v_main_path\.reserved_bytes - v_main_bytes/i
  );
  assert.match(
    migration,
    /storage_used = v_used \+ v_user_capacity_reserved_bytes/i
  );
  assert.doesNotMatch(
    migration,
    /storage_used = v_used \+ v_reserved_bytes/i
  );
});

test("cancellation refuses reservations that still have Storage objects", async () => {
  const migration = await source(mainOnlyCapacityPath);

  assert.match(migration, /join storage\.objects o/i);
  assert.match(migration, /'storage_cleanup_required'::text/i);
  assert.match(migration, /'already_cancelled'::text/i);
  assert.match(migration, /'already_settled'::text/i);
  assert.match(migration, /v_main_reserved_bytes/i);
  assert.match(
    migration,
    /storage_used = greatest\(coalesce\(p\.storage_used, 0\) - v_main_reserved_bytes, 0\)/i
  );
});

test("deletion queue keeps physical bytes separate from main-only capacity", async () => {
  const migration = await source(mainOnlyCapacityPath);

  assert.match(migration, /add column capacity_kind text not null default 'unclassified'/i);
  assert.match(migration, /add column capacity_bytes bigint/i);
  assert.match(migration, /capacity_kind in \('main', 'thumb', 'unclassified'\)/i);
  assert.match(
    migration,
    /when new\.capacity_kind = 'main' then new\.size_bytes[\s\S]*else 0/i
  );
  assert.match(
    migration,
    /storage_used = greatest\(coalesce\(p\.storage_used, 0\) - v_item\.capacity_bytes, 0\)/i
  );
  assert.doesNotMatch(
    migration,
    /storage_used = greatest\(coalesce\(p\.storage_used, 0\) - v_item\.size_bytes, 0\)/i
  );
});

test("historical reconciliation counts trusted main paths and is rerunnable", async () => {
  const migration = await source(mainOnlyCapacityPath);
  const behavior = await source(
    "supabase/tests/storage_main_only_capacity_dynamic.sql"
  );

  assert.match(migration, /private_desired_main_storage_bytes/i);
  assert.match(migration, /r\.status = 'reserved'[\s\S]*rp\.path_kind = 'main'/i);
  assert.match(migration, /i\.capacity_kind = 'main'/i);
  assert.match(
    migration,
    /v_desired_bytes := public\.private_desired_main_storage_bytes\(v_profile\.id\)/i
  );
  assert.match(
    migration,
    /private_reconcile_main_only_storage_used\(\)[\s\S]*pg_advisory_xact_lock\([\s\S]*storage-upload-owner:[\s\S]*from public\.profiles p[\s\S]*for update/i
  );
  assert.match(migration, /select public\.private_reconcile_main_only_storage_used\(\)/i);
  assert.doesNotMatch(
    migration,
    /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i
  );
  assert.doesNotMatch(migration, /storage_used\s*=\s*\d+/i);

  assert.match(behavior, /reserved_bytes <> 50[\s\S]*storage_used <> 1039/i);
  assert.match(behavior, /storage_used from public\.profiles where id = c\.user_id\) <> 120/i);
  assert.match(behavior, /v_second_changed <> 0/i);
  assert.match(behavior, /capacity_kind = 'thumb'[\s\S]*capacity_bytes = 0/i);
  assert.match(behavior, /capacity_kind = 'main'[\s\S]*capacity_bytes = 80/i);
  assert.match(behavior, /storage_used from public\.profiles where id = c\.user_id\) <> 40/i);
});

test("final permissions retire byte-only RPCs and expose only safe upload RPCs", async () => {
  const hardening = await source(hardeningPath);
  const migration = await source(marketBindingPath);

  for (const oldName of ["reserve_storage_bytes", "release_storage_bytes"]) {
    assert.match(
      hardening,
      new RegExp(
        `revoke all on function public\\.${oldName}\\(bigint\\)\\s+from public, anon, authenticated, service_role;`,
        "i"
      )
    );
  }
  for (const newName of [
    "reserve_storage_upload",
    "cancel_storage_upload_reservation",
    "settle_storage_upload_reservation",
  ]) {
    assert.match(
      migration,
      new RegExp(`grant execute on function public\\.${newName}\\([^;]+\\)\\s+to authenticated;`, "i")
    );
  }
});

test("all upload call sites use reservations and keep a maintenance message", async () => {
  const helper = await source("lib/storage-usage.ts");
  const marketHelper = await source("lib/market-media-storage.ts");
  const callSites = await Promise.all([
    source("app/archive/[id]/AddRecord.tsx"),
    source("app/archive/[id]/page.tsx"),
    source("lib/local-to-cloud-sync.ts"),
  ]);

  assert.match(helper, /STORAGE_UPLOAD_MAINTENANCE_MESSAGE/);
  assert.match(helper, /reserve_storage_upload/);
  assert.match(helper, /cancel_storage_upload_reservation/);
  assert.match(helper, /settle_storage_upload_reservation/);
  for (const callSite of callSites) {
    assert.match(callSite, /reserveStorageUpload/);
    assert.match(callSite, /cancelStorageUploadReservation/);
    assert.match(callSite, /settleStorageUploadReservation/);
    assert.match(callSite, /reconcileMediaUploadCommit/);
    assert.match(callSite, /upload_reservation_id/);
    assert.doesNotMatch(callSite, /releaseStorageBytes/);
  }

  assert.match(marketHelper, /STORAGE_UPLOAD_MAINTENANCE_MESSAGE/);
  assert.match(marketHelper, /targetType: Extract<StorageUploadTargetType, "market_cover" \| "market_media">/);
  assert.match(marketHelper, /reserveStorageUpload/);
  assert.match(marketHelper, /settleStorageUploadReservation/);
  assert.match(marketHelper, /cancelStorageUploadReservation/);
});

test("market uploads are target-bound and shared record media is not reserved again", async () => {
  const migration = await source(marketBindingPath);
  const createPage = await source("app/market/new/page.tsx");
  const editPage = await source("app/market/[id]/edit/page.tsx");

  assert.match(migration, /target_type in \('media', 'market_cover', 'market_media'\)/i);
  assert.match(migration, /add column cover_upload_reservation_id uuid/i);
  assert.match(migration, /add column upload_reservation_id uuid/i);
  assert.match(migration, /foreign key \(cover_upload_reservation_id, user_id\)/i);
  assert.match(migration, /foreign key \(upload_reservation_id, user_id\)/i);
  assert.match(createPage, /targetType: "market_media"/);
  assert.match(createPage, /setMarketPostCover/);
  assert.match(editPage, /targetType: "market_media"/);
  assert.match(createPage, /source_media_id: item\.id/);
  assert.match(migration, /shared_media_must_not_use_reservation/);
  assert.match(
    migration,
    /if new\.source_media_id is not null then[\s\S]*if new\.upload_reservation_id is not null/i,
  );
});

test("market settlement is trusted, single-use, and immutable after reference creation", async () => {
  const migration = await source(marketBindingPath);

  assert.match(migration, /settle_market_media_upload_reservation/);
  assert.match(migration, /settle_market_cover_upload_reservation/);
  assert.match(migration, /private_owned_media_object_size/gi);
  assert.match(migration, /trg_market_media_upload_identity_immutable/i);
  assert.match(migration, /before update of upload_reservation_id, path, thumb_path, source_media_id/i);
  assert.match(migration, /r\.status in \('reserved', 'settled'\)/i);
  assert.match(
    migration,
    /old\.source_media_id is not null[\s\S]*new\.source_media_id is null[\s\S]*pg_catalog\.pg_trigger_depth\(\) > 1/i,
  );
});

test("market replacement and deletion use trusted rows and the deletion queue", async () => {
  const migration = await source(marketBindingPath);
  const helper = await source("lib/market-media-storage.ts");
  const service = await source("lib/server/safe-market-media-request.ts");
  const editPage = await source("app/market/[id]/edit/page.tsx");
  const detailPage = await source("app/market/[id]/page.tsx");

  for (const name of [
    "set_market_post_cover",
    "request_delete_market_media",
    "request_delete_market_post",
  ]) {
    assert.match(migration, new RegExp(`function public\\.${name}\\(`, "i"));
  }
  assert.match(migration, /private_link_market_storage_path/);
  assert.match(migration, /source_type, source_id, status[\s\S]*'market_(?:cover|media|post)'/i);
  assert.match(migration, /revoke delete on table public\.market_media from anon, authenticated/i);
  assert.match(migration, /revoke delete on table public\.market_posts from anon, authenticated/i);
  assert.match(helper, /requestMarketMutation/);
  assert.match(service, /runStorageDeletionWorker/);
  assert.match(editPage, /requestMarketMediaDeletion/);
  assert.match(detailPage, /requestMarketPostDeletion/);
});

test("normal market pages have no direct Storage or table deletion bypass", async () => {
  const pages = await Promise.all([
    source("app/market/new/page.tsx"),
    source("app/market/[id]/edit/page.tsx"),
    source("app/market/[id]/page.tsx"),
  ]);

  for (const page of pages) {
    assert.doesNotMatch(page, /\.storage\.from\("media"\)\.(?:upload|remove)\(/);
    assert.doesNotMatch(page, /\.from\("market_(?:posts|media)"\)\s*\.delete\(/);
    assert.doesNotMatch(page, /releaseStorageBytes|release_storage_bytes/);
  }
});

test("market mutation routes enforce authenticated same-origin requests", async () => {
  const service = await source("lib/server/safe-market-media-request.ts");
  const routes = await Promise.all([
    source("app/api/market/posts/[id]/route.ts"),
    source("app/api/market/posts/[id]/cover/route.ts"),
    source("app/api/market/media/[id]/route.ts"),
  ]);

  assert.match(service, /hasValidMutationOrigin\(request\)/);
  assert.match(service, /getAuthenticatedRequestClient\(request\)/);
  assert.match(service, /if \(!UUID_PATTERN\.test\(id\)\)/);
  assert.match(service, /auth\.supabase\.rpc\(rpcName, rpcParams\)/);
  assert.doesNotMatch(service, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(routes[0], /"delete_post"/);
  assert.match(routes[1], /"set_cover"/);
  assert.match(routes[2], /"delete_media"/);
});

test("hardening migrations stay in maintenance until the post-deployment recovery step", async () => {
  const hardening = await source(hardeningPath);
  const marketBinding = await source(marketBindingPath);

  for (const migration of [hardening, marketBinding]) {
    assert.match(migration, /accepting_new_reservations = false/i);
    assert.doesNotMatch(migration, /accepting_new_reservations = true/i);
  }
});

test("post-deployment recovery validates the secure chain before reopening uploads", async () => {
  const migration = await source(recoveryPath);

  assert.match(migration, /storage_upload_reservation_schema_missing/);
  assert.match(migration, /storage_upload_reservation_rpc_missing/);
  assert.match(migration, /storage_upload_reservation_binding_missing/);
  assert.match(migration, /storage_upload_reservation_policy_missing/);
  assert.match(migration, /legacy_storage_capacity_rpc_still_exposed/);
  assert.match(migration, /storage_upload_transition_not_ready/);
  assert.match(migration, /accepting_new_reservations = true/i);
  assert.match(migration, /maintenance_started_at = null/i);
  assert.doesNotMatch(migration, /grant execute[\s\S]*release_storage_bytes/i);
});

test("deletion-item capacity settlement remains separate and item bound", async () => {
  const purge = await source(mainOnlyCapacityPath);

  assert.match(purge, /complete_storage_deletion_item/);
  assert.match(purge, /capacity_released_at is null/i);
  assert.match(purge, /p_result_code in \('deleted', 'not_found'\)/i);
  assert.match(purge, /p_result_code = 'retained_shared'/i);
});
