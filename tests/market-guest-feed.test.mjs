import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { build } from "esbuild";

const root = path.resolve(import.meta.dirname, "..");

test("public market feed loads for a signed-out visitor even when account lookup stalls", async () => {
  const bundle = await build({
    entryPoints: [path.join(root, "lib/market-feed.ts")],
    absWorkingDir: root,
    bundle: true,
    platform: "node",
    format: "esm",
    write: false,
    alias: { "@": root },
    plugins: [{
      name: "isolated-market-dependencies",
      setup(plugin) {
        plugin.onResolve({ filter: /\/lib\/(supabase|media-urls|domain-types)$/ }, (args) => ({ path: args.path, namespace: "market-test" }));
        plugin.onLoad({ filter: /.*/, namespace: "market-test" }, ({ path: modulePath }) => ({
          contents: modulePath.endsWith("/supabase")
            ? "export const supabase = globalThis.__marketTestSupabase;"
            : modulePath.endsWith("/media-urls")
              ? "export const resolveMediaDisplayPairs = async (_client, rows) => rows.map(() => ({ display_url: null, display_thumb_url: null }));"
              : "export const PUBLIC_PROFILE_SELECT = 'id, username, avatar_url, country_name, region_name, city_name';",
          loader: "js",
        }));
      },
    }],
  });
  const queried = [];
  function query(table) {
    const request = {
      select() { return request; },
      eq() { return request; },
      order() { return request; },
      limit() { return request; },
      in() { return request; },
      then(resolve, reject) {
        queried.push(table);
        return Promise.resolve({ data: table === "market_posts" ? [{ id: "post-1", user_id: "owner-1", archive_id: null }] : [{ id: "owner-1" }], error: null }).then(resolve, reject);
      },
    };
    return request;
  }
  globalThis.__marketTestSupabase = {
    auth: { getUser: () => new Promise(() => {}) },
    from: query,
  };
  try {
    const module = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
    const feed = await module.fetchMarketFeed();
    assert.deepEqual(feed.items.map((post) => post.id), ["post-1"]);
    assert.equal(feed.error, null);
    assert.equal(feed.currentUserId, null);
    assert.deepEqual(queried, ["market_posts", "public_profiles"]);
  } finally {
    delete globalThis.__marketTestSupabase;
  }
});
