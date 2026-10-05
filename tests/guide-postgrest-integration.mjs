// Run explicitly against an isolated Supabase test project after seeding test
// users and guide/plant fixtures. It never runs in the offline acceptance suite.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import test from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const projectUrl = process.env.LS_GUIDE_TEST_URL;
const key = process.env.LS_GUIDE_TEST_KEY;
const phase = process.env.LS_GUIDE_TEST_PHASE;
const guideId = process.env.LS_GUIDE_TEST_GUIDE_ID;
const plantId = process.env.LS_GUIDE_TEST_PLANT_ID;
const tokens = Object.fromEntries(
  ["basic", "trial", "plus", "expired_trial", "expired_plus"].map((role) => [
    role,
    process.env[`LS_GUIDE_TEST_${role.toUpperCase()}_TOKEN`],
  ]),
);
assert.ok(projectUrl && key && guideId && plantId && ["A", "B"].includes(phase));
assert.ok(Object.values(tokens).every(Boolean), "five test Auth tokens are required");
const host = new URL(projectUrl).hostname;
assert.match(host, /^[a-z0-9]+\.supabase\.co$/);
assert.notEqual(host, "eidltoikfpnrzxruvawf.supabase.co", "never run against production");

async function read(role, endpoint, body, extraHeaders = {}) {
  // curl honors this execution environment's HTTPS proxy; Node fetch does not.
  const args = ["--silent", "--show-error", "--max-time", "20", "--write-out", "\n%{http_code}",
    "--header", `apikey: ${key}`];
  if (tokens[role]) args.push("--header", `Authorization: Bearer ${tokens[role]}`);
  for (const [name, value] of Object.entries(extraHeaders)) args.push("--header", `${name}: ${value}`);
  if (body !== undefined) args.push("--request", "POST", "--header", "Content-Type: application/json",
    "--data", JSON.stringify(body));
  args.push(`${projectUrl}/rest/v1/${endpoint}`);
  const { stdout } = await execFileAsync("curl", args, { maxBuffer: 2 * 1024 * 1024 });
  const separator = stdout.lastIndexOf("\n");
  return { status: Number(stdout.slice(separator + 1)), payload: JSON.parse(stdout.slice(0, separator)) };
}

test(`real Supabase/PostgREST guide permissions, phase ${phase}`, async () => {
  for (const role of ["anon", "basic", "trial", "plus", "expired_trial", "expired_plus"]) {
    if (role !== "anon") {
      const membership = await read(role, "rpc/get_my_membership", {});
      assert.equal(membership.status, 200, `${role} membership: ${JSON.stringify(membership.payload)}`);
      const expected = {
        basic: [0, null, null],
        trial: [1, "trialing", true],
        plus: [1, "active", true],
        expired_trial: [1, "expired", false],
        expired_plus: [1, "expired", false],
      }[role];
      assert.equal(membership.payload.length, expected[0]);
      if (expected[0]) {
        assert.equal(membership.payload[0].status, expected[1]);
        assert.equal(membership.payload[0].can_create_content, expected[2]);
      }
    }
    const catalog = await read(role, "rpc/get_public_guide_catalog", { p_id: guideId });
    assert.equal(catalog.status, 200, `${role} guide directory: ${JSON.stringify(catalog.payload)}`);
    assert.equal(catalog.payload.length, 1);
    const [guide] = catalog.payload;
    assert.equal(guide.name, "矮珍珠");
    assert.ok(guide.summary);
    assert.ok(!("content_en" in guide));
    assert.ok(!("admin_note" in guide));
    assert.ok(!("sections" in guide.content));
    assert.deepEqual(Object.keys(guide).sort(), ["id", "category", "name", "name_en", "source",
      "section_id", "summary", "summary_en", "content_template", "content", "sort_order", "is_active"].sort());
    assert.equal(Boolean(guide.content.filters.temperature_min_c), role === "trial" || role === "plus");

    const full = await read(role, "rpc/get_member_guide_content", { p_id: guideId, p_language: "zh" });
    if (role === "anon") {
      assert.notEqual(full.status, 200, "anon must not execute the full guide RPC");
    } else {
      assert.equal(full.status, 200, `${role} full guide: ${JSON.stringify(full.payload)}`);
      const allowed = role === "trial" || role === "plus";
      assert.equal(Boolean(full.payload), allowed, role);
      if (allowed) assert.ok(full.payload.sections?.length > 0);
    }

    const plant = await read(role, "rpc/get_public_plant_catalog", { p_lookup: "pr95-basil" });
    assert.equal(plant.status, 200, `${role} plant directory: ${JSON.stringify(plant.payload)}`);
    assert.equal(plant.payload.length, 1);
    assert.equal(plant.payload[0].id, plantId);
    assert.equal(plant.payload[0].summary_zh, "公开简化罗勒概要");
    assert.ok(!("planting_guide" in plant.payload[0]));
    assert.ok(!("admin_note" in plant.payload[0]));

    const protectedPlant = await read(role,
      `plant_care_guides?select=summary,planting_guide&plant_id=eq.${plantId}`);
    if (role === "anon") assert.notEqual(protectedPlant.status, 200);
    else {
      assert.equal(protectedPlant.status, 200, `${role} plant care: ${JSON.stringify(protectedPlant.payload)}`);
      assert.equal(protectedPlant.payload.length, role === "trial" || role === "plus" ? 1 : 0);
      if (protectedPlant.payload.length) assert.equal(protectedPlant.payload[0].planting_guide, "会员完整罗勒栽培步骤");
    }

    const directSpecies = await read(role, "plant_species?select=*");
    assert.notEqual(directSpecies.status, 200, `${role} must not SELECT the entire plant table`);

    const directGuide = await read(role, `guide_entries?select=content,content_en&id=eq.${guideId}`);
    if (phase === "A") assert.equal(directGuide.status, 200, "Phase A preserves the old web contract");
    else assert.notEqual(directGuide.status, 200, "Phase B blocks direct full content");
    const metadata = await read(role, `guide_entries?select=id,name,summary,is_active&id=eq.${guideId}`);
    assert.equal(metadata.status, 200, `${role} keeps the public guide metadata contract`);
    assert.equal(metadata.payload.length, 1);
  }

  const inactive = await read("anon", "rpc/get_public_plant_catalog", { p_lookup: "pr95-inactive" });
  assert.equal(inactive.status, 200);
  assert.deepEqual(inactive.payload, []);
  const privateTable = await read("anon", "guide_member_content?select=*", undefined,
    { "Accept-Profile": "private" });
  assert.notEqual(privateTable.status, 200, "private schema must not be a Data API schema");

  const legacy = await read("basic", `rpc/get_plant_core_parameters`, { p_species_id: plantId });
  if (phase === "A") assert.equal(legacy.status, 200, "Phase A keeps the old registered reader");
  else assert.notEqual(legacy.status, 200, "Phase B retires the legacy parameter reader");
});
