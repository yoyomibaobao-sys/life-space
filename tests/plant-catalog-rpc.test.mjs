import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

test("public plant catalog enforces the same active, basic-only contract for guests and users", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role;
      create table public.plant_species (
        id uuid primary key, slug text, common_name text, scientific_name text,
        family text, category text, sub_category text, growth_type text,
        entry_type text, sort_order integer, is_active boolean, description text
      );
      create table public.plant_species_i18n (
        plant_id uuid, language_code text, common_name text, family text, description text
      );
      create table public.plant_species_aliases (
        species_id uuid, alias_name text, relation_type text
      );
      create table public.plant_care_guides (
        plant_id uuid, language_code text, summary text, planting_guide text
      );
      insert into public.plant_species values
        ('00000000-0000-4000-8000-000000000001', 'basil', '罗勒',
          'Ocimum basilicum', '唇形科', 'herb', 'leaf', 'annual', 'plant', 1, true, '基础简介'),
        ('00000000-0000-4000-8000-000000000002', 'secret', '内部植物',
          'Secretus', '内部', 'herb', 'leaf', 'annual', 'plant', 2, false, '不可见');
      insert into public.plant_species_aliases values
        ('00000000-0000-4000-8000-000000000001', '九层塔', 'synonym'),
        ('00000000-0000-4000-8000-000000000002', '内部别名', 'synonym');
      insert into public.plant_care_guides values
        ('00000000-0000-4000-8000-000000000001', 'zh', '简化概要', '完整栽培秘密');
    `);
    const migration = readFileSync(
      new URL("../supabase/migrations/20261005052924_guest_plant_basic_overviews.sql", import.meta.url),
      "utf8",
    );
    await db.exec(migration.split("create or replace function private.get_plant_basic_overviews")[0]);

    for (const role of ["anon", "authenticated"]) {
      await db.exec("set role " + role);
      const { rows } = await db.query("select * from public.get_public_plant_catalog()");
      assert.equal(rows.length, 1);
      assert.equal(rows[0].common_name, "罗勒");
      assert.equal(rows[0].summary_zh, "简化概要");
      assert.equal(rows[0].aliases[0].alias_name, "九层塔");
      assert.equal("planting_guide" in rows[0], false);
      assert.equal("description" in rows[0], false);
      await assert.rejects(db.query("select description from public.plant_species"), /permission denied/);
      await assert.rejects(db.query("select planting_guide from public.plant_care_guides"), /permission denied/);
      for (const lookup of ["basil", "罗勒", "00000000-0000-4000-8000-000000000001"]) {
        const detail = await db.query("select id from public.get_public_plant_catalog($1)", [lookup]);
        assert.equal(detail.rows.length, 1);
      }
      const inactive = await db.query("select id from public.get_public_plant_catalog('secret')");
      assert.equal(inactive.rows.length, 0);
      await db.exec("reset role");
    }
  } finally {
    await db.close();
  }
});

test("existing plant member RLS returns complete care only to an active cloud trial or paid Plus", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth;
      create function auth.uid() returns uuid language sql stable
        as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      create table public.users (id uuid primary key, is_internal_test boolean default false);
      create table public.user_memberships (user_id uuid primary key, plan text, status text,
        paid_until timestamptz, trial_ends_at timestamptz, can_create_content boolean default false);
      create table public.plant_species (id uuid primary key, is_active boolean);
      create table public.plant_care_guides (plant_id uuid, language_code text,
        summary text, planting_guide text);
      insert into public.plant_species values
        ('00000000-0000-4000-8000-000000000001', true),
        ('00000000-0000-4000-8000-000000000002', false);
      insert into public.plant_care_guides values
        ('00000000-0000-4000-8000-000000000001', 'zh', '基础概要', '完整栽培'),
        ('00000000-0000-4000-8000-000000000002', 'zh', '不公开', '私有内容');
      insert into public.users(id) values
        ('00000000-0000-4000-8000-000000000011'),
        ('00000000-0000-4000-8000-000000000012'),
        ('00000000-0000-4000-8000-000000000013'),
        ('00000000-0000-4000-8000-000000000014'),
        ('00000000-0000-4000-8000-000000000015');
      insert into public.user_memberships values
        ('00000000-0000-4000-8000-000000000011','basic','expired',null,null,false),
        ('00000000-0000-4000-8000-000000000012','trial','trialing',null,now()+interval '7 days',false),
        ('00000000-0000-4000-8000-000000000013','basic','active',now()+interval '1 year',null,false),
        ('00000000-0000-4000-8000-000000000014','trial','expired',null,now()-interval '1 day',true),
        ('00000000-0000-4000-8000-000000000015','basic','expired',now()-interval '1 day',null,true);
      grant usage on schema auth to authenticated;
      grant select (id, is_active) on public.plant_species to authenticated;
      grant select on public.plant_care_guides to authenticated;
      alter table public.plant_care_guides enable row level security;
    `);
    const membership = readFileSync(new URL("../supabase/migrations/20260902033206_claimable_cloud_trial.sql", import.meta.url), "utf8");
    const plantPolicies = readFileSync(new URL("../supabase/migrations/20260726140000_align_membership_access_and_market_limits.sql", import.meta.url), "utf8");
    for (const [source, name] of [[membership, "is_user_membership_active"], [plantPolicies, "has_active_cloud_access"]]) {
      const match = source.match(new RegExp(`create or replace function public\\.${name}\\([\\s\\S]*?\\$\\$;`));
      assert.ok(match, name);
      await db.exec(match[0]);
    }
    const policy = plantPolicies.match(/create policy plant_care_guides_select_cloud_member[\s\S]*?\n\);/);
    assert.ok(policy);
    await db.exec(policy[0]);
    await db.exec("set role anon");
    await assert.rejects(db.query("select planting_guide from public.plant_care_guides"), /permission denied/);
    await db.exec("reset role; set role authenticated");
    for (const [id, full] of [
      ["00000000-0000-4000-8000-000000000011", false],
      ["00000000-0000-4000-8000-000000000012", true],
      ["00000000-0000-4000-8000-000000000013", true],
      ["00000000-0000-4000-8000-000000000014", false],
      ["00000000-0000-4000-8000-000000000015", false],
    ]) {
      await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
      const { rows } = await db.query("select planting_guide from public.plant_care_guides");
      assert.deepEqual(rows.map((row) => row.planting_guide), full ? ["完整栽培"] : [], id);
    }
  } finally {
    await db.close();
  }
});

