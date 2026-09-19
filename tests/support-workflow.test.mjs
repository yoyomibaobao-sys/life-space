import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import vm from "node:vm";
import { PGlite } from "@electric-sql/pglite";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const mod = { exports: {} };
vm.runInNewContext(ts.transpileModule(read("lib/support-links.ts"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: mod.exports, URL });
const { safeSupportUrl, getReportTarget, buildReportHref } = mod.exports;
const uid = n => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

test("report links accept canonical content paths and strip sensitive URL fields", () => {
  for (const value of ["javascript:alert(1)", "data:text/html,test", "//evil.test", "/\\evil.test", "https://life-space.uk.evil.test/archive/x", "https://life-space.uk@evil.test/a", "/%5c%5cevil.test", "/%00", "broken"]) assert.equal(safeSupportUrl(value), null, value);
  assert.equal(safeSupportUrl("https://life-space.uk/profile?access_token=secret#secret"), "/profile");
  assert.equal(getReportTarget("/profile"), null);
  assert.equal(getReportTarget("/archive/not-a-uuid"), null);
  const target = getReportTarget(`/archive/${uid(1)}?record=${uid(2)}&token=secret`);
  assert.equal(target.type, "record"); assert.equal(target.id, uid(2));
  assert.equal(target.url, `/archive/${uid(1)}?record=${uid(2)}`);
  assert.equal(buildReportHref(`/market/${uid(3)}`), `/report?target=${encodeURIComponent(`/market/${uid(3)}`)}`);
});

test("support RPCs isolate users, deduplicate reports, limit supplements, and notify grouped outcomes", async () => {
  const db = new PGlite();
  const owner = uid(1), other = uid(2), admin = uid(3);
  const asUser = async id => {
    await db.exec("reset role; set role authenticated");
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
  };
  const rpc = async (name, args) => (await db.query(`select public.${name}(${args.map((_, i) => `$${i + 1}`).join(",")}) as result`, args)).rows[0].result;
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; grant usage on schema auth, public to anon, authenticated;
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid$$;
      create table public.profiles(id uuid primary key);
      create table auth.users(id uuid primary key);
      insert into public.profiles values ('${owner}'), ('${other}'), ('${admin}');
      insert into auth.users select id from public.profiles;
      create table public.notifications(id uuid primary key default gen_random_uuid(), user_id uuid, type text, title text, body text, related_url text, metadata jsonb);
      create function public.is_app_admin(p_user_id uuid) returns boolean language sql stable as $$select coalesce(p_user_id = '${admin}'::uuid, false)$$;
      create function public.create_notification(uuid,uuid,text,text,text,uuid,uuid,uuid,text,jsonb) returns void language sql security definer as $$insert into public.notifications(user_id,type,title,body,related_url,metadata) values($1,$3,$4,$5,$9,$10)$$;
    `);
    await db.exec(read("supabase/migrations/20260910220927_add_support_submission_workflow.sql"));
    await asUser(owner);
    const args = ["report", "spam", "Test report", null, "archive", uid(100), `/archive/${uid(100)}`];
    const first = await rpc("submit_support_submission", args);
    assert.equal(first.ok, true);
    const repeated = await rpc("submit_support_submission", args);
    assert.equal(repeated.id, first.id); assert.equal(repeated.duplicate, true);
    await assert.rejects(db.query("select * from public.support_submissions"), /permission denied/);
    await asUser(other);
    assert.equal((await db.query("select * from public.get_my_support_submissions(null,100)")).rows.length, 0);
    assert.equal((await rpc("admin_update_support_submission", [first.id, "needs_info", null, "Private"])).error, "permission_denied");
    assert.equal((await rpc("supplement_support_submission", [first.id, "Unauthorized"])).ok, false);
    assert.equal((await db.query("select * from public.admin_list_support_submissions(null,null,200)")).rows.length, 0);
    const second = await rpc("submit_support_submission", args);
    assert.equal(second.ok, true);
    await asUser(admin);
    assert.equal((await rpc("admin_update_support_submission", [first.id, "needs_info", null, "Private admin note"])).ok, true);
    await asUser(owner);
    const ownRows = (await db.query("select * from public.get_my_support_submissions(null,100)")).rows;
    assert.equal(ownRows[0].status, "needs_info");
    assert.equal("admin_note" in ownRows[0], false);
    assert.equal((await rpc("supplement_support_submission", [first.id, "More details"])).ok, true);
    assert.equal((await rpc("supplement_support_submission", [first.id, "Second supplement"])).ok, false);
    await asUser(admin);
    assert.equal((await rpc("admin_update_support_submission", [first.id, "needs_info", null, null])).error, "followup_already_used");
    const resolved = await rpc("admin_update_support_submission", [first.id, "resolved", "no_violation", "Private result"]);
    assert.equal(resolved.updated_count, 2);
    assert.equal((await rpc("admin_update_support_submission", [first.id, "resolved", "no_violation", null])).ok, false);
    await db.exec("reset role");
    const notices = (await db.query("select * from public.notifications order by related_url")).rows;
    assert.equal(notices.length, 3);
    assert.ok(notices.every(row => row.related_url.startsWith("/report?submission=")));
    assert.ok(notices.every(row => !row.body.includes("Private")));
    await asUser(other);
    // The prior report counts toward the daily limit.
    for (let i = 0; i < 19; i++) assert.equal((await rpc("submit_support_submission", ["feedback", "problem", `Issue ${i}`])).ok, true);
    assert.equal((await rpc("submit_support_submission", ["feedback", "problem", "Over the limit"])).error, "rate_limited");
    await db.exec("reset role; set role anon");
    await assert.rejects(rpc("submit_support_submission", ["feedback", "problem", "Anonymous"]), /permission denied/);
  } finally { await db.close(); }
});
