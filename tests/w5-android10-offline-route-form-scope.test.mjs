import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";
import ts from "typescript";
const read=(x)=>readFileSync(new URL("../"+x,import.meta.url),"utf8");
const main=read("mobile-offline-src/main.tsx");
const region=read("lib/planting-region.ts");
const regionField=read("components/archive/PlantingRegionField.tsx");
const adapter=read("lib/local-archive-detail-adapters.ts");
const db=read("lib/local-offline-db.ts");
const guide=read("lib/offline-guide-directory.ts");
const start=main.indexOf("function ProjectForm(");
const end=main.indexOf("function FilePreview(",start);
assert.ok(start>0&&end>start);
const form=main.slice(start,end);
const parsed=ts.createSourceFile("region.ts",region,ts.ScriptTarget.ES2022,true);
let fn;
function find(n){if(ts.isFunctionDeclaration(n)&&n.name?.text==="normalizePlantingRegion")fn=n.getText(parsed);ts.forEachChild(n,find);}
find(parsed);
assert.ok(fn);
const output=ts.transpileModule(fn.replace(/^export\s+/,"")+"\nglobalThis.normalizePlantingRegion=normalizePlantingRegion;",{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const ctx={EMPTY_PLANTING_REGION:{country_code:"",country_name:"",region_name:"",city_name:""}};
vm.runInNewContext(output,ctx);
const normalized=ctx.normalizePlantingRegion;
const field=(region_name="",city_name="",country_code="CN")=>({country_code,country_name:"China",region_name,city_name});

test("province-only and city-only addresses are accepted, completely empty locality rejected",()=>{
  assert.ok(normalized(field("浙江省","")));
  assert.ok(normalized(field("","宁波市")));
  assert.ok(normalized(field("浙江省","宁波市")));
  assert.equal(normalized(field("","")),null);
  assert.equal(normalized(field("浙江省","","")),null);
  assert.equal(normalized({...field("浙江省","","OTHER"),country_name:""}),null);
});

test("form requires country and one locality, not mandatory city, and displays direct errors",()=>{
  assert.doesNotMatch(regionField,/<input required=\{required\} value=\{draft\.city_name\}/);
  assert.match(regionField,/required=\{required\} value=\{draft\.country_code\}/);
  assert.match(form,/normalizePlantingRegion\(plantingRegion\)/);
  assert.match(form,/省／州或城市／区县至少一级/);
  assert.match(form,/请填写项目名称/);
  assert.match(form,/请选择或填写关联指引/);
  assert.match(form,/onSubmit=\{submit\} noValidate/);
  assert.match(form,/\{error \? <section className="notice warning"/);
});

test("offline cloud project route always uses cloud cache immediately except open media fullscreen",()=>{
  assert.match(main,/const showLiveCloud = imageFullscreenOpen \? presentationOnline\.current\s*: !online \|\| connectivity\.status === "offline" \? false/);
  assert.match(main,/getCloudOfflineCacheByCloudSource\(archiveId, authenticatedOwnerContext\)/);
  assert.match(main,/resolveLocalArchiveDetail\(archive\.id, authenticatedOwnerContext\)/);
  assert.match(main,/if \(status === "ready" && cached\) return <DeviceOwnedProjectDetail/);
  assert.match(main,/onClick=\{\(\) => openDetail\(archive\.id\)\}/);
});

test("online Android legacy/new project routes cannot default into disabled S6 local-only",()=>{
  assert.match(main,/const newProjectDestination: CreationDestination \| null/);
  assert.match(main,/screen\.destination === "pending-cloud" \|\| !online \? "pending-cloud" : "live-cloud"/);
  assert.match(main,/destination=\{newProjectDestination \|\| "pending-cloud"\}/);
  assert.match(main,/const localSpaceEnabled = false/);
  assert.match(main,/sync_destination: owner\?\.userId && destination === "pending-cloud" \? "pending-cloud" : "local-only"/);
});

test("cached/bundled offline guide names are presented and the mandatory name remains enforced",()=>{
  assert.match(guide,/BUNDLED_GUIDE_DIRECTORY/);
  assert.match(guide,/return mergeEntries\(\[\.\.\.BUNDLED_GUIDE_DIRECTORY, \.\.\.cached\]\)/);
  assert.match(form,/setDirectory\(loadOfflineGuideDirectory\(\)\)/);
  assert.match(form,/lifespace-guide-directory-updated/);
  assert.match(form,/directory\.some\(\(candidate\) => candidate\.category === category\)/);
  assert.match(form,/setSelectedGuide\(candidate\)/);
  assert.match(form,/if \(!systemName\.trim\(\)\)/);
});

test("synced cache editing is closed in UI and database but historical legitimate pending remains",()=>{
  assert.match(adapter,/if \(archive\.local_role !== "cloud-offline-cache"\) return true;\s*\/\/ Synced[\s\S]*?return false/);
  assert.match(adapter,/return isPendingCloudSyncStatus\(record\.sync\?\.status\)/);
  assert.match(db,/if \(!allowInFlightReceipt\) \{\s*throw Error\("已同步云项目离线只读/);
  assert.match(db,/if \(!isPendingCloudSyncStatus\(record\.sync\?\.status\)\)/);
  assert.match(main,/await preparePendingCloudSyncQueue/);
  assert.match(main,/async function uploadPending\(/);
});

test("new project and record do not require any cycle metadata",()=>{
  assert.match(form,/const \[cycleEnabled, setCycleEnabled\] = useState\(Boolean\(archive\?\.cycle_enabled\)\)/);
  assert.match(form,/cycleEnabled, nextCycleName/);
  assert.match(main,/cycle_id: cycleId \|\| null/);
  assert.doesNotMatch(form,/if \(!cycleEnabled\) \{\s*setError/);
});
