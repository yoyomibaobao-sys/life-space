import { build } from "esbuild";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = path.join(root, "mobile-offline-src");
const outputRoot = path.join(root, "mobile-shell");
const defaultServerUrl = "https://life-space.uk";

function resolveCloudOrigin() {
  const url = new URL(process.env.CAPACITOR_SERVER_URL || defaultServerUrl);
  if (url.protocol !== "https:") {
    throw new Error("CAPACITOR_SERVER_URL must use HTTPS.");
  }
  return url.origin;
}

const cloudOrigin = resolveCloudOrigin();
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const supabasePublishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
const turnstileSiteKey =
  process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() || "";

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
    "process.env.NODE_ENV": JSON.stringify("production"),
    "process.env.NEXT_PUBLIC_SUPABASE_URL": JSON.stringify(supabaseUrl),
    "process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY":
      JSON.stringify(supabasePublishableKey),
    "process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY": "undefined",
    "process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY":
      JSON.stringify(turnstileSiteKey),
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

const [template, css, localParityCss, bridgeTemplate] = await Promise.all([
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
await Promise.all([
  // The same self-contained shell is the normal Android entry point and the
  // fallback document. Android therefore starts with or without a network.
  fs.writeFile(path.join(outputRoot, "index.html"), offlineHtml),
  fs.writeFile(path.join(outputRoot, "offline.html"), offlineHtml),
  fs.writeFile(path.join(outputRoot, "legacy-local-bridge.html"), bridgeHtml),
]);

console.log(`Built Android local app shell; cloud data origin is ${cloudOrigin}`);