import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../mobile-offline-src/main.tsx", import.meta.url), "utf8");
const start = source.indexOf("function AndroidLocalTrash(");
const end = source.indexOf("function readMobileOverlayOpen()", start);
assert.ok(start >= 0 && end > start, "R10 cloud trash component exists");
const section = source.slice(start, end);
const parentStart = source.indexOf('{screen.kind === "trash" ? <AndroidLocalTrash');
const parentEnd = source.indexOf(' /> : null}', parentStart);
assert.ok(parentStart >= 0 && parentEnd > parentStart);

const parsed = ts.createSourceFile("main.tsx", section, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let restoreArrow;
function visit(node) {
  if (ts.isJsxAttribute(node) && node.name.text === "onClick" &&
      node.initializer && ts.isJsxExpression(node.initializer) &&
      node.initializer.expression && ts.isArrowFunction(node.initializer.expression) &&
      node.initializer.expression.getText(parsed).includes("item.restore!().then")) {
    if (restoreArrow) throw new Error("Ambiguous restore click handlers");
    restoreArrow = node.initializer.expression.getText(parsed);
  }
  ts.forEachChild(node, visit);
}
visit(parsed);
assert.ok(restoreArrow, "Actual restore button click handler is parseable");

const compiled = ts.transpileModule(
  "globalThis.__restoreClick = " + restoreArrow + ";",
  {compilerOptions:{target:ts.ScriptTarget.ES2022, module:ts.ModuleKind.None}},
).outputText;

const tick = () => new Promise((resolve) => setImmediate(resolve));
async function simulate({sourceKind="cloud", succeeded=true}={}) {
  const calls = [];
  let errorText = "";
  let working = false;
  const project = {id:"qa-archive"};
  const item = {
    source:sourceKind, key:sourceKind === "local" ? "local-project:qa-archive" : "cloud:qa-trash-id",
    restore: async () => {
      calls.push("restore");
      if (!succeeded) throw Error("restore_denied");
    },
  };
  const runtime = {
    item,
    setWorking(value){ working=value; calls.push("working:"+value); },
    setError(value){ errorText=value; calls.push("error:"+value); },
    onCloudRestored:async()=>{ calls.push("loadCloudList"); },
    refreshTrash:async()=>{ calls.push("refreshTrash"); },
    onLocalChanged:async()=>{ calls.push("loadList"); },
    setProjects(updater){calls.push("localProjects");assert.equal(updater([project]).length,0);},
    setItems(){calls.push("localCycles");},
    Error,
  };
  vm.runInNewContext(compiled,runtime);
  runtime.__restoreClick();
  for(let i=0;i<5;i++) await tick();
  return {calls,working,errorText};
}

test("only after confirmed cloud restore refresh existing cloud workspace then trash list",async()=>{
  const f=await simulate();
  assert.deepEqual(f.calls.filter(s=>["restore","loadCloudList","refreshTrash","loadList","localProjects","localCycles"].includes(s)),
    ["restore","loadCloudList","refreshTrash"]);
  assert.equal(f.working,false);
  assert.equal(f.errorText,"");
});

test("failed cloud restore does not mutate list, refresh cloud or request restore again",async()=>{
  const f=await simulate({succeeded:false});
  assert.deepEqual(f.calls.filter(s=>["restore","loadCloudList","refreshTrash","loadList"].includes(s)),["restore"]);
  assert.equal(f.errorText,"restore_denied");
  assert.equal(f.working,false);
});

test("historical local project restoration still uses local list only",async()=>{
  const f=await simulate({sourceKind:"local"});
  assert.ok(f.calls.includes("localProjects"));
  assert.ok(f.calls.includes("loadList"));
  assert.ok(!f.calls.includes("loadCloudList"));
  assert.ok(!f.calls.includes("refreshTrash"));
  assert.equal(f.working,false);
});

test("parent delegates to existing owner-scoped loadCloudList without new state, purge or RPC",()=>{
  const parent = source.slice(parentStart, parentEnd);
  assert.match(parent,/onCloudRestored=\{\(\) => loadCloudList\(cloudUserId\)\}/);
  assert.match(parent,/onLocalChanged=\{\(\) => loadList\(\)\}/);
  assert.match(section,/await onCloudRestored\(\);\s*await refreshTrash\(\)/);
  assert.doesNotMatch(section,/resetDatabase|clearAllCache|localStorage\.clear|repeatRestore/);
  const loader = source.slice(source.indexOf("const loadCloudList = useCallback"),source.indexOf("const loadDetail = useCallback"));
  assert.match(loader,/authenticatedOwnerContext\?\.userId !== resolvedUserId/);
  assert.match(loader,/requestId !== cloudListRequestRef\.current/);
  assert.match(loader,/setCloudArchives\(displayRows\)/);
});
