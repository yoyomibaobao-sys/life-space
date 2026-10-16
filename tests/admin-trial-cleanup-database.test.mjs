import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

test("draft cleanup migration enforces payment and Storage fences in SQL transactions", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create schema private;
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      create function public.is_app_admin(p_user_id uuid) returns boolean
        language sql stable as $$ select p_user_id = '00000000-0000-4000-8000-000000000001'::uuid $$;
      create table private.cloud_trial_claims (
        user_id uuid primary key, cleanup_due_at timestamptz,
        cleanup_started_at timestamptz, cleanup_completed_at timestamptz,
        converted_to_paid_at timestamptz
      );
      create table public.user_memberships (
        user_id uuid primary key, plan text not null, paid_until timestamptz
      );
      create table public.membership_payments (
        id uuid primary key default gen_random_uuid(), user_id uuid not null,
        status text not null, provider_order_id text
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
        market_post_id uuid not null, path text, url text,
        thumb_path text, thumb_url text
      );
      create function public.media_object_path_from_public_url(p_url text)
      returns text language sql stable as $$
        select case when p_url like 'stored:%' then substring(p_url from 8)
                    else null end $$;
      insert into private.cloud_trial_claims (user_id, cleanup_due_at)
      values ('00000000-0000-4000-8000-000000000002', now() - interval '2 years'),
             ('00000000-0000-4000-8000-000000000003', now() - interval '2 years'),
             ('00000000-0000-4000-8000-000000000004', now() - interval '2 years');
    `);
    await db.exec(await readFile(
      "supabase/migrations/20261013005152_trial_cleanup_job_provenance.sql", "utf8"
    ));
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", ["00000000-0000-4000-8000-000000000001"]);
    await db.query(
      "insert into public.membership_payments(user_id,status,provider_order_id) values ($1,'pending_payment','qa-bound-order')",
      ["00000000-0000-4000-8000-000000000004"]
    );
    const stage = await db.query(
      "select public.admin_stage_trial_cloud_cleanup(array['y1_3']) as result"
    );
    const batchId = stage.rows[0].result.batch_id;
    assert.equal(stage.rows[0].result.candidate_accounts, 3);
    const confirm = await db.query(
      "select public.admin_confirm_trial_cloud_cleanup($1) as result", [batchId]
    );
    assert.equal(confirm.rows[0].result.execution_enabled, false);
    assert.equal((await db.query(
      "select status from private.trial_cloud_cleanup_targets where user_id = $1",
      ["00000000-0000-4000-8000-000000000004"]
    )).rows[0].status, "deferred_payment");
    await db.query(
      "update public.membership_payments set status = 'confirmed' where provider_order_id = 'qa-bound-order'"
    );
    assert.equal((await db.query(
      "select status from private.trial_cloud_cleanup_targets where user_id = $1",
      ["00000000-0000-4000-8000-000000000004"]
    )).rows[0].status, "skipped_paid");
    await db.query(
      "insert into public.user_memberships(user_id, plan, paid_until) values ($1, 'basic', now() + interval '1 year')",
      ["00000000-0000-4000-8000-000000000002"]
    );
    assert.equal((await db.query(
      "select status from private.trial_cloud_cleanup_targets where user_id = $1", ["00000000-0000-4000-8000-000000000002"]
    )).rows[0].status, "skipped_paid");

    await db.query(
      "update private.trial_cloud_cleanup_targets set status = 'deleting' where user_id = $1",
      ["00000000-0000-4000-8000-000000000003"]
    );
    await assert.rejects(db.query(
      "insert into public.membership_payments(user_id, status) values ($1, 'pending_payment')",
      ["00000000-0000-4000-8000-000000000003"]
    ), /trial_cleanup_in_progress/);
    await assert.rejects(db.query(
      "insert into public.user_memberships(user_id, plan, paid_until) values ($1, 'basic', now() + interval '1 year')",
      ["00000000-0000-4000-8000-000000000003"]
    ), /trial_cleanup_in_progress/);
    assert.equal((await db.query(
      "select count(*)::integer as n from public.membership_payments where user_id = $1",
      ["00000000-0000-4000-8000-000000000003"]
    )).rows[0].n, 0);

    const targetId = (await db.query(
      "select id from private.trial_cloud_cleanup_targets where user_id = $1", ["00000000-0000-4000-8000-000000000003"]
    )).rows[0].id;
    const jobId = (await db.query(
      "insert into public.storage_deletion_jobs(owner_user_id,source_type,source_id,job_origin,trial_cleanup_target_id) values ($1,'trial_admin',$2,'trial_admin',$2) returning id",
      ["00000000-0000-4000-8000-000000000003", targetId]
    )).rows[0].id;
    await assert.rejects(db.query(
      "insert into public.storage_deletion_items(job_id,bucket_id,object_path) values ($1,'media',$2)",
      [jobId, "00000000-0000-4000-8000-000000000003/photo.jpg"]
    ), /trial_admin_storage_delete_not_enabled/);
    const legacyId = (await db.query(
      "insert into public.storage_deletion_jobs(owner_user_id,source_type,source_id) values ($1,'media',gen_random_uuid()) returning id",
      ["00000000-0000-4000-8000-000000000003"]
    )).rows[0].id;
    await db.query(
      "insert into public.storage_deletion_items(job_id,bucket_id,object_path) values ($1,'media',$2)",
      [legacyId, "00000000-0000-4000-8000-000000000003/ordinary.jpg"]
    );
    assert.equal((await db.query(
      "select count(*)::integer as n from public.storage_deletion_items"
    )).rows[0].n, 1);
    // Separate claims exercise actual reservation transactions without
    // starting any irreversible deletion or accessing external Storage.
    const user5 = "00000000-0000-4000-8000-000000000005";
    const user6 = "00000000-0000-4000-8000-000000000006";
    await db.query(
      "insert into private.cloud_trial_claims(user_id,cleanup_due_at) values ($1,now()-interval '2 years'),($2,now()-interval '2 years')",
      [user5, user6]
    );
    const newBatch = (await db.query(
      "select public.admin_stage_trial_cloud_cleanup(array['y1_3']) as result"
    )).rows[0].result.batch_id;
    await db.query("select public.admin_confirm_trial_cloud_cleanup($1)", [newBatch]);
    const preflight = (await db.query(
      "select public.preflight_trial_cloud_cleanup($1,10) as result", [newBatch]
    )).rows[0].result;
    assert.equal(preflight.checked, 2);

    const reservation = (await db.query(
      "select public.reserve_trial_cloud_cleanup_target($1,10) as result", [newBatch]
    )).rows[0].result;
    assert.equal(reservation.reserved, true);
    assert.equal(reservation.execution_enabled, false);
    assert.ok(reservation.reservation_id);
    const reservedUser = (await db.query(
      "select user_id from private.trial_cloud_cleanup_targets where id=$1",
      [reservation.target_id]
    )).rows[0].user_id;

    // Payments win over a REVOCABLE reservation, with no irreversible action.
    await db.query(
      "insert into public.membership_payments(user_id,status) values ($1,'pending_payment')",
      [reservedUser]
    );
    const afterPayment = (await db.query(
      "select status from private.trial_cloud_cleanup_targets where id=$1",
      [reservation.target_id]
    )).rows[0].status;
    assert.equal(afterPayment, "deferred_payment");
    assert.equal((await db.query(
      "select public.release_trial_cloud_cleanup_reservation($1,$2) as released",
      [reservation.target_id, reservation.reservation_id]
    )).rows[0].released, false);

    // A second account can be reserved without touching a payment-pending one.
    const second = (await db.query(
      "select public.reserve_trial_cloud_cleanup_target($1,10) as result", [newBatch]
    )).rows[0].result;
    assert.equal(second.reserved, true);
    assert.notEqual(second.target_id, reservation.target_id);
    assert.equal((await db.query(
      "select public.release_trial_cloud_cleanup_reservation($1,$2) as released",
      [second.target_id, reservation.reservation_id]
    )).rows[0].released, false, "stale token must not release another reservation");
    assert.equal((await db.query(
      "select public.release_trial_cloud_cleanup_reservation($1,$2) as released",
      [second.target_id, second.reservation_id]
    )).rows[0].released, true);
    assert.equal((await db.query(
      "select preflight_checked_at is null as must_recheck from private.trial_cloud_cleanup_targets where id=$1",
      [second.target_id]
    )).rows[0].must_recheck, true);
    await db.query("select public.preflight_trial_cloud_cleanup($1,10)", [newBatch]);
    const next = (await db.query(
      "select public.reserve_trial_cloud_cleanup_target($1,10) as result", [newBatch]
    )).rows[0].result;
    assert.equal(next.reserved, true);

    // Simulate a lost worker: the expired lease may be replaced, not used by
    // its former holder to affect a newer reservation.
    await db.query(
      "update private.trial_cloud_cleanup_targets set reservation_expires_at=now()-interval '1 minute' where id=$1",
      [next.target_id]
    );
    const replacement = (await db.query(
      "select public.reserve_trial_cloud_cleanup_target($1,10) as result", [newBatch]
    )).rows[0].result;
    assert.equal(replacement.reserved, true);
    assert.equal(replacement.target_id, next.target_id);
    assert.notEqual(replacement.reservation_id, next.reservation_id);
    assert.equal((await db.query(
      "select public.release_trial_cloud_cleanup_reservation($1,$2) as released",
      [next.target_id, next.reservation_id]
    )).rows[0].released, false);
    const lastReservedUser = (await db.query(
      "select user_id from private.trial_cloud_cleanup_targets where id=$1",
      [next.target_id]
    )).rows[0].user_id;
    await db.query(
      "insert into public.user_memberships(user_id,plan,paid_until) values ($1,'basic',now()+interval '1 year')",
      [lastReservedUser]
    );
    assert.equal((await db.query(
      "select status from private.trial_cloud_cleanup_targets where id=$1",
      [next.target_id]
    )).rows[0].status, "skipped_paid");
    assert.equal((await db.query(
      "select public.release_trial_cloud_cleanup_reservation($1,$2) as released",
      [next.target_id, replacement.reservation_id]
    )).rows[0].released, false, "Plus must invalidate the current reservation");
    await db.query("select public.admin_cancel_trial_cloud_cleanup($1)", [newBatch]);
    assert.equal((await db.query(
      "select status from private.trial_cloud_cleanup_targets where id=$1",
      [next.target_id]
    )).rows[0].status, "skipped_paid");
    const owner7 = "00000000-0000-4000-8000-000000000007";
    const owner8 = "00000000-0000-4000-8000-000000000008";
    await db.query(
      "insert into private.cloud_trial_claims(user_id,cleanup_due_at) values ($1,now()-interval '2 years'),($2,now()-interval '2 years')",
      [owner7, owner8]
    );
    await db.query("insert into public.archives(user_id,cover_image_path) values ($1,$2)", [
      owner7, owner7 + "/cover.jpg"
    ]);
    await db.query("insert into public.archives(user_id,cover_image_path) values ($1,$2)", [
      owner8, owner7 + "/cover.jpg"
    ]);
    const planBatch = (await db.query(
      "select public.admin_stage_trial_cloud_cleanup(array['y1_3']) as result"
    )).rows[0].result.batch_id;
    await db.query("select public.admin_confirm_trial_cloud_cleanup($1)", [planBatch]);
    await db.query("select public.preflight_trial_cloud_cleanup($1,10)", [planBatch]);
    const plannedReservation = (await db.query(
      "select public.reserve_trial_cloud_cleanup_target($1,10) as result",
      [planBatch]
    )).rows[0].result;
    assert.equal(plannedReservation.reserved, true);
    const wrongToken = (await db.query(
      "select public.prepare_trial_cloud_cleanup_storage_plan($1,gen_random_uuid()) as result",
      [plannedReservation.target_id]
    )).rows[0].result;
    assert.equal(wrongToken.prepared, false);
    assert.equal(wrongToken.reason, "invalid_reservation");
    const shared = (await db.query(
      "select public.prepare_trial_cloud_cleanup_storage_plan($1,$2) as result",
      [plannedReservation.target_id, plannedReservation.reservation_id]
    )).rows[0].result;
    assert.equal(shared.prepared, false, "foreign account sharing the path blocks planning");
    assert.ok(shared.shared_path_count > 0);
    await db.query("update public.archives set cover_image_path=null where user_id=$1", [owner8]);

    // A valid raw path cannot hide an unparseable URL in the same row.
    await db.query("update public.archives set cover_image_url='https://unknown/cover.jpg' where user_id=$1", [owner7]);
    const malformed = (await db.query(
      "select public.prepare_trial_cloud_cleanup_storage_plan($1,$2) as result",
      [plannedReservation.target_id, plannedReservation.reservation_id]
    )).rows[0].result;
    assert.equal(malformed.prepared, false);
    assert.ok(malformed.unsafe_reference_count > 0);
    await db.query("update public.archives set cover_image_url=null where user_id=$1", [owner7]);
    const prepared = (await db.query(
      "select public.prepare_trial_cloud_cleanup_storage_plan($1,$2) as result",
      [plannedReservation.target_id, plannedReservation.reservation_id]
    )).rows[0].result;
    assert.equal(prepared.prepared, true);
    assert.equal(prepared.planned_object_count, 1);
    assert.equal(prepared.safe_to_delete, false);
    const repeat = (await db.query(
      "select public.prepare_trial_cloud_cleanup_storage_plan($1,$2) as result",
      [plannedReservation.target_id, plannedReservation.reservation_id]
    )).rows[0].result;
    assert.equal(repeat.planned_object_count, 1, "repeated plan does not duplicate objects");
    assert.equal((await db.query(
      "select count(*)::int as n from private.trial_cloud_cleanup_storage_plan where target_id=$1",
      [plannedReservation.target_id]
    )).rows[0].n, 1);
    assert.equal((await db.query(
      "select count(*)::int as n from public.storage_deletion_items"
    )).rows[0].n, 1, "planning cannot enqueue new physical deletes");
    // A saved inventory is evidence, not permission. Payment invalidates
    // the reservation even when the snapshot remains as an audit record.
    await db.query(
      "insert into public.membership_payments(user_id,status) values ($1,'pending_payment')",
      [owner7]
    );
    const invalidAfterPayment = (await db.query(
      "select public.prepare_trial_cloud_cleanup_storage_plan($1,$2) as result",
      [plannedReservation.target_id, plannedReservation.reservation_id]
    )).rows[0].result;
    assert.equal(invalidAfterPayment.prepared, false);
    assert.equal(invalidAfterPayment.reason, "invalid_reservation");
    assert.equal((await db.query(
      "select status from private.trial_cloud_cleanup_targets where id=$1",
      [plannedReservation.target_id]
    )).rows[0].status, "deferred_payment");
    assert.equal((await db.query(
      "select count(*)::int as n from public.storage_deletion_items"
    )).rows[0].n, 1, "subsequent payment must never enqueue old plan");

  } finally { await db.close(); }
});
