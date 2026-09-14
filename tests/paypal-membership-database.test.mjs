import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import test from "node:test";

import { PGlite } from "@electric-sql/pglite";

test("PayPal migration executes and passes isolated transactional behavior", async () => {
  const db = new PGlite();

  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role bypassrls;

      create schema auth;
      create function auth.uid()
      returns uuid
      language sql
      stable
      as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
      $$;

      create table auth.users (
        id uuid primary key,
        aud text,
        role text,
        email text,
        created_at timestamptz default now(),
        updated_at timestamptz default now()
      );

      create table public.users (
        id uuid primary key,
        username text,
        created_at timestamptz default now(),
        role text,
        status text,
        cloud_enabled boolean default false
      );

      create table public.profiles (
        id uuid primary key,
        username text,
        storage_limit bigint default 0,
        updated_at timestamptz default now()
      );

      create table public.user_memberships (
        user_id uuid primary key,
        plan text,
        status text,
        trial_started_at timestamptz default now(),
        trial_ends_at timestamptz default (now() + interval '90 days'),
        paid_until timestamptz,
        storage_limit_bytes bigint default 0,
        base_market_post_limit integer default 0,
        created_at timestamptz default now(),
        updated_at timestamptz default now()
      );

      create table public.membership_payments (
        id uuid primary key default gen_random_uuid(),
        user_id uuid not null,
        plan text not null,
        status text not null,
        amount numeric(10, 2) not null,
        currency text not null,
        payment_method text not null,
        payment_reference text,
        note text,
        paid_at timestamptz,
        service_started_at timestamptz,
        service_ends_at timestamptz,
        created_by uuid,
        created_at timestamptz default now(),
        updated_at timestamptz default now(),
        order_number text,
        proof_path text,
        submitted_at timestamptz,
        reviewed_at timestamptz,
        reviewed_by uuid,
        review_note text,
        expires_at timestamptz,
        payment_destination_key text,
        payment_destination_label text,
        payment_destination_url text,
        payment_destination_version text,
        closed_at timestamptz,
        close_reason text
      );
    `);

    const migration = await readFile(
      "supabase/migrations/20260911173500_add_paypal_auto_membership.sql",
      "utf8"
    );
    await db.exec(migration);

    const behavior = await readFile(
      "supabase/tests/paypal_auto_membership_dynamic.sql",
      "utf8"
    );
    await db.exec(behavior);

    const { rows: indexes } = await db.query(`
      select indexname
      from pg_indexes
      where schemaname = 'public'
        and indexname in (
          'membership_payments_provider_order_uidx',
          'membership_payments_provider_capture_uidx'
        )
      order by indexname
    `);
    assert.deepEqual(
      indexes.map((row) => row.indexname),
      [
        "membership_payments_provider_capture_uidx",
        "membership_payments_provider_order_uidx",
      ]
    );
  } finally {
    await db.close();
  }
});
