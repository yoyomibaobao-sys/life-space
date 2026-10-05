import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { build } from "esbuild";

// Deliberately different from the source database UUID: seed joins by guide identity.
const guideId = "00000000-0000-4000-8000-000000000077";
const basicId = "00000000-0000-4000-8000-000000000011";
const trialId = "00000000-0000-4000-8000-000000000012";
const plusId = "00000000-0000-4000-8000-000000000013";
const expiredId = "00000000-0000-4000-8000-000000000014";
const expiredPlusId = "00000000-0000-4000-8000-000000000015";

test("real guide SQL restricts guests/basic to active summaries and grants full content only to active trial/Plus", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role;
      create schema auth;
      create function auth.uid() returns uuid language sql stable
        as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      create table public.users (id uuid primary key, is_internal_test boolean default false);
      create table public.user_memberships (
        user_id uuid primary key, plan text, status text, paid_until timestamptz,
        trial_ends_at timestamptz, can_create_content boolean default false
      );
      create table public.guide_entries (
        id uuid primary key, category text, name text, name_en text,
        source text, section_id uuid, summary text, summary_en text,
        content_template text, content jsonb, content_en jsonb,
        sort_order integer, is_active boolean, created_by uuid, admin_note text
      );
      insert into public.guide_entries values
        ('${guideId}', 'insect_fish', '矮珍珠', 'Guide', 'preset', null,
          '公开基础概要', 'Basic public overview', 'generic',
          '{"sections":[{"title":"私有完整细节","items":["仅完整会员"]}]}',
          '{}', 1, true, null, '管理备注'),
        ('00000000-0000-4000-8000-000000000099', 'system', '未发布',
          'Inactive', 'preset', null, '不公开', 'Hidden', 'generic',
          '{"overview":"保密"}', '{}', 2, false, null, 'internal');
      insert into public.users(id) values ('${basicId}'), ('${trialId}'), ('${plusId}'), ('${expiredId}'), ('${expiredPlusId}');
      insert into public.user_memberships values
        ('${basicId}', 'basic', 'expired', null, null, false),
        ('${trialId}', 'trial', 'trialing', null, now()+interval '7 days', false),
        ('${plusId}', 'basic', 'active', now()+interval '1 year', null, false),
        ('${expiredId}', 'trial', 'expired', null, now()-interval '1 day', true),
        ('${expiredPlusId}', 'basic', 'expired', now()-interval '1 day', null, true);
      alter table public.guide_entries enable row level security;
      create policy guide_public on public.guide_entries for select to anon, authenticated
        using (is_active = true);
      grant usage on schema public, auth to anon, authenticated;
      grant select on public.guide_entries to anon, authenticated;
    `);
    const migration = readFileSync(new URL("../supabase/migrations/20261005110000_controlled_public_guide_reads.sql", import.meta.url), "utf8");
    await db.exec(migration);

    await db.exec(`insert into public.guide_entries values
      ('00000000-0000-4000-8000-000000000088', 'other', '新审核指引',
       'New approved guide', 'approved', null, '简化概要', 'Basic overview',
       'generic', '{"sections":[{"title":"经核对的操作","items":["安全步骤"]}]}',
       '{}', 3, true, null, 'private admin note')`);

    for (const [role, id] of [["anon", ""], ["authenticated", basicId]]) {
      await db.exec(`set role ${role}`);
      await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
      const catalog = await db.query("select * from public.get_public_guide_catalog()");
      assert.equal(catalog.rows.length, 2);
      const guide = catalog.rows.find((row) => row.id === guideId);
      assert.equal(guide.summary, "公开基础概要");
      assert.equal(guide.content_template, "generic");
      assert.deepEqual(guide.content, { filters: {} });
      assert.deepEqual(Object.keys(catalog.rows[0]).sort(), ["category", "content", "content_template", "id", "is_active", "name", "name_en", "section_id", "sort_order", "source", "summary", "summary_en"].sort());
      assert.equal((await db.query("select id from public.get_public_guide_catalog($1)", ["00000000-0000-4000-8000-000000000099"])).rows.length, 0);
      await assert.rejects(db.query("select content from public.guide_entries"), /permission denied/);
      await assert.rejects(db.query("select content_en, content_template from public.guide_entries"), /permission denied/);
      await assert.rejects(db.query("select admin_note from public.guide_entries"), /permission denied/);
      await assert.rejects(db.query("select * from private.guide_member_content"), /permission denied/);
      await assert.rejects(db.query("select * from private.guide_member_filters"), /permission denied/);
      if (role === "anon") {
        await assert.rejects(db.query("select public.get_member_guide_content($1)", [guideId]), /permission denied/);
      } else {
        assert.equal((await db.query("select public.get_member_guide_content($1) as content", [guideId])).rows[0].content, null);
      }
      await db.exec("reset role");
    }

    for (const [id, allowed] of [[trialId, true], [plusId, true], [expiredId, false], [expiredPlusId, false]]) {
      await db.exec("set role authenticated");
      await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
      const catalog = await db.query("select content from public.get_public_guide_catalog($1)", [guideId]);
      assert.deepEqual(Boolean(catalog.rows[0].content.filters.temperature_min_c), allowed, id);
      const { rows } = await db.query("select public.get_member_guide_content($1) as content", [guideId]);
      assert.equal(Boolean(rows[0].content), allowed, id);
      if (allowed) {
        assert.ok(rows[0].content.sections.length > 0, id);
        assert.ok(rows[0].content.cautions.length > 0, id);
        const en = await db.query("select public.get_member_guide_content($1, 'en') as content", [guideId]);
        assert.ok(en.rows[0].content.sections.length > 0);
        const approved = await db.query("select public.get_member_guide_content('00000000-0000-4000-8000-000000000088') as content");
        assert.equal(approved.rows[0].content.sections[0].title, "经核对的操作");
        assert.equal(approved.rows[0].content.parameters.length, 3);
      }
      await db.exec("reset role");
    }
  } finally {
    await db.close();
  }
});

test("the browser's guide helper bundle contains no full editorial templates", async () => {
  const { outputFiles } = await build({
    entryPoints: [new URL("../lib/public-guide-library.ts", import.meta.url).pathname],
    bundle: true, platform: "browser", format: "esm", write: false,
    alias: { "@": new URL("../", import.meta.url).pathname },
  });
  const browserBundle = outputFiles[0].text;
  assert.ok(browserBundle.includes("getPublicGuideSummary"));
  assert.ok(!browserBundle.includes("buildPublicGuideContent"));
  assert.ok(!browserBundle.includes("getPracticalGuideContent"));
  assert.ok(!browserBundle.includes("开始前与操作"));
  assert.ok(!browserBundle.includes("Begin with a small batch"));
  assert.ok(!browserBundle.includes("Anubias barteri var. nana"));
});
