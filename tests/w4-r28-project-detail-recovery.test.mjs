import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";

const sourceDir = process.env.R28_SOURCE_DIR || process.cwd();
const require = createRequire(path.join(sourceDir, "package.json"));
const ts = require("typescript");
const source = fs.readFileSync(path.join(sourceDir, "app/archive/[id]/page.tsx"), "utf8");
const helperStart = source.indexOf("async function readArchiveWithDeadline<");
const helperEnd = source.indexOf("export default function ArchiveDetail", helperStart);
assert.ok(helperStart >= 0 && helperEnd > helperStart, "deadline implementation missing");
const helperCode = source.slice(helperStart, helperEnd);
const compiled = ts.transpileModule(helperCode + "\nexports.deadline = readArchiveWithDeadline;\n", {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const sandbox = { exports: {}, Promise, setTimeout, clearTimeout };
vm.runInNewContext(compiled, sandbox, { timeout: 1200 });
const deadline = sandbox.exports.deadline;

test("bounded initial read resolves normal results", async () => {
  assert.equal(await deadline(Promise.resolve("owner-ok"), 100), "owner-ok");
});

test("bounded initial read propagates server errors", async () => {
  await assert.rejects(deadline(Promise.reject(new Error("permission-denied")), 100), /permission-denied/);
});

test("a non-settling Supabase request gets an explicit terminal timeout", async () => {
  await assert.rejects(deadline(new Promise(() => undefined), 25), /archive_request_timeout/);
});

test("authentication and private-archive reads are bounded and terminal", () => {
  assert.ok(/readArchiveWithDeadline\(supabase\.auth\.getSession\(\)\)/.test(source), "Missing contract: /readArchiveWithDeadline\\(supabase\\.auth\\.getSession\\(\\)\\)/");
  assert.ok(/readArchiveWithDeadline\(supabase\s*\.from\("archives"\)/.test(source), "Missing contract: /readArchiveWithDeadline\\(supabase\\s*\\.from\\(\"archives\"\\)/");
  assert.ok(/if \(archiveError\) throw archiveError/.test(source), "Missing contract: /if \\(archiveError\\) throw archiveError/");
  assert.ok(/setArchiveLoadState\("unavailable"\)/.test(source), "Missing contract: /setArchiveLoadState\\(\"unavailable\"\\)/");
  assert.ok(/setArchiveLoadState\("error"\)/.test(source), "Missing contract: /setArchiveLoadState\\(\"error\"\\)/");
  assert.ok(/return <ArchivePrivateState \/>/.test(source), "Missing contract: /return <ArchivePrivateState \\/>/");
  assert.ok(/setReloadKey\(\(value\) => value \+ 1\)/.test(source), "Missing contract: /setReloadKey\\(\\(value\\) => value \\+ 1\\)/");
});

test("local-cache and membership lookups cannot indefinitely block legitimate owner reads", () => {
  assert.ok(/readArchiveWithDeadline\(findSavedLocalCopy\(/.test(source), "Missing contract: /readArchiveWithDeadline\\(findSavedLocalCopy\\(/");
  assert.ok(/readArchiveWithDeadline\(supabase\.rpc\("get_my_membership"\), 10000\)/.test(source), "Missing contract: /readArchiveWithDeadline\\(supabase\\.rpc\\(\"get_my_membership\"\\), 10000\\)/");
  assert.ok(/\.catch\(\(error\) => \(\{ data: null, error \}\)\)/.test(source), "Missing contract: /\\.catch\\(\\(error\\) => \\(\\{ data: null, error \\}\\)\\)/");
  assert.ok(/if \(membershipResult\.error\)[\s\S]{0,230}setOwnerMembership\(null\)/.test(source), "Missing contract: /if \\(membershipResult\\.error\\)[\\s\\S]{0,230}setOwnerMembership\\(null\\)/");
  assert.ok(/setOwnerMembershipLoaded\(true\)/.test(source), "Missing contract: /setOwnerMembershipLoaded\\(true\\)/");
});

test("stale async results and record timeline are guarded", () => {
  assert.ok(/let cancelled = false;/.test(source), "Missing contract: /let cancelled = false;/");
  assert.ok(/return \(\) => \{ cancelled = true; \}/.test(source), "Missing contract: /return \\(\\) => \\{ cancelled = true; \\}/");
  assert.ok(/readArchiveWithDeadline\(loadCloudArchiveTimeline\(archiveData\.id, isOwnerView\)\)/.test(source), "Missing contract: /readArchiveWithDeadline\\(loadCloudArchiveTimeline\\(archiveData\\.id, isOwnerView");
  assert.ok(/if \(!archiveData\.is_public && !isOwnerView\)/.test(source), "Missing contract: /if \\(!archiveData\\.is_public && !isOwnerView\\)/");
  assert.ok(/if \(!isOwner && !activeArchive\.is_public\)/.test(source), "Missing contract: /if \\(!isOwner && !activeArchive\\.is_public\\)/");
});
