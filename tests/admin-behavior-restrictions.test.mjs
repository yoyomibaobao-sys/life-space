import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const read = (file) => fs.readFileSync(path.join(process.cwd(), file), "utf8");
const migration = read("supabase/migrations/20261030234715_admin_behavior_restrictions.sql");
const ids = {
  admin: "26000000-0000-4000-8000-000000000001",
  user: "26000000-0000-4000-8000-000000000002",
  other: "26000000-0000-4000-8000-000000000003",
};

const setup = [
  "create role anon;",
  "create role authenticated;",
  "create role service_role;",
  "create schema auth;",
  "create schema private;",
  "grant usage on schema auth, private, public to authenticated, service_role;",
  "create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;",
  "create table auth.users (id uuid primary key, deleted_at timestamptz);",
  "create table public.profiles (id uuid primary key);",
  "create table public.app_admins (user_id uuid primary key);",
  "create function public.is_app_admin(p_user_id uuid) returns boolean language sql stable security definer set search_path = '' as $$ select exists (select 1 from public.app_admins a where a.user_id = p_user_id) $$;",
  "create table public.user_memberships (user_id uuid primary key, plan text, paid_until timestamptz, storage_limit_bytes bigint, base_market_post_limit integer);",
  "create table public.archives (id uuid primary key, user_id uuid, title text, is_public boolean default false);",
  "create table public.records (id uuid primary key, user_id uuid, visibility text default 'private', note text);",
  "create table public.experience_cards (id uuid primary key, user_id uuid, status text default 'draft', title text);",
  "create table public.market_posts (id uuid primary key, user_id uuid, status text default 'active', title text);",
  "create table public.comments (id uuid primary key, user_id uuid, content text);",
  "create table public.experience_card_comments (id uuid primary key, user_id uuid, content text);",
  "create table public.market_comments (id uuid primary key, user_id uuid, content text);",
  "insert into auth.users (id) values ('" + ids.admin + "'), ('" + ids.user + "'), ('" + ids.other + "');",
  "insert into public.profiles (id) values ('" + ids.admin + "'), ('" + ids.user + "'), ('" + ids.other + "');",
  "insert into public.app_admins (user_id) values ('" + ids.admin + "');",
  "insert into public.user_memberships (user_id, plan, paid_until, storage_limit_bytes, base_market_post_limit) values ('" + ids.user + "', 'basic', '2030-01-01T00:00:00Z', 1000000000, 30);",
].join("\n");

async function setUser(db, userId) {
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId]);
}

async function rpc(db, name, args) {
  const placeholders = args.map((_, index) => "$" + (index + 1)).join(", ");
  return (await db.query("select public." + name + "(" + placeholders + ") as result", args)).rows[0].result;
}

