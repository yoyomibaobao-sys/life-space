import fs from "node:fs";
import path from "node:path";

export const PUBLIC_SUPABASE_URL_KEY = "NEXT_PUBLIC_SUPABASE_URL";
export const PUBLIC_SUPABASE_PUBLISHABLE_KEY = "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY";
export const PUBLIC_SUPABASE_ANON_KEY = "NEXT_PUBLIC_SUPABASE_ANON_KEY";
const SERVICE_ROLE_KEY = "SUPABASE_SERVICE_ROLE_KEY";

const PUBLIC_KEYS = [
  PUBLIC_SUPABASE_URL_KEY,
  PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  PUBLIC_SUPABASE_ANON_KEY,
];

function stripQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

export function parsePublicSupabaseEnvText(text) {
  const parsed = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (!PUBLIC_KEYS.includes(key)) continue;
    parsed[key] = stripQuotes(line.slice(eq + 1).trim());
  }
  return parsed;
}

function dotenvFilesForBuild(root) {
  return [
    path.join(root, ".env.production.local"),
    path.join(root, ".env.local"),
    path.join(root, ".env.production"),
    path.join(root, ".env"),
  ];
}

function applyPublicKeys(target, source) {
  for (const key of PUBLIC_KEYS) {
    if (target[key]?.trim()) continue;
    const value = source[key]?.trim();
    if (value) target[key] = value;
  }
}

function readPublicKeysFromFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  return parsePublicSupabaseEnvText(fs.readFileSync(filePath, "utf8"));
}

export function loadPublicSupabaseEnv({
  root,
  env = process.env,
  extraEnvFiles = [],
} = {}) {
  const nextEnv = env;
  for (const filePath of dotenvFilesForBuild(root)) {
    applyPublicKeys(nextEnv, readPublicKeysFromFile(filePath));
  }
  for (const filePath of extraEnvFiles) {
    applyPublicKeys(nextEnv, readPublicKeysFromFile(filePath));
  }
  return nextEnv;
}

export function inspectPublicSupabaseEnv(env = process.env) {
  const url = env[PUBLIC_SUPABASE_URL_KEY]?.trim() || "";
  const publishable = env[PUBLIC_SUPABASE_PUBLISHABLE_KEY]?.trim() || "";
  const anon = env[PUBLIC_SUPABASE_ANON_KEY]?.trim() || "";
  const selectedKind = publishable ? "publishable" : anon ? "anon" : null;
  return {
    hasUrl: url.length > 0,
    hasPublishable: publishable.length > 0,
    hasAnon: anon.length > 0,
    hasServiceRole: Boolean(env[SERVICE_ROLE_KEY]?.trim()),
    hasPublicKey: publishable.length > 0 || anon.length > 0,
    selectedKind,
  };
}

export function selectedPublicSupabaseKey(env = process.env) {
  const publishable = env[PUBLIC_SUPABASE_PUBLISHABLE_KEY]?.trim() || "";
  if (publishable) {
    return {
      kind: "publishable",
      envName: PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      value: publishable,
    };
  }
  const anon = env[PUBLIC_SUPABASE_ANON_KEY]?.trim() || "";
  if (anon) {
    return {
      kind: "anon",
      envName: PUBLIC_SUPABASE_ANON_KEY,
      value: anon,
    };
  }
  return null;
}

export function publicSupabaseUrlHost(env = process.env) {
  const url = env[PUBLIC_SUPABASE_URL_KEY]?.trim();
  if (!url) return "";
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

export function assertPublicSupabaseBuildEnv(env = process.env) {
  const state = inspectPublicSupabaseEnv(env);
  if (state.hasUrl && state.hasPublicKey) return state;
  const missing = [];
  if (!state.hasUrl) missing.push(PUBLIC_SUPABASE_URL_KEY);
  if (!state.hasPublicKey) {
    missing.push(
      `${PUBLIC_SUPABASE_PUBLISHABLE_KEY} or ${PUBLIC_SUPABASE_ANON_KEY}`
    );
  }
  throw new Error(
    [
      "vinext client build requires public Supabase env in the build process.",
      `Missing: ${missing.join("; ")}.`,
      "Worker runtime vars cannot inline the browser supabase chunk.",
      `${SERVICE_ROLE_KEY} is not a valid public-key fallback.`,
      "Set the NEXT_PUBLIC_* values in the build job env or .env.local, then rerun npm run build:vinext.",
    ].join(" ")
  );
}
