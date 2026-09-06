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
const buildResult = await build({
  entryPoints: [path.join(sourceRoot, "main.tsx")],
  bundle: true,
  format: "iife",
  platform: "browser",
  target: ["chrome120"],
  minify: true,
  write: false,
  outfile: path.join(outputRoot, "offline.js"),
  jsx: "automatic",
  define: {
    __LIFESPACE_CLOUD_ORIGIN__: JSON.stringify(cloudOrigin),
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

const [template, css, bridgeTemplate] = await Promise.all([
  fs.readFile(path.join(sourceRoot, "offline.template.html"), "utf8"),
  fs.readFile(path.join(sourceRoot, "offline.css"), "utf8"),
  fs.readFile(path.join(sourceRoot, "legacy-local-bridge.template.html"), "utf8"),
]);

const offlineHtml = template
  .replace("__LIFESPACE_OFFLINE_CSS__", () => css)
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
  fs.writeFile(path.join(outputRoot, "offline.html"), offlineHtml),
  fs.writeFile(path.join(outputRoot, "legacy-local-bridge.html"), bridgeHtml),
]);

console.log(`Built Android offline shell for ${cloudOrigin}`);
