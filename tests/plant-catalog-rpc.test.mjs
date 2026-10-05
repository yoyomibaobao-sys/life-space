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
