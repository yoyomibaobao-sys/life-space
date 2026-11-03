import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { build } from "esbuild";

const root=path.resolve(import.meta.dirname,"..");
const source=(name)=>readFileSync(path.join(root,name),"utf8");
const compiled=await build({entryPoints:[path.join(root,"lib/guide-association-pages.ts")],
  absWorkingDir:root,bundle:true,platform:"node",format:"esm",write:false,alias:{"@":root}});
const {scanGuidePages,GUIDE_PAGE_SIZE,GUIDE_FREE_TARGET}=await import(
 "data:text/javascript;base64,"+Buffer.from(compiled.outputFiles[0].text).toString("base64"));

function feed(rows, accept=async()=>true, target=Infinity) {
 const ranges=[];
 const loadPage=async(from,to)=>{ranges.push([from,to]);return {data:rows.slice(from,to+1),error:null};};
 return {ranges,run:()=>scanGuidePages({loadPage,accept,target})};
}

test("Free and guest independently receive 0,1,2,2 legal cards/records; Plus handles 25 and 50",async()=>{
 assert.equal(GUIDE_PAGE_SIZE,24);assert.equal(GUIDE_FREE_TARGET,3);
 for(const category of ["cards","records"])for(const count of [0,1,2,3,25,50]){
  const rows=Array.from({length:count},(_,i)=>({id:category+i}));
  const f=feed(rows,async()=>true,3);const free=await f.run();
  assert.equal(Math.min(free.items.length,2),Math.min(count,2));
  assert.equal(free.hasMore,count>2);
  if(count>=3)assert.equal(f.ranges.length,1);
  const p=feed(rows);const plus=await p.run();
  assert.equal(plus.items.length,count);
  assert.equal(new Set(plus.items.map(x=>x.id)).size,count);
  if(count>24)assert.ok(p.ranges.length>=2);
  assert.equal(plus.hasMore,false);
 }
});
test("Free scans beyond 24 invalid/private candidates and stops at third verified public card",async()=>{
 const rows=Array.from({length:50},(_,i)=>({id:String(i+1),public:i>=28}));
 const f=feed(rows,async(r)=>r.public,3);const result=await f.run();
 assert.deepEqual(result.items.map(x=>x.id),["29","30","31"]);
 assert.equal(result.hasMore,true);
 assert.deepEqual(f.ranges,[[0,23],[24,47]]);
});
test("a page of duplicated candidates does not count twice or suppress later valid rows",async()=>{
 const rows=Array.from({length:50},(_,i)=>({id:String(i+1),valid:i>=27}));
 rows[24]={id:"24",valid:false};rows[25]={id:"24",valid:false};
 const f=feed(rows,async(r)=>r.valid,3);const result=await f.run();
 assert.deepEqual(result.items.map(x=>x.id),["28","29","30"]);
 assert.equal(result.items.length,3);
 const plus=await feed(rows,async(r)=>r.valid).run();
 assert.equal(plus.items.length,23);
 assert.equal(new Set(plus.items.map(x=>x.id)).size,plus.items.length);
});
test("a page read error fails closed and never silently reports an empty public list",async()=>{
 await assert.rejects(()=>scanGuidePages({
  loadPage:async()=>({data:null,error:{message:"unavailable"}}),
  target:3,
 }),/could not be read/);
});
test("ordinary guide and plant guide both use the shared pagination, public-first and order by ID",()=>{
 for(const pathName of ["components/plant-detail/GuideDetailView.tsx","app/plant/[id]/page.tsx"]){
  const s=source(pathName);
  assert.match(s,/scanGuidePages<.*>/);
  assert.match(s,/\.range\(from, to\)/);
  assert.match(s,/\.order\("id", \{ ascending: true \}\)/);
  assert.match(s,/\.eq\("is_public", true\)/);
  assert.match(s,/\.eq\("visibility", "public"\)/);
  assert.match(s,/\.eq\("status", "published"\)/);
  assert.match(s,/is_experience_card_public/);
  assert.match(s,/GUIDE_FREE_TARGET/);
  assert.doesNotMatch(s,/\.limit\(RELATED_LIMIT\)|\.limit\(RELATED_ARCHIVE_LIMIT\)/);
 }
});
test("Plus RPC client is server-gated, never falls back to old full-table SELECT",()=>{
 const plant=source("app/plant/[id]/page.tsx");
 const ordinary=source("components/plant-detail/GuideDetailView.tsx");
 const sql=source(".wp10-delivery/Guide-FreePlus-20261103/Guide-Plus-RPC-REVIEW-20261103.sql");
 assert.match(plant,/get_plus_plant_guide/);
 assert.match(plant,/p_species_id: resolvedPlantId, p_language: language/);
 assert.match(plant,/hasOwnProperty\.call\(plusResult\.data, "parameters"\)/);
 assert.match(plant,/hasOwnProperty\.call\(plusResult\.data, "growth_cycle"\)/);
 assert.match(plant,/hasOwnProperty\.call\(plusResult\.data, "care_guide"\)/);
 assert.doesNotMatch(plant,/supabase\.from\("plant_parameters"\)/);
 assert.doesNotMatch(plant,/supabase\.from\("plant_care_guides"\)/);
 assert.doesNotMatch(plant,/supabase\.from\("plant_growth_cycle"\)/);
 assert.match(ordinary,/get_member_guide_content/);
 assert.match(ordinary,/isPaidPlus/);
 assert.match(ordinary,/Array\.isArray\(\(rawFull as PublicGuideContent\)\.parameters\)/);
 assert.match(sql,/p_species_id uuid, p_language text default 'zh'/);
 assert.match(sql,/'parameters'/);assert.match(sql,/'growth_cycle'/);assert.match(sql,/'care_guide'/);
});
test("auth session switch cancels pending full-content reads; offline no remote full fetch",()=>{
 for(const pathName of ["app/plant/[id]/page.tsx","components/plant-detail/GuideDetailView.tsx"]){
  const s=source(pathName);
  assert.match(s,/onAuthStateChange/);
  assert.match(s,/setHasCloudAccess\(false\)/);
  assert.match(s,/subscription\.unsubscribe\(\)/);
  assert.match(s,/authRevision/);
  assert.match(s,/if \(offline\) \{/);
 }
});
