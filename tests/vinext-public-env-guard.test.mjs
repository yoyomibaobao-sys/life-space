import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  assertPublicSupabaseBuildEnv,
  inspectPublicSupabaseEnv,
  loadPublicSupabaseEnv,
  parsePublicSupabaseEnvText,
} from "../scripts/vinext-public-env.mjs";
import { assertVinextClientSupabaseBundle } from "../scripts/verify-vinext-client-supabase-bundle.mjs";

const root = process.cwd();
const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");

function makeTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "vinext-public-env-"));
}

test("package.json routes vinext production builds through the public env guard", () => {
  const packageJson = read("package.json");
  const buildScript = read("scripts/build-vinext.mjs");
  const verifyScript = read("scripts/verify-vinext-client-supabase-bundle.mjs");
  const envScript = read("scripts/vinext-public-env.mjs");

  assert.match(packageJson, /"build:vinext": "node scripts\/build-vinext.mjs"/);
  assert.match(buildScript, /assertPublicSupabaseBuildEnv/);
  assert.match(buildScript, /assertVinextClientSupabaseBundle/);
  assert.match(verifyScript, /NEXT_PUBLIC_SUPABASE_URL/);
  assert.match(envScript, /Worker runtime vars cannot inline/);
  assert.doesNotMatch(envScript, /process\.env\.SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(buildScript, /SUPABASE_SERVICE_ROLE_KEY/);
});

test("Cloudflare canary still injects public Supabase env into the vinext build job", () => {
  const workflow = read(".github/workflows/cloudflare-canary.yml");
  assert.match(workflow, /npm run build:vinext/);
  assert.match(workflow, /NEXT_PUBLIC_SUPABASE_URL: https:\/\/[a-z0-9]+\.supabase\.co/);
  assert.match(
    workflow,
    /NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: sb_publishable_[A-Za-z0-9_-]+/
  );
  assert.match(workflow, /must exist in the vinext \*build\* process/);
  assert.doesNotMatch(workflow, /SUPABASE_SERVICE_ROLE_KEY/);
});

test("public env parser ignores service role and other secrets", () => {
  const parsed = parsePublicSupabaseEnvText(`
NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=public-test-key
SUPABASE_SERVICE_ROLE_KEY=should-not-load
PAYPAL_SECRET=also-not-load
`);
  assert.equal(parsed.NEXT_PUBLIC_SUPABASE_URL, "https://example.supabase.co");
  assert.equal(parsed.NEXT_PUBLIC_SUPABASE_ANON_KEY, "public-test-key");
  assert.equal(parsed.SUPABASE_SERVICE_ROLE_KEY, undefined);
  assert.equal(parsed.PAYPAL_SECRET, undefined);
});

test("build env guard requires URL plus a public key and rejects service role fallback", () => {
  assert.throws(
    () =>
      assertPublicSupabaseBuildEnv({
        SUPABASE_SERVICE_ROLE_KEY: "role-key-only",
      }),
    /Missing: NEXT_PUBLIC_SUPABASE_URL/
  );
  assert.throws(
    () =>
      assertPublicSupabaseBuildEnv({
        NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "role-key-only",
      }),
    /PUBLISHABLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY/
  );
  const ok = assertPublicSupabaseBuildEnv({
    NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "public-test-key",
  });
  assert.equal(ok.hasUrl, true);
  assert.equal(ok.hasAnon, true);
});

test("dotenv loader fills missing public keys without overwriting process env", () => {
  const temp = makeTempRoot();
  fs.writeFileSync(
    path.join(temp, ".env.local"),
    "NEXT_PUBLIC_SUPABASE_URL=https://from-file.supabase.co\nNEXT_PUBLIC_SUPABASE_ANON_KEY=from-file\nSUPABASE_SERVICE_ROLE_KEY=nope\n"
  );
  const env = {
    NEXT_PUBLIC_SUPABASE_URL: "https://from-process.supabase.co",
  };
  loadPublicSupabaseEnv({ root: temp, env });
  assert.equal(env.NEXT_PUBLIC_SUPABASE_URL, "https://from-process.supabase.co");
  assert.equal(env.NEXT_PUBLIC_SUPABASE_ANON_KEY, "from-file");
  assert.equal(env.SUPABASE_SERVICE_ROLE_KEY, undefined);
  const state = inspectPublicSupabaseEnv(env);
  assert.equal(state.hasServiceRole, false);
});

test("client bundle validation fails when the supabase URL is not inlined", () => {
  const temp = makeTempRoot();
  const chunkDir = path.join(temp, "dist/client/_next/static/chunks");
  fs.mkdirSync(chunkDir, { recursive: true });
  fs.writeFileSync(
    path.join(chunkDir, "supabase-unlined.js"),
    "createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)"
  );
  const env = {
    NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "public-test-key",
  };
  assert.throws(
    () => assertVinextClientSupabaseBundle({ root: temp, env }),
    /still contains NEXT_PUBLIC_SUPABASE_URL/
  );
});

test("client bundle validation passes when the build-time host is inlined", () => {
  const temp = makeTempRoot();
  const chunkDir = path.join(temp, "dist/client/_next/static/chunks");
  fs.mkdirSync(chunkDir, { recursive: true });
  fs.writeFileSync(
    path.join(chunkDir, "supabase-inlined.js"),
    'createClient("https://example.supabase.co","public-test-key")'
  );
  const result = assertVinextClientSupabaseBundle({
    root: temp,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "public-test-key",
    },
  });
  assert.equal(result.chunkCount, 1);
  assert.equal(result.inlinedHostCount, 1);
  assert.equal(result.inlinedSelectedKeyCount, 1);
  assert.equal(result.selectedKind, "anon");
});

test("client bundle validation prefers the publishable key and requires it to be inlined", () => {
  const temp = makeTempRoot();
  const chunkDir = path.join(temp, "dist/client/_next/static/chunks");
  fs.mkdirSync(chunkDir, { recursive: true });
  fs.writeFileSync(
    path.join(chunkDir, "supabase-publishable.js"),
    'createClient("https://example.supabase.co", process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "anon-fallback")'
  );
  assert.throws(
    () =>
      assertVinextClientSupabaseBundle({
        root: temp,
        env: {
          NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
          NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test_key",
          NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-fallback",
        },
      }),
    /still reads process.env for the selected public Supabase key/
  );

  fs.writeFileSync(
    path.join(chunkDir, "supabase-publishable.js"),
    'createClient("https://example.supabase.co","sb_publishable_test_key")'
  );
  const result = assertVinextClientSupabaseBundle({
    root: temp,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test_key",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-fallback",
    },
  });
  assert.equal(result.selectedKind, "publishable");
  assert.equal(result.inlinedSelectedKeyCount, 1);
});

test("client bundle validation fails when the selected public key value is missing", () => {
  const temp = makeTempRoot();
  const chunkDir = path.join(temp, "dist/client/_next/static/chunks");
  fs.mkdirSync(chunkDir, { recursive: true });
  fs.writeFileSync(
    path.join(chunkDir, "supabase-host-only.js"),
    'createClient("https://example.supabase.co","other-public-token")'
  );
  assert.throws(
    () =>
      assertVinextClientSupabaseBundle({
        root: temp,
        env: {
          NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
          NEXT_PUBLIC_SUPABASE_ANON_KEY: "public-test-key",
        },
      }),
    /does not contain the selected public Supabase key/
  );
});
