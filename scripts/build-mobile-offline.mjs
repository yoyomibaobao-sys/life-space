import { build } from "esbuild";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = path.join(root, "mobile-offline-src");
const outputRoot = process.env.ANDROID_SHELL_OUTPUT
  ? path.resolve(process.env.ANDROID_SHELL_OUTPUT)
  : path.join(root, "mobile-shell");
const defaultServerUrl = "https://life-space.uk";
const singleRuntimeAcceptance = process.env.ANDROID_SINGLE_RUNTIME === "1";

function resolveCloudOrigin() {
  const url = new URL(process.env.CAPACITOR_SERVER_URL || defaultServerUrl);
  if (url.protocol !== "https:") {
    throw new Error("CAPACITOR_SERVER_URL must use HTTPS.");
  }
  return url.origin;
}

const cloudOrigin = resolveCloudOrigin();
const qaBuild = process.env.ANDROID_REQUIRE_QA_SUPABASE === "1";
const isolatedQaSupabase = "https://mablwxlipcgbmbnfdbkc.supabase.co";
const productionSupabase = "https://eidltoikfpnrzxruvawf.supabase.co";
// A QA build reads only the explicit QA variables. A production value already
// present in the process or .env.local must not replace them.
const supabaseUrl = (qaBuild
  ? process.env.ANDROID_QA_SUPABASE_URL
  : process.env.NEXT_PUBLIC_SUPABASE_URL)?.trim();
// QA must configure a matching export API; never send its token to production.
const exportOrigin = process.env.ANDROID_CLOUD_EXPORT_ORIGIN?.trim() ||
  (supabaseUrl?.replace(/\/$/, "") === productionSupabase ? defaultServerUrl : "");
if (qaBuild) {
  if (supabaseUrl?.replace(/\/$/, "") !== isolatedQaSupabase) {
    throw new Error("QA Android build requires the isolated Supabase project.");
  }
  if (exportOrigin === defaultServerUrl) {
    throw new Error("qa_export_to_production_rejected");
  }
}
if (exportOrigin && (new URL(exportOrigin).origin !== exportOrigin || !exportOrigin.startsWith("https://"))) {
  throw new Error("ANDROID_CLOUD_EXPORT_ORIGIN must be an HTTPS origin without a path.");
}
const supabasePublishableKey = (qaBuild
  ? process.env.ANDROID_QA_SUPABASE_PUBLISHABLE_KEY
  : process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)?.trim();
const turnstileSiteKey =
  process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() || "";
const alipayPaymentQrUrl = process.env.NEXT_PUBLIC_ALIPAY_PAYMENT_QR_URL?.trim() || "";
const alipayPayeeName = process.env.NEXT_PUBLIC_ALIPAY_PAYEE_NAME?.trim() || "";

if (singleRuntimeAcceptance && !turnstileSiteKey) {
  throw new Error(
    "NEXT_PUBLIC_TURNSTILE_SITE_KEY is required for ANDROID_SINGLE_RUNTIME acceptance builds.",
  );
}

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error("Android local shell requires public Supabase configuration.");
}

