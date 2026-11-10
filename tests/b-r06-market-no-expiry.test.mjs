import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const fixturePath = path.join(import.meta.dirname, "fixtures", "b-r04", "m2-R07-seven-definitions.json");
const definitions = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
const bySignature = new Map(definitions.map((entry) => [entry.signature, entry]));
const userFree = "00000000-0000-4000-8000-000000000806";
const userPlus = "00000000-0000-4000-8000-000000000830";

async function makeDatabase() {
  const db = new PGlite();
  await db.exec([
    "create schema auth;",
    "create schema private;",
    "create table auth.users(id uuid primary key);",
    "create table public.user_memberships(user_id uuid primary key,plan text,status text,paid_until timestamptz,trial_ends_at timestamptz);",
    "create table public.membership_payments(user_id uuid,plan text,status text,service_started_at timestamptz,service_ends_at timestamptz);",
    "create table public.market_posts(id uuid primary key default gen_random_uuid(),user_id uuid not null,title text not null,status text not null default 'active',created_at timestamptz not null default now(),updated_at timestamptz not null default now(),published_at timestamptz,ended_at timestamptz,membership_service_ends_at timestamptz);"
  ].join("\n"));
  await db.query("insert into auth.users(id) values ($1),($2)", [userFree, userPlus]);
  await db.query(
    "insert into public.user_memberships(user_id,plan,status,paid_until) values ($1,'basic','active',now()+interval '1 year')",
    [userPlus]
  );
  // A historical active post older than 720 hours with null published_at.
  await db.query(
    "insert into public.market_posts(user_id,title,status,created_at,published_at) values ($1,'legacy-null-published','active',now()-interval '45 days',null)",
    [userFree]
  );
  for (const signature of [
    "public.is_user_membership_active(uuid)",
    "public.get_user_market_post_limit(uuid)",
    "private.enforce_market_activation_limit()",
  ]) {
    const source = bySignature.get(signature);
    assert.ok(source?.definition, "Missing signed R07 function: " + signature);
    await db.exec(source.definition + ";");
    const result = await db.query("select md5(prosrc) as md5 from pg_proc where oid=$1::regprocedure", [signature]);
    assert.equal(result.rows[0].md5, source.target_body_md5, "R07 source drift: " + signature);
  }
  await db.exec("create trigger trg_enforce_market_activation_limit before insert or update of status,user_id,published_at,membership_service_ends_at on public.market_posts for each row execute function private.enforce_market_activation_limit();");
  return db;
}
async function addPost(db, uid, title) {
  const result = await db.query(
    "insert into public.market_posts(user_id,title,status) values($1,$2,'active') returning id,published_at",
    [uid, title]
  );
  assert.ok(result.rows[0].published_at, "R07 server publish timestamp must be stamped");
  return result.rows[0].id;
}
async function countActive(db, uid) {
  return Number((await db.query("select count(*)::int as n from public.market_posts where user_id=$1 and status='active'", [uid])).rows[0].n);
}
async function assertBoundary(limit, uid, initial) {
  const db = await makeDatabase();
  try {
    assert.equal(await countActive(db, uid), initial);
    const first = await addPost(db, uid, "R06-" + limit + "-first");
    for (let i=initial+2; i<=limit; i++) await addPost(db, uid, "R06-" + limit + "-" + i);
    assert.equal(await countActive(db, uid), limit, "The final allowed post must occupy the last slot");
    await assert.rejects(addPost(db, uid, "R06-" + limit + "-overflow"), /market_post_limit_reached/);
    assert.equal(await countActive(db, uid), limit, "Rejected post must not change quota");
    await db.query("update public.market_posts set status='ended',ended_at=now() where id=$1",[first]);
    assert.equal(await countActive(db, uid), limit-1, "Manual end must release one slot");
    const replacement = await addPost(db, uid, "R06-" + limit + "-replacement");
    assert.equal(await countActive(db, uid), limit);
    await assert.rejects(
      db.query("update public.market_posts set status='active' where id=$1",[first]),
      /market_post_limit_reached/,
      "Re-publishing at capacity must fail"
    );
    await db.query("update public.market_posts set status='ended',ended_at=now() where id=$1",[replacement]);
    const restored = await db.query(
      "update public.market_posts set status='active' where id=$1 returning status,published_at",
      [first]
    );
    assert.equal(restored.rows[0].status, "active");
    assert.ok(restored.rows[0].published_at, "Re-publishing must set server published_at");
    assert.equal(await countActive(db, uid), limit);
    const wrongOwner = uid===userFree ? userPlus : userFree;
    await assert.rejects(db.query("update public.market_posts set user_id=$1 where id=$2",[wrongOwner,first]),/market_post_owner_immutable/);
    assert.equal(await countActive(db, uid), limit);
    const legacy = (await db.query("select status,published_at from public.market_posts where user_id=$1 and title='legacy-null-published'",[userFree])).rows[0];
    assert.equal(legacy.status, "active", "Old rows must not auto-end solely because of age");
    assert.equal(legacy.published_at, null, "Do not invent a publication timestamp for old data");
  } finally {
    await db.close();
  }
}
test("R06 Free: 5th accepted, 6th rejected, end frees slot, re-publish checks quota", async()=>{
  await assertBoundary(5,userFree,1);
});
test("R06 Plus: 30th accepted, 31st rejected, end frees slot, re-publish checks quota", async()=>{
  await assertBoundary(30,userPlus,0);
});
test("R06 UI no fixed expiry; publish/edit timestamps; ended posts can be re-published",()=>{
  const base=path.resolve(import.meta.dirname,"..");
  const read=p=>fs.readFileSync(path.join(base,p),"utf8");
  const type=read("lib/market-types.ts");
  const detail=read("app/market/[id]/page.tsx");
  const listing=read("app/market/page.tsx");
  const mine=read("app/market/mine/page.tsx");
  const form=read("app/market/new/page.tsx");
  const zh=read("lib/i18n/zh.ts");
  const en=read("lib/i18n/en.ts");
  assert.match(type,/published_at\?: string \| null/);
  assert.match(listing,/\.eq\("status", "active"\)/);
  assert.match(detail,/\.update\(\{ status: "active" \}\)/);
  assert.match(detail,/\.select\("status, published_at, updated_at, ended_at"\)/);
  assert.match(mine,/published_at \|\| item\.created_at/);
  assert.match(form,/status: "active"/);
  assert.match(zh,/发布后不设固定到期日/);
  assert.match(zh,/published_time: "发布时间"/);
  assert.match(zh,/last_updated_time: "最近更新时间"/);
  assert.match(zh,/resume: "重新发布"/);
  assert.match(en,/Listings have no fixed expiry/);
  assert.doesNotMatch(listing,/interval '720 hours'|720\s*\*\s*3600/);
});