test("plant Phase A preserves the legacy registered RPC; held Phase B closes it", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema private;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      create table public.plant_species (
        id uuid primary key, slug text, common_name text, scientific_name text,
        family text, category text, sub_category text, growth_type text,
        entry_type text, sort_order integer, is_active boolean, description text
      );
      create table public.plant_species_i18n (
        plant_id uuid, language_code text, common_name text, family text, description text
      );
      create table public.plant_species_aliases (species_id uuid, alias_name text, relation_type text);
      create table public.plant_care_guides (plant_id uuid, language_code text, summary text);
      insert into public.plant_species (id, slug, common_name, is_active)
        values ('00000000-0000-4000-8000-000000000001', 'basil', '罗勒', true);
      create function private.get_plant_core_parameters(uuid) returns table (species_id uuid, sun_score smallint)
        language sql as $$ select '00000000-0000-4000-8000-000000000001'::uuid, 8::smallint $$;
      create function public.get_plant_core_parameters(uuid) returns table (species_id uuid, sun_score smallint)
        language sql security invoker as $$ select * from private.get_plant_core_parameters($1) $$;
      grant usage on schema public, private to anon, authenticated;
      grant execute on function private.get_plant_core_parameters(uuid) to authenticated;
      grant execute on function public.get_plant_core_parameters(uuid) to authenticated;
    `);
    await db.exec(readFileSync(new URL("../supabase/migrations/20261005052924_guest_plant_basic_overviews.sql", import.meta.url), "utf8"));
    await db.exec("set role anon");
    assert.equal((await db.query("select common_name from public.get_public_plant_catalog()")).rows[0].common_name, "罗勒");
    await db.exec("reset role; set role authenticated");
    assert.equal((await db.query("select sun_score from public.get_plant_core_parameters(null)")).rows[0].sun_score, 8);
    await db.exec("reset role");
    await db.exec(readFileSync(new URL("../supabase/held/plant_read_phase_b.sql", import.meta.url), "utf8"));
    await db.exec("set role authenticated");
    await assert.rejects(db.query("select * from public.get_plant_core_parameters(null)"), /permission denied/);
    await assert.rejects(db.query("select * from private.get_plant_core_parameters(null)"), /permission denied/);
    assert.equal((await db.query("select common_name from public.get_public_plant_catalog()")).rows[0].common_name, "罗勒");
  } finally {
    await db.close();
  }
});
