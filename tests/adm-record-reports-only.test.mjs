import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const uid = n => "00000000-0000-4000-8000-" + String(n).padStart(12, "0");
const a = uid(1), b = uid(2), admin = uid(3), project = uid(100), hiddenProject = uid(101);
const record = uid(110), anotherRecord = uid(111), hiddenRecord = uid(112), privateProjectRecord = uid(113), market = uid(114);
const trashedRecord = uid(115), trashEntryRecord = uid(116), trashedProject = uid(117), trashEntryProject = uid(118);
const trashedProjectRecord = uid(119), trashEntryProjectRecord = uid(120), trashRecordEntry = uid(121), trashProjectEntry = uid(122);

test("ADM2 forward-only public-record reports: reject project/market/private/forged, preserve history and admin grouping", async () => {
  const db = new PGlite();
  const asUser = async id => {
    await db.exec("reset role; set role authenticated");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  };
  const rpc = async (name, args) => (await db.query("select public." + name + "(" + args.map((_,i)=>"$"+(i+1)).join(",") + ") as result", args)).rows[0].result;
  const report = async (who, targetType, id, targetUrl = null) => {
    await asUser(who);
    return rpc("submit_support_submission", ["report","other_severe","",null,targetType,id,targetUrl]);
  };
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; grant usage on schema auth,public to anon,authenticated;
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create table public.profiles(id uuid primary key);
      create table auth.users(id uuid primary key);
      insert into public.profiles values ('${a}'),('${b}'),('${admin}');
      insert into auth.users select id from public.profiles;
      create table public.archives(id uuid primary key,is_public boolean not null default false,trashed_at timestamptz,trash_entry_id uuid);
      create table public.records(id uuid primary key,archive_id uuid not null references public.archives(id),visibility text not null,trashed_at timestamptz,trash_entry_id uuid);
      create table public.market_posts(id uuid primary key,status text not null);
      insert into public.archives values
        ('${project}',true,null,null),('${hiddenProject}',false,null,null),
        ('${trashedProject}',true,now(),null),('${trashEntryProject}',true,null,'${trashProjectEntry}');
      insert into public.records values
        ('${record}','${project}','public',null,null),
        ('${anotherRecord}','${project}','public',null,null),
        ('${hiddenRecord}','${project}','private',null,null),
        ('${privateProjectRecord}','${hiddenProject}','public',null,null),
        ('${trashedRecord}','${project}','public',now(),null),
        ('${trashEntryRecord}','${project}','public',null,'${trashRecordEntry}'),
        ('${trashedProjectRecord}','${trashedProject}','public',null,null),
        ('${trashEntryProjectRecord}','${trashEntryProject}','public',null,null);
      insert into public.market_posts values ('${market}','active');
      create table public.notifications(id uuid primary key default gen_random_uuid(),user_id uuid,type text,title text,body text,related_url text,metadata jsonb);
      create function public.is_app_admin(p_user_id uuid) returns boolean language sql stable as $$select coalesce(p_user_id='${admin}'::uuid,false)$$;
      create function public.create_notification(uuid,uuid,text,text,text,uuid,uuid,uuid,text,jsonb) returns void language sql security definer as $$insert into public.notifications(user_id,type,title,body,related_url,metadata) values($1,$3,$4,$5,$9,$10)$$;
    `);
    await db.exec(read("supabase/migrations/20260910220927_add_support_submission_workflow.sql"));
    await db.exec(read("supabase/migrations/20261030231006_adm_safety_reports_review_groups.sql"));
    // Old reports are history, not authorized new target types after the forward migration.
    await asUser(a);
    const oldReport = await rpc("submit_support_submission", ["report","other_severe","historical report",null,"archive",project,null]);
    assert.equal(oldReport.ok, true);
    await db.exec("reset role");
    await db.exec(read("supabase/migrations/20261101082245_adm_reports_records_only_forward.sql"));
    await db.exec(read("supabase/migrations/20261101082517_adm_support_admin_action_audit.sql"));

    assert.equal((await report(a,"archive",project)).error,"invalid_target");
    assert.equal((await report(a,"market_post",market)).error,"invalid_target");
    assert.equal((await report(a,"comment",record)).error,"invalid_target");
    assert.equal((await report(a,"record","bad")).error,"invalid_target");
    assert.equal((await report(a,"record",hiddenRecord)).error,"target_unavailable");
    assert.equal((await report(a,"record",privateProjectRecord)).error,"target_unavailable");
    assert.equal((await report(a,"record",trashedRecord)).error,"target_unavailable");
    assert.equal((await report(a,"record",trashEntryRecord)).error,"target_unavailable");
    assert.equal((await report(a,"record",trashedProjectRecord)).error,"target_unavailable");
    assert.equal((await report(a,"record",trashEntryProjectRecord)).error,"target_unavailable");
    assert.equal((await report(a,"record",uid(999))).error,"target_unavailable");
    const first = await report(a,"record",record,"/archive/"+hiddenProject+"?record="+record+"&token=forged");
    assert.equal(first.ok,true);
    const duplicate = await report(a,"record",record,"/market/"+market);
    assert.equal(duplicate.duplicate,true);
    assert.equal(duplicate.id,first.id);
    const second = await report(b,"record",record);
    assert.equal(second.ok,true);
    assert.equal((await report(a,"record",anotherRecord)).ok,true);
    await asUser(a);
    assert.equal((await db.query("select * from public.admin_list_support_report_groups('open',50,0)")).rows.length,0);
    assert.equal((await db.query("select * from public.admin_list_support_audit_events(50,0)")).rows.length,0);
    await assert.rejects(db.query("select * from public.support_submission_admin_events"), /permission denied/);
    await db.exec("reset role");
    const canonical = (await db.query("select target_type,target_url from public.support_submissions where id=$1",[first.id])).rows[0];
    assert.equal(canonical.target_type,"record");
    assert.equal(canonical.target_url,"/archive/"+project+"?record="+record);
    await asUser(admin);
    const groups=(await db.query("select * from public.admin_list_support_report_groups('open',40,0)")).rows;
    assert.equal(groups.length,3); // historical project, record 1, record 2
    const selected=groups.find(row => row.target_type==="record" && row.target_id===record);
    assert.equal(Number(selected.report_count),2);
    const details=(await db.query("select * from public.admin_get_support_report_group_details('record',$1,'open',50,0)",[record])).rows;
    assert.equal(details.length,2);
    const action=await rpc("admin_update_support_submission",[selected.representative_id,"resolved","no_violation","checked"]);
    assert.equal(action.ok,true);assert.equal(action.updated_count,2);
    const audit = (await db.query("select * from public.admin_list_support_audit_events(50,0)")).rows;
    assert.equal(audit.length,2);
    assert.ok(audit.every(event => event.actor_id === admin && event.previous_status === "submitted" && event.next_status === "resolved" && event.admin_note === "checked"));
    await db.exec("reset role");
    assert.equal((await db.query("select count(*)::integer as n from public.notifications where type='report_update'")).rows[0].n,2);
    assert.equal((await db.query("select count(*)::integer as n from public.support_submissions where resolved_by=$1",[admin])).rows[0].n,2);
    assert.equal((await db.query("select status from public.support_submissions where id=$1",[oldReport.id])).rows[0].status,"submitted");
  } finally { await db.close(); }
});
