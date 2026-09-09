import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { after } from "node:test";
import { build } from "esbuild";
import { pathToFileURL } from "node:url";

const out = await mkdtemp(path.join(tmpdir(), "lifespace-timezone-"));
await build({entryPoints:["lib/date-time.ts", "lib/photo-metadata.ts", "lib/archive-detail-utils.ts"], bundle:true, platform:"node", format:"esm", outdir:out, outExtension:{".js":".mjs"}});
after(() => rm(out, {recursive:true, force:true}));
function runInZone(zone, expression) {
  const code = `import * as time from ${JSON.stringify(pathToFileURL(path.join(out,"date-time.mjs")).href)};
import * as photo from ${JSON.stringify(pathToFileURL(path.join(out,"photo-metadata.mjs")).href)};
import * as detail from ${JSON.stringify(pathToFileURL(path.join(out,"archive-detail-utils.mjs")).href)};
process.stdout.write(JSON.stringify(${expression}));`;
  return JSON.parse(execFileSync(process.execPath, ["--input-type=module","-e",code], {env:{...process.env,TZ:zone}, encoding:"utf8"}));
}

test("Shanghai input round-trips to UTC, preserves seconds and never alters the original timestamp", () => {
  assert.deepEqual(runInZone("Asia/Shanghai", `[
    time.toLocalDateTimeInputValue("2026-09-07T05:30:47Z"),
    time.localDateTimeInputToIso("2026-09-07T13:30","2026-09-07T05:30:47Z"),
    time.localDateTimeInputToIso("2026-09-07T14:30"),
    time.localDateTimeInputToIso("2026-02-30T13:30")
  ]`), ["2026-09-07T13:30", "2026-09-07T05:30:47.000Z", "2026-09-07T06:30:00.000Z", null]);
});

test("DST text edits retain the second occurrence, gaps are rejected and day numbers use calendar days", () => {
  assert.deepEqual(runInZone("America/New_York", `[
    time.localDateTimeInputToIso("2026-11-01T01:30","2026-11-01T06:30:21Z"),
    time.localDateTimeInputToIso("2026-03-08T02:30"),
    detail.getDayNumber("2026-03-08T05:00:00Z","2026-03-09T04:00:00Z")
  ]`), ["2026-11-01T06:30:21.000Z", null, 2]);
});

test("export formatting uses the requested device timezone even when the server is UTC", () => {
  assert.deepEqual(runInZone("UTC", `[
    time.formatPreciseDateTime("2026-12-31T16:00:00Z","Asia/Shanghai"),
    time.formatPreciseDateTime("2026-12-31T16:00:00Z","America/New_York"),
    time.normalizeTimeZone("not-a-zone")
  ]`), ["2027/01/01 00:00", "2026/12/31 11:00", "UTC"]);
});

test("photo offsets take precedence over the viewing device; missing offsets use its local clock", () => {
  for (const zone of ["UTC","Asia/Shanghai","America/New_York"]) {
    assert.equal(runInZone(zone, `photo.capturedAtFromMetadata({DateTimeOriginal:"2026:09:07 13:30:00",OffsetTimeOriginal:"+08:00"})`), "2026-09-07T05:30:00.000Z");
  }
  assert.equal(runInZone("Asia/Shanghai", `photo.capturedAtFromMetadata({DateTimeOriginal:"2026:09:07 13:30:00"})`), "2026-09-07T05:30:00.000Z");
  assert.equal(runInZone("UTC", `photo.capturedAtFromMetadata({DateTimeOriginal:"2026:02:30 13:30:00",OffsetTimeOriginal:"+08:00"})`), null);
});
