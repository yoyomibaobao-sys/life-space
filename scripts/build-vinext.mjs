import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertPublicSupabaseBuildEnv,
  inspectPublicSupabaseEnv,
  loadPublicSupabaseEnv,
} from "./vinext-public-env.mjs";
import { assertVinextClientSupabaseBundle } from "./verify-vinext-client-supabase-bundle.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const extraEnvFiles = [];
const parentEnvLocal = path.resolve(root, "../../.env.local");
if (parentEnvLocal !== path.join(root, ".env.local")) {
  extraEnvFiles.push(parentEnvLocal);
}

loadPublicSupabaseEnv({ root, env: process.env, extraEnvFiles });
assertPublicSupabaseBuildEnv(process.env);

const state = inspectPublicSupabaseEnv(process.env);
console.log(
  `vinext public env ready: url=${state.hasUrl} publishable=${state.hasPublishable} anon=${state.hasAnon} selected=${state.selectedKind}`
);

const vinextCli = path.join(root, "node_modules/vinext/dist/cli.js");
const build = spawnSync(process.execPath, [vinextCli, "build"], {
  cwd: root,
  env: process.env,
  stdio: "inherit",
});

if (build.status !== 0) {
  process.exit(build.status ?? 1);
}

const bundle = assertVinextClientSupabaseBundle({
  root,
  env: process.env,
});
console.log(
  `vinext client supabase bundle ok: ${bundle.chunkCount} chunk(s), host inlined, selected public key=${bundle.selectedKind}.`
);
