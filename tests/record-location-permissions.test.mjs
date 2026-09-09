import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

// Focused PostgreSQL integration fixture. Production migrations are not applied by this test.
const db = new PGlite();
const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const project = uid(1000);
let recordId;
async function asUser(n) {
  await db.exec("reset role; set role authenticated;");
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [uid(n)]);
}
before(async () => {
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create schema auth;
    create schema storage;
    create schema private;
    grant usage on schema private to authenticated, service_role;
    grant usage on schema public, auth to authenticated, anon;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid$$;
    create table auth.users(id uuid primary key, email text, created_at timestamptz, last_sign_in_at timestamptz, deleted_at timestamptz);
    create table public.users(id uuid primary key, username text, account_number text, account_class text, registration_year integer, registration_sequence bigint unique, is_internal_test boolean default false, created_at timestamptz, last_login_at timestamptz, cloud_enabled boolean, role text, status text, signup_trial_slot integer, signup_trial_granted_at timestamptz, constraint users_account_identity_shape_check check (true));
    create table public.profiles(id uuid primary key, username text, email text, storage_used bigint, created_at timestamp, updated_at timestamp);
    create table public.user_memberships(user_id uuid primary key, plan text, status text, trial_ends_at timestamptz, paid_until timestamptz, storage_limit_bytes bigint, base_market_post_limit integer, created_at timestamptz, updated_at timestamptz);
    create table public.archives(id uuid primary key default gen_random_uuid(), user_id uuid not null, created_at timestamptz default now(), trashed_at timestamptz, title text, category text, species_id uuid, species_name_snapshot text, system_name text, source text, note text, is_public boolean default false, default_record_visibility text);
    alter table public.archives enable row level security;
    create table public.archive_cycles(id uuid primary key, archive_id uuid, status text);
    create table public.records(id uuid primary key default gen_random_uuid(), archive_id uuid not null references public.archives(id), user_id uuid not null, cycle_id uuid, note text, record_time timestamptz, photo_time timestamptz, upload_time timestamptz, visibility text, status_tag text, trashed_at timestamptz);
    create table public.media(user_id uuid);
    create table public.market_posts(user_id uuid);
    create table public.comments(user_id uuid);
    create table public.locations(user_id uuid);
    create table public.group_tags(user_id uuid);
    create table public.sub_tags(user_id uuid);
    create table storage.objects(bucket_id text, owner_id text);
    create function public.is_app_admin(id uuid) returns boolean language sql stable as $$select id = '${uid(1)}'::uuid$$;
    create function public.is_user_membership_active(id uuid) returns boolean language sql stable security definer as $$select exists(select 1 from public.user_memberships m where m.user_id = id and m.status = 'active')$$;
    create function public.get_user_active_market_post_count(id uuid) returns integer language sql stable as $$select 0$$;
    create function public.get_user_market_post_limit(id uuid) returns integer language sql stable as $$select 0$$;
    grant select on public.archive_cycles to authenticated;
    grant select, insert, update on public.archives to authenticated;
    create policy archives_read on public.archives for select to authenticated using (is_public or user_id=auth.uid());
    create policy archives_write on public.archives for insert to authenticated with check (user_id=auth.uid() and public.is_user_membership_active(auth.uid()));
    create policy archives_edit on public.archives for update to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid() and public.is_user_membership_active(auth.uid()));
    grant select, insert, update, delete on public.records to authenticated;
    alter table public.records enable row level security;
    create policy records_read on public.records for select to authenticated using (visibility = 'public' or user_id = auth.uid());
    create policy records_write on public.records for insert to authenticated with check (user_id = auth.uid() and public.is_user_membership_active(auth.uid()));
    create policy records_edit on public.records for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_user_membership_active(auth.uid()));
  `);
  for (let n = 1; n <= 25; n++) {
    await db.query("insert into auth.users(id, email, created_at) values ($1, $2, '2026-09-06')", [uid(n), n === 2 ? null : `member${n}@example.test`]);
    await db.query("insert into public.users(id, account_number, account_class, registration_year, registration_sequence, created_at) values ($1, $2, 'a', 2026, $3, '2026-09-06')", [uid(n), `LSa-2026-${String(n).padStart(4, "0")}`, n]);
    await db.query("insert into public.profiles(id, username, storage_used) values ($1, $2, 0)", [uid(n), `会员${n}`]);
    await db.query("insert into public.user_memberships(user_id, plan, status, paid_until) values ($1, 'paid', 'active', '2099-01-01')", [uid(n)]);
  }
  await db.query("insert into public.profiles(id, username) values ($1, '遗留资料')", [uid(32)]);
  await db.query("insert into public.archives(id, user_id) values ($1, $2)", [project, uid(2)]);
  await db.exec(await readFile("supabase/migrations/20260907212018_record_location_and_mobile_admin.sql", "utf8"));
  await db.exec(`create table private.signup_rollout_state(singleton boolean primary key, account_class text, last_registration_sequence bigint, updated_at timestamptz); insert into private.signup_rollout_state values (true,'a',25,now());`);
  const original = await readFile("supabase/migrations/20260730063743_add_signup_account_rollout.sql", "utf8");
  const immutableStart = original.indexOf("create or replace function private.enforce_account_identity_immutable()");
  await db.exec(original.slice(immutableStart, original.indexOf("-- ---------------------------------------------------------------------------", immutableStart)));
  await db.exec(await readFile("supabase/migrations/20260909092635_compact_account_numbers.sql", "utf8"));
  await db.exec(await readFile("supabase/migrations/20260909092818_project_planting_region.sql", "utf8"));
});
after(async () => { await db.close(); });

test("owner creates a public record with location stored privately", async () => {
  await asUser(2);
  const { rows } = await db.query("select * from public.create_record_with_location($1, null, '旧文字', now(), 'public', null, $2::jsonb)", [project, JSON.stringify({ label: "私有地址", latitude: 29.8, longitude: 121.5, source: "photo" })]);
  recordId = rows[0].id;
  assert.ok(recordId);
  assert.equal(rows[0].location, undefined);
  assert.equal((await db.query("select label from public.record_locations where record_id=$1", [recordId])).rows[0].label, "私有地址");
});

test("another user can read a public record but cannot read or edit its location", async () => {
  await asUser(3);
  assert.equal((await db.query("select id from public.records where id=$1", [recordId])).rows.length, 1);
  assert.equal((await db.query("select * from public.record_locations where record_id=$1", [recordId])).rows.length, 0);
  await assert.rejects(db.query("select public.set_record_location($1, $2::jsonb)", [recordId, '{"label":"attack"}']), /not owned/);
  await assert.rejects(db.query("insert into public.record_locations(record_id,user_id,label) values ($1,$2,'attack')", [recordId, uid(3)]), /row-level security/);
  await db.exec("reset role; set role anon;");
  await assert.rejects(db.query("select * from public.record_locations"), /permission denied/);
});

test("invalid GPS rolls back note changes and leaves the original location intact", async () => {
  await asUser(2);
  await assert.rejects(db.query("select public.save_record_details($1, '不应保存', now(), $2::jsonb)", [recordId, '{"label":"bad", "latitude":91,"longitude":1}']), /check constraint/);
  assert.equal((await db.query("select note from public.records where id=$1", [recordId])).rows[0].note, "旧文字");
  assert.equal((await db.query("select label from public.record_locations where record_id=$1", [recordId])).rows[0].label, "私有地址");
  await db.query("select public.save_record_details($1, '修改成功', now(), $2::jsonb)", [recordId, '{"label":"花园","source":"manual"}']);
  assert.equal((await db.query("select note from public.records where id=$1", [recordId])).rows[0].note, "修改成功");
});

test("invalid period prevents record creation; an expired member keeps read access", async () => {
  await asUser(2);
  const count = (await db.query("select count(*) from public.records")).rows[0].count;
  await assert.rejects(db.query("select * from public.create_record_with_location($1, $2, 'bad', now(), 'private', null, null)", [project, uid(999)]), /Invalid project period/);
  assert.equal((await db.query("select count(*) from public.records")).rows[0].count, count);
  await db.exec(`reset role; update public.user_memberships set status='expired' where user_id='${uid(2)}';`);
  await asUser(2);
  assert.equal((await db.query("select label from public.record_locations where record_id=$1", [recordId])).rows[0].label, "花园");
  await assert.rejects(db.query("select public.save_record_details($1, 'cannot write', now(), null)", [recordId]), /Cloud membership required/);
});

test("admin pagination is deterministic and missing email does not hide or delete accounts", async () => {
  await asUser(1);
  const first = (await db.query("select * from public.admin_search_memberships_page('',10,0)")).rows;
  const second = (await db.query("select * from public.admin_search_memberships_page('',10,10)")).rows;
  const third = (await db.query("select * from public.admin_search_memberships_page('',10,20)")).rows;
  assert.equal(new Set([...first, ...second, ...third].map((row) => row.user_id)).size, 26);
  assert.deepEqual((await db.query("select * from public.admin_search_memberships_page('',10,0)")).rows.map((r) => r.user_id), first.map((r) => r.user_id));
  assert.equal(first.find((row) => row.user_id === uid(2)).email, null);
  assert.equal(first.find((row) => row.user_id === uid(2)).auth_missing, false);
  assert.equal(third.find((row) => row.user_id === uid(32)).auth_missing, true);
  const search = (await db.query("select * from public.admin_search_memberships_page('member20@example.test',10,0)")).rows;
  assert.equal(search.length, 1);
  assert.equal(search[0].user_id, uid(20));
  await asUser(3);
  assert.equal((await db.query("select * from public.admin_search_memberships_page('',10,0)")).rows.length, 0);
});

const coarseRegion = { country_code: "CN", country_name: "中国", region_name: "浙江", city_name: "宁波" };

test("number migration preserves old identities, allocates permanent ranks and rejects identity edits", async () => {
  await db.exec("reset role");
  assert.equal((await db.query("select account_number from public.users where id=$1", [uid(2)])).rows[0].account_number, "LSa-2026-0002");
  const first = (await db.query("select * from private.initialize_new_account($1, 'new@example.test', '2027-01-01T00:00:00Z')", [uid(101)])).rows[0];
  assert.equal(first.created_account_number, "LSa2027026");
  assert.equal((await db.query("select * from private.initialize_new_account($1, 'new@example.test', '2027-01-01T00:00:00Z')", [uid(101)])).rows[0].created_account_number, first.created_account_number);
  await assert.rejects(db.query("update public.users set account_number='LSa2026002' where id=$1", [uid(2)]), /account_identity_is_immutable/);
  await db.query("delete from public.users where id=$1", [uid(101)]);
  assert.equal((await db.query("select * from private.initialize_new_account($1, 'next@example.test', '2027-01-02T00:00:00Z')", [uid(102)])).rows[0].created_account_number, "LSa2027027");
  const codes = (await db.query("select n, private.format_account_number('a',2026,n) as code from unnest(array[999,1000,1098,1099,1792,1793,3375,3376]::bigint[]) n")).rows;
  assert.deepEqual(codes.map(r => r.code), ["LSa2026999","LSa2026A01","LSa2026A99","LSa2026B01","LSa2026J01","LSa2026J02","LSa2026Z99",null]);
  await asUser(1);
  assert.equal((await db.query("select user_id from public.admin_search_memberships_page('LSa2026002',10,0)")).rows[0].user_id, uid(2));
});

test("new planting projects require a coarse region and preserve archive ownership and membership RLS", async () => {
  await asUser(3);
  await assert.rejects(db.query("select public.create_project($1::jsonb)", [JSON.stringify({ title: "无地区", category: "plant" })]), /planting_region_required/);
  for (const region of [{...coarseRegion, latitude: 29.8}, {...coarseRegion, city_name: ""}, {...coarseRegion, city_name: 32}, [coarseRegion]]) {
    await assert.rejects(db.query("select public.create_project($1::jsonb)", [JSON.stringify({ title: "无效地区", category: "plant", planting_region: region })]), /planting_region_required/);
  }
  const created = (await db.query("select public.create_project($1::jsonb) as id", [JSON.stringify({ title: "真实地区", category: "plant", planting_region: coarseRegion, user_id: uid(1), is_public: true })])).rows[0].id;
  assert.equal((await db.query("select user_id from public.archives where id=$1", [created])).rows[0].user_id, uid(3));
  await asUser(2); // membership ended in the earlier regression
  assert.deepEqual((await db.query("select planting_region from public.archives where id=$1", [created])).rows[0].planting_region, coarseRegion);
  assert.equal((await db.query("update public.archives set planting_region=null where id=$1 returning id", [created])).rows.length, 0);
  await assert.rejects(db.query("select public.create_project($1::jsonb)", [JSON.stringify({ title: "过期", category: "plant", planting_region: coarseRegion })]), /row-level security/);
  assert.equal((await db.query("select planting_region from public.archives where id=$1", [project])).rows[0].planting_region, null);
  await db.exec("reset role; set role anon");
  await assert.rejects(db.query("select public.create_project('{}'::jsonb)"), /permission denied/);
});