const buildResult = await build({
  entryPoints: [path.join(sourceRoot, "main.tsx")],
  bundle: true,
  format: "iife",
  platform: "browser",
  target: ["chrome120"],
  minify: true,
  charset: "utf8",
  write: false,
  outfile: path.join(outputRoot, "offline.js"),
  jsx: "automatic",
  define: {
    __LIFESPACE_CLOUD_ORIGIN__: JSON.stringify(cloudOrigin),
    "process.env.NEXT_PUBLIC_CLOUD_EXPORT_ORIGIN": JSON.stringify(exportOrigin),
    "process.env.NODE_ENV": JSON.stringify("production"),
    "process.env.NEXT_PUBLIC_SUPABASE_URL": JSON.stringify(supabaseUrl),
    "process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY":
      JSON.stringify(supabasePublishableKey),
    "process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY": "undefined",
    "process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY":
      JSON.stringify(turnstileSiteKey),
    "process.env.NEXT_PUBLIC_ALIPAY_PAYMENT_QR_URL": JSON.stringify(alipayPaymentQrUrl),
    "process.env.NEXT_PUBLIC_ALIPAY_PAYEE_NAME": JSON.stringify(alipayPayeeName),
    // Do not switch bundled Android images to relative /api URLs: the APK's
    // local origin has no API server. Native cloud transport needs separate QA.
    "process.env.NEXT_PUBLIC_TRIAL_MEDIA_PROXY_ENABLED": JSON.stringify("false"),
    // A few shared UI components pull in Next client helpers. In the normal
    // Next build these flags are replaced by the compiler. The standalone
    // Android shell is bundled by esbuild, so leaving them behind causes
    // "process is not defined" before React can render and results in a blank
    // screen. Keep their browser defaults explicit in the APK bundle.
    "process.env.__NEXT_I18N_SUPPORT": "false",
    "process.env.__NEXT_LINK_NO_TOUCH_START": "false",
    "process.env.__NEXT_MANUAL_CLIENT_BASE_PATH": "false",
    "process.env.__NEXT_MANUAL_TRAILING_SLASH": "false",
    "process.env.__NEXT_ROUTER_BASEPATH": JSON.stringify(""),
    "process.env.__NEXT_TRAILING_SLASH": "false",
    "process.env.__NEXT_DEV_SERVER": "false",
    "process.env.__NEXT_EXPERIMENTAL_AUTH_INTERRUPTS": "false",
    "process.env.__NEXT_CACHE_COMPONENTS": "false",
    "process.env.NEXT_DEPLOYMENT_ID": "undefined",
    "process.env.NEXT_RUNTIME": "undefined",
    "process.env.NEXT_SUPPORTS_IMMUTABLE_ASSETS": "false",
    "process.env.__NEXT_IMAGE_OPTS": JSON.stringify({
      deviceSizes: [640, 750, 828, 1080, 1200, 1920],
      imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
      path: "/_next/image",
      loader: "default",
      unoptimized: true,
    }),
  },
  plugins: [
    {
      name: "lifespace-path-alias",
      setup(pluginBuild) {
        pluginBuild.onResolve({ filter: /^@\// }, (args) =>
          pluginBuild.resolve(`./${args.path.slice(2)}`, {
            resolveDir: root,
            kind: args.kind,
          }),
        );
      },
    },
  ],
});

const javascript = buildResult.outputFiles.find((file) => file.path.endsWith(".js"));
if (!javascript) throw new Error("Offline bundle did not emit JavaScript.");
const bundledComponentCss =
  buildResult.outputFiles.find((file) => file.path.endsWith(".css"))?.text || "";

const [indexTemplate, template, css, localParityCss, bridgeTemplate] = await Promise.all([
  fs.readFile(path.join(sourceRoot, "index.template.html"), "utf8"),
  fs.readFile(path.join(sourceRoot, "offline.template.html"), "utf8"),
  fs.readFile(path.join(sourceRoot, "offline.css"), "utf8"),
  fs.readFile(path.join(sourceRoot, "local-parity.css"), "utf8"),
  fs.readFile(path.join(sourceRoot, "legacy-local-bridge.template.html"), "utf8"),
]);

const offlineHtml = template
  .replace(
    "__LIFESPACE_OFFLINE_CSS__",
    () => `${css}\n${localParityCss}\n${bundledComponentCss}`,
  )
  .replace(
    "__LIFESPACE_OFFLINE_JS__",
    () => javascript.text.replaceAll("</script", "<\\/script"),
  );
const bridgeHtml = bridgeTemplate.replace(
  "__LIFESPACE_CLOUD_ORIGIN_JSON__",
  () => JSON.stringify(cloudOrigin),
);

await fs.mkdir(outputRoot, { recursive: true });
await fs.mkdir(path.join(outputRoot, "brand"), { recursive: true });
await fs.copyFile(path.join(root, "public/brand/youshi-space-icon-192.png"), path.join(outputRoot, "brand/youshi-space-icon-192.png"));
if (singleRuntimeAcceptance) {
  const bundledIndex = offlineHtml.replace(
    "<html lang=\"zh-CN\">",
    "<html lang=\"zh-CN\" data-android-runtime=\"bundled\">",
  );
  await fs.writeFile(path.join(outputRoot, "index.html"), bundledIndex);
  await fs.writeFile(path.join(outputRoot, "legacy-local-bridge.html"), bridgeHtml);
  await fs.rm(path.join(outputRoot, "offline.html"), { force: true });
  console.log(
    `Built Android single-runtime acceptance shell; document origin host is ${cloudOrigin}`,
  );
} else {
  await Promise.all([
    // Online startup uses Capacitor server.url. This placeholder is only the
    // bundled default document; the local-first shell lives in offline.html.
    fs.writeFile(path.join(outputRoot, "index.html"), indexTemplate),
    fs.writeFile(path.join(outputRoot, "offline.html"), offlineHtml),
    fs.writeFile(path.join(outputRoot, "legacy-local-bridge.html"), bridgeHtml),
  ]);
  console.log(`Built Android local app shell; cloud data origin is ${cloudOrigin}`);
}
