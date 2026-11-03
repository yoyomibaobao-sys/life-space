import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import path from "node:path";
import test from "node:test";
import {build} from "esbuild";
import {PGlite} from "@electric-sql/pglite";

const root=path.resolve(import.meta.dirname,"..");
const source=(name)=>readFileSync(path.join(root,name),"utf8");
async function load(name) {
 const result=await build({entryPoints:[path.join(root,name)],absWorkingDir:root,
  bundle:true,platform:"node",format:"esm",write:false,alias:{"@":root}});
 return import("data:text/javascript;base64,"+Buffer.from(result.outputFiles[0].text).toString("base64"));
}
test("every guide separately caps Free guest cards and records at 0/1/2/2; Plus unchanged",async()=>{
 const {guideAssociationPreview}=await load("lib/guide-association-limits.ts");
 for (const quantity of [0,1,2,3]) for (const category of ["records","cards"]){
  const rows=Array.from({length:quantity},(_,i)=>({id:category+"-"+i}));
  const guest=guideAssociationPreview(rows,false);
  assert.equal(guest.items.length,Math.min(quantity,2));
  assert.equal(guest.hasMore,quantity>2);
  const free=guideAssociationPreview(rows,false);
  assert.deepEqual(free,guest);
  const plus=guideAssociationPreview(rows,true);
  assert.equal(plus.items.length,quantity);
  assert.equal(plus.hasMore,false);
 }
});
test("Plus entitlement is paid, active and unexpired; Trial Free expired refund cannot unlock",async()=>{
 const {canAccessMembershipGuidance}=await load("lib/membership.ts");
 const base={plan:"basic",status:"active",paid_until:"2050-01-01T00:00:00Z"};
 assert.equal(canAccessMembershipGuidance(base),true);
 for(const membership of [null,{...base,plan:"trial"},{...base,plan:"admin"},
  {...base,status:"trialing"},{...base,status:"canceled"},
  {...base,paid_until:"2026-01-01T00:00:00Z"},{...base,paid_until:null}]){
  assert.equal(canAccessMembershipGuidance(membership),false);
 }
});
test("v2 legacy cache migration removes member-generated full overviews, preserving names",async()=>{
 const mod=await load("lib/offline-guide-directory.ts");
 const data=new Map([["lifespace:guide-directory:v2",JSON.stringify([
  {id:"guide-1",label:"果酱",source:"public_guide",category:"other",
   overviewZh:"PRIVATE_MEMBER_CONTENT",content:{sections:["private"]},
   parametersZh:[{label:"full",value:"secret"}]},
 ])]]);
 const oldStorage=globalThis.localStorage;
 globalThis.localStorage={getItem:(key)=>data.get(key)??null,
  setItem:(key,val)=>data.set(key,val),removeItem:(key)=>data.delete(key)};
 try{
  const list=mod.loadOfflineGuideDirectory();
  const row=mod.findOfflineGuideEntry(list,"guide-1");
  assert.equal(row?.label,"果酱");
  assert.equal(row?.overviewZh,undefined);
  assert.equal(row?.content,undefined);
  assert.equal(row?.parametersZh,undefined);
  assert.ok(data.has("lifespace:guide-directory:v3"));
  assert.equal(data.has("lifespace:guide-directory:v2"),false);
 }finally{globalThis.localStorage=oldStorage;}
});
test("held SQL's Plus predicate executes correctly in isolated PostgreSQL (no QA DB writes)",async()=>{
 const sql=source(".wp10-delivery/Guide-FreePlus-20261103/Guide-Plus-RPC-REVIEW-20261103.sql");
 const helper=sql.match(/create or replace function private\.can_read_full_guide[\s\S]*?\$\$;/i)?.[0];
 assert.ok(helper);
 const db=new PGlite();
 try{
  await db.exec("create schema private; create role anon; create role authenticated; create role service_role; create table public.user_memberships(user_id uuid,plan text,status text,paid_until timestamptz)");
  await db.exec(helper);
  await db.exec("insert into public.user_memberships values "+
   "('00000000-0000-4000-8000-000000000001','basic','active',now()+interval '1 year'),"+
   "('00000000-0000-4000-8000-000000000002','trial','trialing',now()+interval '1 year'),"+
   "('00000000-0000-4000-8000-000000000003','basic','expired',now()+interval '1 year'),"+
   "('00000000-0000-4000-8000-000000000004','basic','active',now()-interval '1 day')");
  for(let i=1;i<=4;i++){
   const id="00000000-0000-4000-8000-"+String(i).padStart(12,"0");
   const r=await db.query("select private.can_read_full_guide($1::uuid) as allowed",[id]);
   assert.equal(r.rows[0].allowed,i===1);
  }
 }finally{await db.close();}
});
test("ordinary/plant guide Free rows are scoped to already public archives; offline has no remote associations",()=>{
 const ordinary=source("components/plant-detail/GuideDetailView.tsx");
 const plant=source("app/plant/[id]/page.tsx");
 const offline=source("lib/offline-guide-directory.ts");
 assert.match(ordinary,/\.eq\("is_public", true\)/);
 assert.match(ordinary,/\.eq\("visibility", "public"\)/);
 assert.match(ordinary,/\.eq\("status", "published"\)/);
 assert.match(ordinary,/guideAssociationPreview\(publicRecords, fullAccess\)/);
 assert.match(plant,/guideAssociationPreview\(cards\.items, canReadFullGuide\)/);
 assert.match(plant,/guideAssociationPreview\(records\.items, canReadFullGuide\)/);
 assert.match(ordinary,/if \(offline\) \{/);
 assert.match(ordinary,/setRelatedRecords\(\[\]\)/);
 assert.match(offline,/const KEY = "lifespace:guide-directory:v3"/);
});
test("full plant content is still a server ACL installation gate, not falsely marked verified",()=>{
 const sql=source(".wp10-delivery/Guide-FreePlus-20261103/Guide-Plus-RPC-REVIEW-20261103.sql");
 const held=source(".wp10-delivery/Guide-FreePlus-20261103/Guide-Plant-Full-ACL-PhaseB-HELD-20261103.sql");
 assert.match(sql,/get_plus_plant_guide/);
 assert.match(sql,/private\.can_read_full_guide/);
 assert.match(held,/revoke select on public\.plant_parameters/);
 assert.match(held,/revoke select on public\.plant_care_guides/);
 assert.match(held,/revoke select on public\.plant_growth_cycle/);
});