test("behavior restrictions are independent, server-enforced and manually released with audit history", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(setup);
  await db.exec(migration);

  const membershipBefore = (await db.query(
    "select * from public.user_memberships where user_id = $1",
    [ids.user]
  )).rows[0];

  await t.test("table and RPC privileges expose no direct restriction-table access", async () => {
    const acl = (await db.query("select has_table_privilege('anon', 'public.user_behavior_restrictions', 'select') as anon_select, has_table_privilege('authenticated', 'public.user_behavior_restrictions', 'select') as user_select, has_function_privilege('anon', 'public.admin_set_user_behavior_restriction(uuid,text,text)', 'execute') as anon_set, has_function_privilege('authenticated', 'public.admin_set_user_behavior_restriction(uuid,text,text)', 'execute') as admin_set, has_function_privilege('anon', 'private.is_current_user_behavior_restricted(text)', 'execute') as anon_helper, has_function_privilege('authenticated', 'private.is_current_user_behavior_restricted(text)', 'execute') as user_helper")).rows[0];
    assert.deepEqual(acl, {
      anon_select: false,
      user_select: false,
      anon_set: false,
      admin_set: true,
      anon_helper: false,
      user_helper: false,
    });
    const columns = (await db.query(
      "select column_name from information_schema.columns where table_schema='public' and table_name='user_behavior_restrictions'"
    )).rows.map((row) => row.column_name);
    assert.equal(columns.includes("expires_at"), false);
  });

  await t.test("only administrators can apply and inspect restrictions", async () => {
    await setUser(db, ids.user);
    const denied = await rpc(db, "admin_set_user_behavior_restriction", [
      ids.other, "comment", "non-admin attempt",
    ]);
    assert.equal(denied.error, "permission_denied");
    await assert.rejects(
      db.query("select * from public.admin_list_user_behavior_restrictions($1)", [ids.other]),
      /permission_denied/
    );

    await setUser(db, ids.admin);
    const missing = await rpc(db, "admin_set_user_behavior_restriction", [
      "26000000-0000-4000-8000-000000000099", "comment", "missing account",
    ]);
    assert.equal(missing.error, "target_not_found");
    const invalid = await rpc(db, "admin_set_user_behavior_restriction", [
      ids.user, "membership", "not a behavior permission",
    ]);
    assert.equal(invalid.error, "invalid_permission");
  });

  await t.test("comment restriction covers project, experience-card and market comments only", async () => {
    await setUser(db, ids.user);
    await db.query("insert into public.archives (id,user_id,title,is_public) values ($1,$2,'already public project',true)", [
      "26000000-0000-4000-8000-000000000120", ids.user,
    ]);
    await db.query("insert into public.records (id,user_id,visibility,note) values ($1,$2,'public','already public record')", [
      "26000000-0000-4000-8000-000000000124", ids.user,
    ]);
    await db.query("insert into public.experience_cards (id,user_id,status,title) values ($1,$2,'published','already published card')", [
      "26000000-0000-4000-8000-000000000125", ids.user,
    ]);
    await db.query("insert into public.comments values ($1,$2,'before')", [
      "26000000-0000-4000-8000-000000000101", ids.user,
    ]);
    await db.query("insert into public.experience_card_comments values ($1,$2,'before')", [
      "26000000-0000-4000-8000-000000000102", ids.user,
    ]);
    await db.query("insert into public.market_comments values ($1,$2,'before')", [
      "26000000-0000-4000-8000-000000000103", ids.user,
    ]);

    await setUser(db, ids.admin);
    const applied = await rpc(db, "admin_set_user_behavior_restriction", [
      ids.user, "comment", "Repeated abusive comments",
    ]);
    assert.equal(applied.ok, true);
    assert.equal(applied.changed, true);
    const duplicate = await rpc(db, "admin_set_user_behavior_restriction", [
      ids.user, "comment", "Duplicate restriction",
    ]);
    assert.equal(duplicate.error, "already_restricted");

    await setUser(db, ids.user);
    for (const [table, id] of [
      ["comments", "26000000-0000-4000-8000-000000000111"],
      ["experience_card_comments", "26000000-0000-4000-8000-000000000112"],
      ["market_comments", "26000000-0000-4000-8000-000000000113"],
    ]) {
      await assert.rejects(
        db.query("insert into public." + table + " values ($1,$2,'blocked')", [id, ids.user]),
        /behavior_permission_restricted:comment/
      );
    }
    await assert.rejects(
      db.query("update public.comments set content='edited' where id='26000000-0000-4000-8000-000000000101'"),
      /behavior_permission_restricted:comment/
    );
    await db.query("delete from public.comments where id='26000000-0000-4000-8000-000000000101'");
    await db.query("insert into public.archives (id,user_id,title,is_public) values ($1,$2,'private project',false)", [
      "26000000-0000-4000-8000-000000000121", ids.user,
    ]);
    await db.query("insert into public.market_posts (id,user_id,status,title) values ($1,$2,'active','market remains available')", [
      "26000000-0000-4000-8000-000000000122", ids.user,
    ]);

    await setUser(db, ids.admin);
    const released = await rpc(db, "admin_release_user_behavior_restriction", [
      ids.user, "comment", "Comment restriction manually released",
    ]);
    assert.equal(released.ok, true);
    await setUser(db, ids.user);
    await db.query("insert into public.comments values ($1,$2,'manual release restored comment access')", [
      "26000000-0000-4000-8000-000000000123", ids.user,
    ]);
  });

  await t.test("public-publish restriction blocks public transitions while marketplace publishing remains separate", async () => {
    await setUser(db, ids.admin);
    assert.equal((await rpc(db, "admin_set_user_behavior_restriction", [
      ids.user, "public_publish", "Repeated unauthorized public releases",
    ])).ok, true);

    await setUser(db, ids.user);
    await db.query("insert into public.comments values ($1,$2,'public restriction does not block comments')", [
      "26000000-0000-4000-8000-000000000130", ids.user,
    ]);
    await db.query("insert into public.archives (id,user_id,title,is_public) values ($1,$2,'private remains allowed',false)", [
      "26000000-0000-4000-8000-000000000132", ids.user,
    ]);
    await db.query("update public.archives set title='existing public project remains editable' where id='26000000-0000-4000-8000-000000000120'");
    await db.query("update public.records set note='existing public record remains editable' where id='26000000-0000-4000-8000-000000000124'");
    await db.query("update public.experience_cards set title='existing published card remains editable' where id='26000000-0000-4000-8000-000000000125'");
    await db.query("update public.archives set is_public=false where id='26000000-0000-4000-8000-000000000120'");
    await db.query("update public.records set visibility='private' where id='26000000-0000-4000-8000-000000000124'");
    await db.query("update public.experience_cards set status='draft' where id='26000000-0000-4000-8000-000000000125'");
    await assert.rejects(
      db.query("insert into public.archives (id,user_id,title,is_public) values ($1,$2,'blocked public',true)", [
        "26000000-0000-4000-8000-000000000133", ids.user,
      ]),
      /behavior_permission_restricted:public_publish/
    );
    await assert.rejects(
      db.query("update public.archives set is_public=true where id='26000000-0000-4000-8000-000000000121'"),
      /behavior_permission_restricted:public_publish/
    );
    await db.query("insert into public.records (id,user_id,visibility,note) values ($1,$2,'private','private record allowed')", [
      "26000000-0000-4000-8000-000000000134", ids.user,
    ]);
    await assert.rejects(
      db.query("insert into public.records (id,user_id,visibility,note) values ($1,$2,'public','blocked public record')", [
        "26000000-0000-4000-8000-000000000135", ids.user,
      ]),
      /behavior_permission_restricted:public_publish/
    );
    await assert.rejects(
      db.query("update public.records set visibility='public' where id='26000000-0000-4000-8000-000000000134'"),
      /behavior_permission_restricted:public_publish/
    );
    await db.query("insert into public.experience_cards (id,user_id,status) values ($1,$2,'draft')", [
      "26000000-0000-4000-8000-000000000136", ids.user,
    ]);
    await assert.rejects(
      db.query("update public.experience_cards set status='published' where id='26000000-0000-4000-8000-000000000136'"),
      /behavior_permission_restricted:public_publish/
    );
    await db.query("insert into public.market_posts (id,user_id,status,title) values ($1,$2,'active','market permission remains separate')", [
      "26000000-0000-4000-8000-000000000137", ids.user,
    ]);
  });

  await t.test("market restriction blocks active creation and reactivation without affecting other permissions", async () => {
    await setUser(db, ids.admin);
    assert.equal((await rpc(db, "admin_set_user_behavior_restriction", [
      ids.user, "market_publish", "Repeated unsafe marketplace publishing",
    ])).ok, true);

    await setUser(db, ids.user);
    await db.query("insert into public.archives (id,user_id,title,is_public) values ($1,$2,'private project remains allowed',false)", [
      "26000000-0000-4000-8000-000000000142", ids.user,
    ]);
    await db.query("update public.market_posts set title='existing active post remains editable' where id='26000000-0000-4000-8000-000000000122'");
    await db.query("update public.market_posts set status='ended' where id='26000000-0000-4000-8000-000000000122'");
    await db.query("insert into public.market_posts (id,user_id,status,title) values ($1,$2,'ended','ended post')", [
      "26000000-0000-4000-8000-000000000143", ids.user,
    ]);
    await assert.rejects(
      db.query("insert into public.market_posts (id,user_id,status,title) values ($1,$2,'active','blocked active post')", [
        "26000000-0000-4000-8000-000000000144", ids.user,
      ]),
      /behavior_permission_restricted:market_publish/
    );
    await assert.rejects(
      db.query("update public.market_posts set status='active' where id='26000000-0000-4000-8000-000000000143'"),
      /behavior_permission_restricted:market_publish/
    );

    await setUser(db, ids.admin);
    const publicReleased = await rpc(db, "admin_release_user_behavior_restriction", [
      ids.user, "public_publish", "Public publishing restriction manually released",
    ]);
    assert.equal(publicReleased.ok, true);
    await setUser(db, ids.user);
    await db.query("insert into public.comments values ($1,$2,'market restriction does not block comments')", [
      "26000000-0000-4000-8000-000000000145", ids.user,
    ]);
    await db.query("insert into public.archives (id,user_id,title,is_public) values ($1,$2,'public publishing restored',true)", [
      "26000000-0000-4000-8000-000000000146", ids.user,
    ]);
    await assert.rejects(
      db.query("insert into public.market_posts (id,user_id,status,title) values ($1,$2,'active','market still restricted')", [
        "26000000-0000-4000-8000-000000000147", ids.user,
      ]),
      /behavior_permission_restricted:market_publish/
    );
  });

  await t.test("only manual administrator release restores the selected permission and preserves audit history", async () => {
    await setUser(db, ids.user);
    const deniedRelease = await rpc(db, "admin_release_user_behavior_restriction", [
      ids.user, "market_publish", "non-admin release attempt",
    ]);
    assert.equal(deniedRelease.error, "permission_denied");

    await setUser(db, ids.admin);
    const released = await rpc(db, "admin_release_user_behavior_restriction", [
      ids.user, "market_publish", "Marketplace restriction manually released",
    ]);
    assert.equal(released.ok, true);
    assert.equal(released.changed, true);
    const rows = (await db.query(
      "select * from public.admin_list_user_behavior_restrictions($1)",
      [ids.user]
    )).rows;
    const commentEvent = rows.find((row) => row.permission_key === "comment");
    assert.equal(commentEvent.reason, "Repeated abusive comments");
    assert.equal(commentEvent.created_by, ids.admin);
    assert.equal(commentEvent.released_by, ids.admin);
    assert.ok(commentEvent.created_at);
    assert.ok(commentEvent.released_at);
    assert.equal(commentEvent.release_reason, "Comment restriction manually released");
    const publicEvent = rows.find((row) => row.permission_key === "public_publish");
    assert.equal(publicEvent.released_by, ids.admin);
    assert.equal(publicEvent.release_reason, "Public publishing restriction manually released");
    const marketEvent = rows.find((row) => row.permission_key === "market_publish");
    assert.equal(marketEvent.released_by, ids.admin);
    assert.equal(marketEvent.release_reason, "Marketplace restriction manually released");

    await setUser(db, ids.user);
    await db.query("insert into public.market_posts (id,user_id,status,title) values ($1,$2,'active','market publishing restored')", [
      "26000000-0000-4000-8000-000000000156", ids.user,
    ]);

    const membershipAfter = (await db.query(
      "select * from public.user_memberships where user_id = $1",
      [ids.user]
    )).rows[0];
    assert.deepEqual(membershipAfter, membershipBefore);
  });
});
