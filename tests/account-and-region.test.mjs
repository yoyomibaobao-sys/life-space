import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";

async function moduleFrom(entry) {
  const result = await build({ entryPoints: [entry], bundle: true, write: false, platform: "node", format: "esm" });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString("base64")}`);
}
const numbers = await moduleFrom("lib/account-number.ts");
const memberships = await moduleFrom("lib/membership.ts");
const auth = await moduleFrom("lib/auth-return.ts");
const regions = await moduleFrom("lib/planting-region.ts");
const photos = await moduleFrom("lib/image-compression.ts");

test("all compact account numbers round-trip without duplicates or I/O segments", () => {
  const seen = new Set();
  for (let sequence = 1; sequence <= numbers.MAX_COMPACT_ACCOUNT_SEQUENCE; sequence++) {
    const suffix = numbers.formatAccountSequence(sequence);
    assert.equal(suffix.length, 3);
    assert.doesNotMatch(suffix, /[IO]/);
    assert.ok(!seen.has(suffix));
    seen.add(suffix);
    assert.equal(numbers.parseAccountNumber(`LSa2026${suffix}`).registrationSequence, sequence);
  }
  assert.equal(numbers.formatAccountSequence(3376), null);
  assert.equal(numbers.formatAccountSequence(0), null);
  assert.equal(numbers.parseAccountNumber("LSa2026A00"), null);
  assert.equal(numbers.parseAccountNumber("LSa2026000"), null);
  assert.equal(numbers.parseAccountNumber("LSa2026I01"), null);
});

test("old account numbers remain equivalent only for their exact year, class and permanent rank", () => {
  assert.equal(numbers.formatAccountNumber("LSa-2026-0001"), "LSa2026001");
  assert.equal(numbers.matchesAccountConfirmation("LSa2026A01", "LSa-2026-1000"), true);
  for (const wrong of ["LSa2026A02", "LSb2026A01", "LSa2027A01", "", "a-user-id"]) {
    assert.equal(numbers.matchesAccountConfirmation(wrong, "LSa-2026-1000"), false);
  }
  assert.equal(numbers.formatAccountNumber("LSa-2026-9999"), "LSa-2026-9999");
  assert.equal(numbers.matchesAccountConfirmation("same-uuid", "same-uuid"), true);
});

test("registered, visitor, trial, Plus, loading and failure are distinct states", () => {
  const label = (args) => memberships.getUserTypeLabel(args);
  assert.equal(label({signedIn:false}), "游客");
  assert.equal(label({signedIn:true, membership:null}), "注册用户");
  assert.equal(label({signedIn:true, membership:null, failed:true}), "暂时无法读取");
  assert.equal(label({signedIn:true, loading:true}), "读取中…");
  assert.equal(label({signedIn:true, membership:{plan:"trial",can_create_content:true}}), "云体验");
  assert.equal(label({signedIn:true, membership:{plan:"trial",can_create_content:false}}), "注册用户");
  assert.equal(label({signedIn:true, membership:{plan:"basic",status:"expired"}}), "Plus");
  assert.equal(label({signedIn:true, membership:{plan:"admin"}}), "注册用户");
});

test("email redirects always use the official domain with safe internal return paths", () => {
  assert.equal(auth.buildAuthEmailRedirect("recovery"), "https://life-space.uk/auth/confirm?type=recovery");
  for (const unsafe of ["https://example.test", "//example.test", "/\\example.test", "/auth/confirm", "/login", "/archive\n"]) {
    const url = new URL(auth.buildAuthEmailRedirect("signup", unsafe));
    assert.equal(url.origin, "https://life-space.uk");
    assert.equal(url.pathname, "/auth/confirm");
    assert.equal(url.searchParams.get("returnTo"), "/archive");
  }
  assert.equal(new URL(auth.buildAuthEmailRedirect("signup", "/membership#cloud-trial")).searchParams.get("returnTo"), "/membership#cloud-trial");
});

test("coarse project region never inherits a profile street address or record GPS", () => {
  const input = { country_code:"CN", country_name:"中国", region_name:"浙江", city_name:"宁波", location:"某路99号", latitude:29.8, longitude:121.5 };
  assert.deepEqual(regions.normalizePlantingRegion(input), {country_code:"CN",country_name:"中国",region_name:"浙江",city_name:"宁波"});
  assert.equal(regions.normalizePlantingRegion({location:"某路99号"}), null);
  assert.equal(regions.normalizePlantingRegion({...input, city_name:""}), null);
  assert.equal(regions.normalizePlantingRegion({...input, city_name:22}), null);
  assert.equal(regions.formatPlantingRegion(input), "中国 · 浙江 · 宁波");
});

test("cloud processing failures cannot silently upload the original photo", async () => {
  const original = new File([new Uint8Array([255,216,255,225,0,1])], "camera.jpg", {type:"image/jpeg"});
  delete globalThis.window;
  await assert.rejects(photos.standardizeRecordPhotoFile(original, {requireSanitized:true}), /Could not process/);
  assert.equal((await photos.standardizeRecordPhotoFile(original)).file, original);
});
