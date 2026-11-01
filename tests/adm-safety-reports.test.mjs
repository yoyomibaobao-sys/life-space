import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import ts from "typescript";
import vm from "node:vm";

const read = file => readFileSync(new URL("../" + file, import.meta.url), "utf8");
const uid = n => "00000000-0000-4000-8000-" + String(n).padStart(12, "0");
const first=uid(1), second=uid(2), admin=uid(3), archive=uid(100), privateArchive=uid(101), market=uid(102);

test("ADM second batch: report targets, categories, optional description and Android entry", () => {
  const categories=read("lib/support-submissions.ts");
  const links=read("lib/support-links.ts");
  const form=read("components/support/SupportCenter.tsx");
  for(const value of ["violence_threat_hate","harassment_privacy_fraud","other_severe"])
    assert.ok(categories.includes('"' + value + '"'));
  assert.match(categories, /spam: \["垃圾或广告"/); // old report labels remain readable
  assert.match(links, /type: "record"/);
  assert.doesNotMatch(links, /experience-cards\|market\|user/);
  assert.match(form, /const requiredContent = kind === "feedback";/);
  assert.match(read("lib/i18n/support-workflow.ts"), /感谢反馈，我们会根据平台安全规则核查。/);
  assert.match(read("app/archive/[id]/page.tsx"), /<ProjectRecordReportPicker/);
  assert.doesNotMatch(read("components/market/MarketDetailView.tsx"), /<ReportLink targetUrl=/);
  for(const f of ["components/archive-detail/ArchiveRecordCard.tsx","app/experience-cards/[id]/page.tsx","app/user/[id]/page.tsx"])
    assert.doesNotMatch(read(f), /<ReportLink|import ReportLink/);
  assert.match(read("mobile-offline-src/main.tsx"), /AdminSupportPage/);
  assert.match(read("mobile-offline-src/main.tsx"), /data-android-shell-page="safety-report"/);
  assert.match(read("components/archive-ui/ReadonlyPublicProjectDetail.tsx"), /reportSlot=\{<ProjectRecordReportPicker/);
  assert.match(read("app/admin/support/page.tsx"), /admin_get_support_report_group_details/);
});

test("ADM second batch: Android safety report is handled in-app with target preserved", () => {
  const mod = { exports: {} };
  const source = ts.transpileModule(read("lib/android-shell-app-routes.ts"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS }
  }).outputText;
  vm.runInNewContext(source, { exports: mod.exports, URLSearchParams });
  const { parseAndroidShellPath, getAndroidRouteCapability } = mod.exports;
  assert.equal(getAndroidRouteCapability("/report"), "online-controller");
  const target = "/archive/" + archive;
  const route = parseAndroidShellPath("/report", "?target=" + encodeURIComponent(target));
  assert.equal(route.kind, "report");
  assert.equal(route.id, target);
});

test("ADM old installed migration: historic project/market reports stay readable and reviewable", async () => {
  const db=new PGlite();
  const asUser=async id => {
    await db.exec("reset role; set role authenticated;");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);
  };
  const rpc=async(name,args)=>(await db.query("select public."+name+"("+args.map((_,i)=>"$"+(i+1)).join(",")+") as result",args)).rows[0].result;
  const report=async(who,category,type,id,details="",url=null)=>{
    await asUser(who);
    return rpc("submit_support_submission",["report",category,details,null,type,id,url]);
  };
  try {
    await db.exec([
      "create role anon; create role authenticated; create role service_role bypassrls;",
      "create schema auth; grant usage on schema auth,public to anon,authenticated;",
      "create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;",
      "create table public.profiles(id uuid primary key);",
      "create table auth.users(id uuid primary key);",
      "insert into public.profiles values ('"+first+"'),('"+second+"'),('"+admin+"');",
      "insert into auth.users select id from public.profiles;",
      "create table public.archives(id uuid primary key,is_public boolean not null default false,trashed_at timestamptz);",
      "create table public.market_posts(id uuid primary key,status text not null);",
      "insert into public.archives values ('"+archive+"',true,null),('"+privateArchive+"',false,null);",
      "insert into public.market_posts values ('"+market+"','active');",
      "create table public.notifications(id uuid primary key default gen_random_uuid(),user_id uuid,type text,title text,body text,related_url text,metadata jsonb);",
      "create function public.is_app_admin(p_user_id uuid) returns boolean language sql stable as $$select coalesce(p_user_id='"+admin+"'::uuid,false)$$;",
      "create function public.create_notification(uuid,uuid,text,text,text,uuid,uuid,uuid,text,jsonb) returns void language sql security definer as $$insert into public.notifications(user_id,type,title,body,related_url,metadata) values($1,$3,$4,$5,$9,$10)$$;",
    ].join("\n"));
    await db.exec(read("supabase/migrations/20260910220927_add_support_submission_workflow.sql"));
    await db.exec(read("supabase/migrations/20261030231006_adm_safety_reports_review_groups.sql"));

    let categoryConstraint=(await db.query("select pg_get_constraintdef(oid) as definition from pg_constraint where conname='support_submissions_category_check'")).rows[0].definition;
    for(const c of ["spam","harassment","misleading","unsafe","ip","impersonation","other","violence_threat_hate","harassment_privacy_fraud","other_severe"])
      assert.ok(categoryConstraint.includes(c),"history category lost: "+c);

    assert.equal((await report(first,"violence_threat_hate","archive",archive)).ok,true);
    assert.equal((await report(second,"harassment_privacy_fraud","archive",archive,"Specific record")).ok,true);
    assert.equal((await report(first,"other_severe","market_post",market)).ok,true);
    assert.equal((await report(first,"spam","archive",archive)).error,"invalid_category");
    for(const type of ["record","experience_card","user","comment"])
      assert.equal((await report(first,"other_severe",type,archive)).error,"invalid_target");
    assert.equal((await report(first,"other_severe","archive","not-a-uuid")).error,"invalid_target");
    assert.equal((await report(first,"other_severe","archive",uid(999))).error,"target_unavailable");
    assert.equal((await report(first,"other_severe","archive",privateArchive)).error,"target_unavailable");
    const duplicate=await report(first,"other_severe","archive",archive,"forged URL","/market/"+market);
    assert.equal(duplicate.duplicate,true);

    await asUser(first);
    assert.equal((await db.query("select * from public.admin_list_support_report_groups('open',40,0)")).rows.length,0);
    assert.equal((await db.query("select * from public.admin_get_support_report_group_details('archive',$1,'open',50,0)",[archive])).rows.length,0);
    assert.equal((await rpc("admin_update_support_submission",[duplicate.id,"resolved","closed",null])).error,"permission_denied");

    await asUser(admin);
    const groups=(await db.query("select * from public.admin_list_support_report_groups('open',40,0)")).rows;
    assert.equal(groups.length,2);
    const selected=groups.find(r=>r.target_type==="archive");
    assert.equal(Number(selected.report_count),2);
    const details=(await db.query("select * from public.admin_get_support_report_group_details('archive',$1,'open',50,0)",[archive])).rows;
    assert.equal(details.length,2);
    assert.equal(new Set(details.map(r=>r.user_id)).size,2);
    assert.equal((await db.query("select * from public.admin_list_support_report_groups('open',1,1)")).rows.length,1);

    // Seed retained historical reports, including more than the legacy 200-row list cap.
    await db.exec("reset role");
    await db.exec([
      "insert into public.profiles(id) select ('00000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid from generate_series(1000,1204) i;",
      "insert into public.support_submissions(user_id,kind,category,content,target_type,target_id,target_url,target_key)",
      "select id,'report','spam','legacy data','archive','"+archive+"','/archive/"+archive+"','archive:'||md5('"+archive+"') from public.profiles",
      "where id::text >= '"+uid(1000)+"' and id::text <= '"+uid(1204)+"';"
    ].join("\n"));
    await asUser(admin);
    const updatedGroups=(await db.query("select * from public.admin_list_support_report_groups('open',40,0)")).rows;
    assert.equal(Number(updatedGroups.find(r=>r.target_type==="archive").report_count),207);
    const seen=[];
    for(let offset=0;offset<207;offset+=50) {
      const rows=(await db.query("select * from public.admin_get_support_report_group_details('archive',$1,'open',50,$2)",[archive,offset])).rows;
      assert.ok(rows.length<=50);seen.push(...rows);
    }
    assert.equal(seen.length,207);
    assert.equal(new Set(seen.map(r=>r.id)).size,207);
    assert.ok(seen.some(r=>r.category==="spam"));
    const result=await rpc("admin_update_support_submission",[selected.representative_id,"resolved","no_violation","reviewed"]);
    assert.equal(result.ok,true);
    assert.equal(result.updated_count,207);
    assert.equal((await db.query("select * from public.admin_get_support_report_group_details('archive',$1,'open',50,0)",[archive])).rows.length,0);
    assert.equal((await db.query("select * from public.admin_get_support_report_group_details('archive',$1,'resolved',50,0)",[archive])).rows.length,50);
    await db.exec("reset role");
    const notices=(await db.query("select * from public.notifications where type='report_update'")).rows;
    assert.equal(notices.length,207);
    assert.ok(notices.every(r=>r.related_url.startsWith("/report?submission=")));
    assert.ok(notices.every(r=>!r.body.includes("reviewed")));
  } finally { await db.close(); }
});
