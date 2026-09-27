import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  PUBLIC_SUPABASE_URL_KEY,
  assertPublicSupabaseBuildEnv,
  publicSupabaseUrlHost,
  selectedPublicSupabaseKey,
} from "./vinext-public-env.mjs";

function listClientSupabaseChunks(root) {
  const dir = path.join(root, "dist/client/_next/static/chunks");
  if (!fs.existsSync(dir)) {
    throw new Error(
      "vinext client bundle is missing dist/client/_next/static/chunks. Refusing to treat this as a releasable build."
    );
  }
  return fs
    .readdirSync(dir)
    .filter((name) => /^supabase-[^./]+\.js$/.test(name))
    .map((name) => path.join(dir, name));
}

export function assertVinextClientSupabaseBundle({
  root,
  env = process.env,
} = {}) {
  assertPublicSupabaseBuildEnv(env);
  const host = publicSupabaseUrlHost(env);
  if (!host) {
    throw new Error(
      "vinext client bundle check could not parse NEXT_PUBLIC_SUPABASE_URL as a URL."
    );
  }

  const files = listClientSupabaseChunks(root);
  if (files.length === 0) {
    throw new Error(
      "vinext client bundle is missing supabase-*.js. Refusing to treat this as a releasable build."
    );
  }

  const selected = selectedPublicSupabaseKey(env);
  if (!selected) {
    throw new Error(
      "vinext client bundle check could not select a public Supabase key."
    );
  }

  let inlinedHostCount = 0;
  let inlinedSelectedKeyCount = 0;
  for (const filePath of files) {
    const source = fs.readFileSync(filePath, "utf8");
    if (source.includes(PUBLIC_SUPABASE_URL_KEY)) {
      throw new Error(
        "vinext client supabase chunk still contains NEXT_PUBLIC_SUPABASE_URL. The browser bundle was not inlined and must not be uploaded."
      );
    }
    if (source.includes(`process.env.${PUBLIC_SUPABASE_URL_KEY}`)) {
      throw new Error(
        "vinext client supabase chunk still reads process.env.NEXT_PUBLIC_SUPABASE_URL. The browser bundle was not inlined and must not be uploaded."
      );
    }
    if (source.includes(`process.env.${selected.envName}`)) {
      throw new Error(
        "vinext client supabase chunk still reads process.env for the selected public Supabase key. The browser bundle was not inlined and must not be uploaded."
      );
    }
    if (source.includes(host)) inlinedHostCount += 1;
    if (source.includes(selected.value)) inlinedSelectedKeyCount += 1;
  }

  if (inlinedHostCount === 0) {
    throw new Error(
      "vinext client supabase chunk does not contain the build-time Supabase host. The browser bundle was not inlined and must not be uploaded."
    );
  }
  if (inlinedSelectedKeyCount === 0) {
    throw new Error(
      "vinext client supabase chunk does not contain the selected public Supabase key. The browser bundle was not inlined and must not be uploaded."
    );
  }

  return {
    chunkCount: files.length,
    inlinedHostCount,
    inlinedSelectedKeyCount,
    selectedKind: selected.kind,
  };
}

const invokedDirectly =
  Boolean(process.argv[1]) &&
  path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1]);

if (invokedDirectly) {
  try {
    const result = assertVinextClientSupabaseBundle({
      root: process.cwd(),
      env: process.env,
    });
    console.log(
      `vinext client supabase bundle ok: ${result.chunkCount} chunk(s), host inlined, selected public key=${result.selectedKind}.`
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
