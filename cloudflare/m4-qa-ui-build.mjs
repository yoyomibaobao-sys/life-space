/* QA-only client asset builder. Run after npm run build:vinext. Never writes into dist/client. */
import { build } from "esbuild";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { M4_QA_CLIENT } from "./m4-qa-controlled-page.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const cfg = JSON.parse(readFileSync(path.join(root, "wrangler.m4-qa.jsonc"), "utf8"));
const vars = cfg.vars || {};
const QA_ORIGIN = "https://lifespace-site-media-qa-20261028.lifespace-assets-isolated-lab.workers.dev";
const OWNER = "f99fd44d-820f-41f2-ad4e-85feb7c990a6";
const MEDIA = "ed4d0534-f686-42ff-82a6-1ab10e510063";

if (cfg.name !== "lifespace-site-media-qa-20261028" ||
    cfg.main !== "./dist/server/index.js" ||
    cfg.no_bundle !== true ||
    cfg.assets?.directory !== "./dist/qa-client" ||
    vars.R2_BUSINESS_MEDIA_MODE !== "isolated" ||
    vars.M4_QA_CONTROL_UI_ENABLED !== "true" ||
    vars.NEXT_PUBLIC_SITE_URL !== QA_ORIGIN ||
    vars.NEXT_PUBLIC_SUPABASE_URL !== "https://mablwxlipcgbmbnfdbkc.supabase.co" ||
    !String(vars.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "").startsWith("sb_publishable_") ||
    vars.SUPABASE_SERVICE_ROLE_KEY !== undefined ||
    vars.R2_MEDIA_SERVICE_AUTH_SECRET !== undefined ||
    !cfg.services?.some((item) => item.binding === "R2_BUSINESS_MEDIA_SERVICE" && item.service === "lifespace-business-media-qa-20261028") ||
    !cfg.ratelimits?.some((item) => item.name === "R2_MEDIA_MIRROR_RATE_LIMITER")) {
  throw Error("Unexpected QA configuration; refuse to bundle");
}

const serverWorkerPath = path.join(root, "dist/server/index.js");
const productionAssets = path.join(root, "dist/client");
const qaAssets = path.join(root, "dist/qa-client");
const assetRelativePath = M4_QA_CLIENT.replace(/^\/+/, "");
const productionClientAsset = path.join(productionAssets, assetRelativePath);
if (!existsSync(serverWorkerPath) || !existsSync(productionAssets)) {
  throw Error("Run npm run build:vinext before the M4 QA asset build");
}
if (existsSync(productionClientAsset)) {
  throw Error("M4 QA client asset already exists in production assets; refusing to continue");
}
const serverWorker = readFileSync(serverWorkerPath, "utf8");
if (!serverWorker.includes("/__qa/m4-controlled-mirror") ||
    !serverWorker.includes("/__internal/r2/business-media/mirror") ||
    serverWorker.includes(OWNER) || serverWorker.includes(MEDIA)) {
  throw Error("Unified Worker route missing or QA client identifiers leaked into server Worker");
}

const result = await build({
  entryPoints: [path.join(here, "m4-qa-controlled-client.ts")],
  bundle: true, write: false, platform: "browser", format: "iife", target: "es2022", minify: true,
  tsconfig: path.join(root, "tsconfig.json"),
  define: {
    "process.env.NEXT_PUBLIC_SUPABASE_URL": JSON.stringify(vars.NEXT_PUBLIC_SUPABASE_URL),
    "process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(vars.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY),
    "process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY": JSON.stringify(vars.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  },
  logLevel: "silent",
});
if (!result.outputFiles || result.outputFiles.length !== 1) throw Error("Expected exactly one QA bundle");
const script = result.outputFiles[0].text;
const clientSource = readFileSync(path.join(here, "m4-qa-controlled-client.ts"), "utf8");
if (!script.includes(OWNER) ||
    !script.includes(MEDIA) ||
    !script.includes("/__internal/r2/business-media/mirror") ||
    script.includes("SUPABASE_SERVICE_ROLE_KEY") ||
    !clientSource.includes('businessType: "media"') ||
    !clientSource.includes("businessId: MEDIA") ||
    !clientSource.includes("supabase.auth.getUser(accessToken)") ||
    /(?:localStorage|sessionStorage)\./.test(clientSource) ||
    /refresh_token|SUPABASE_SERVICE_ROLE_KEY|document\.cookie|console\.log\(/.test(clientSource)) {
  throw Error("QA bundle security contract mismatch");
}

rmSync(qaAssets, { recursive: true, force: true });
cpSync(productionAssets, qaAssets, { recursive: true });
const outputPath = path.join(qaAssets, assetRelativePath);
mkdirSync(path.dirname(outputPath), { recursive: true });
writeFileSync(outputPath, script, "utf8");
if (!existsSync(outputPath) || existsSync(productionClientAsset)) {
  throw Error("QA asset isolation check failed");
}
const digest = createHash("sha256").update(script).digest("hex");
console.log("QA-only static client asset generated at dist/qa-client/" + assetRelativePath +
  ". Bytes=" + Buffer.byteLength(script) + " SHA-256=" + digest +
  ". Production dist/client was not modified.");
