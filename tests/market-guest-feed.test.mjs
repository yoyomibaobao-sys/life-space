import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { build } from "esbuild";
import { PGlite } from "@electric-sql/pglite";

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
              ? "export const getMediaStoragePathFromUrl = () => null; export const resolveMediaDisplayPairs = async (_client, rows) => rows.map(() => ({ display_url: null, display_thumb_url: null }));"
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

test("anonymous and signed-in market feeds execute real RLS queries and propagate profile/archive/media failures", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create table public.market_posts (id text primary key, user_id text, archive_id text,
        status text, created_at timestamptz, cover_image_path text, cover_image_url text, cover_thumb_path text, cover_thumb_url text);
      create table public.public_profiles (id text primary key, username text, avatar_url text,
        country_name text, region_name text, city_name text);
      create table public.archives (id text primary key, title text, system_name text, species_name_snapshot text);
      insert into public.market_posts values
        ('public-post', 'owner', 'archive-1', 'active', now(), null, null, null, null),
        ('hidden-post', 'owner', 'archive-1', 'draft', now(), null, null, null, null);
      insert into public.public_profiles values ('owner','作者',null,null,null,null);
      insert into public.archives values ('archive-1','公开项目',null,null);
      alter table public.market_posts enable row level security;
      create policy active_posts on public.market_posts for select to anon,authenticated using (status = 'active');
      grant select on public.market_posts, public.public_profiles, public.archives to anon, authenticated;
      set role anon;
    `);
    let sessionUser = null;
    let mediaError = null;
    const client = {
      auth: { getUser: async () => ({ data: { user: sessionUser } }) },
      from(table) {
        const state = { where: [], values: [], limit: null, order: null, columns: "*" };
        const q = {
          select(columns) { state.columns = columns; return q; },
          eq(column, value) { state.values.push(value); state.where.push(`${column} = $${state.values.length}`); return q; },
          in(column, values) { state.values.push(values); state.where.push(`${column} = any($${state.values.length})`); return q; },
          order(column) { state.order = column; return q; },
          limit(value) { state.limit = value; return q; },
          then(resolve, reject) {
            const sql = `select ${state.columns} from public.${table}`+
              (state.where.length ? ` where ${state.where.join(" and ")}` : "")+
              (state.order ? ` order by ${state.order} desc` : "")+
              (state.limit ? ` limit ${state.limit}` : "");
            return db.query(sql, state.values)
              .then(({ rows }) => ({ data: rows, error: null }), (error) => ({ data: null, error }))
              .then(resolve, reject);
          },
        };
        return q;
      },
    };
    const bundle = await build({
      entryPoints: [path.join(root, "lib/market-feed.ts")], absWorkingDir: root,
      bundle: true, platform: "node", format: "esm", write: false, alias: { "@": root },
      plugins: [{ name: "database-and-media-adapter", setup(plugin) {
        plugin.onResolve({ filter: /\/lib\/(supabase|media-urls|domain-types)$/ }, ({ path: name }) => ({ path: name, namespace: "market-db" }));
        plugin.onLoad({ filter: /.*/, namespace: "market-db" }, ({ path: name }) => ({
          contents: name.endsWith("/supabase")
            ? "export const supabase = globalThis.__marketDbClient;"
            : name.endsWith("/media-urls")
              ? "export const getMediaStoragePathFromUrl = () => null; export const resolveMediaDisplayPairs = async () => { if (globalThis.__marketDbMediaError) throw globalThis.__marketDbMediaError; return [{ display_url: null, display_thumb_url: null }]; };"
              : "export const PUBLIC_PROFILE_SELECT = 'id, username, avatar_url, country_name, region_name, city_name';",
          loader: "js",
        }));
      } }],
    });
    globalThis.__marketDbClient = client;
    const { fetchMarketFeed } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
    const guest = await fetchMarketFeed();
    assert.equal(guest.error, null);
    assert.deepEqual(guest.items.map((row) => row.id), ["public-post"]);
    assert.equal(guest.currentUserId, null);
    assert.equal(guest.profiles.get("owner").username, "作者");
    assert.equal(guest.archives.get("archive-1").title, "公开项目");

    await db.exec("reset role; revoke select on public.public_profiles from anon; set role anon");
    const profileFailure = await fetchMarketFeed();
    assert.equal(profileFailure.items.length, 1);
    assert.match(String(profileFailure.error), /permission denied/);
    await db.exec("reset role; grant select on public.public_profiles to anon; set role anon");

    await db.exec("reset role; revoke select on public.archives from anon; set role anon");
    const archiveFailure = await fetchMarketFeed();
    assert.equal(archiveFailure.items.length, 1);
    assert.match(String(archiveFailure.error), /permission denied/);
    await db.exec("reset role; grant select on public.archives to anon; set role anon");

    globalThis.__marketDbMediaError = new Error("signed media unavailable");
    mediaError = (await fetchMarketFeed()).error;
    assert.match(String(mediaError), /signed media unavailable/);
    delete globalThis.__marketDbMediaError;

    await db.exec("reset role; update public.market_posts set cover_image_path = 'owner/post.jpg' where id = 'public-post'; set role anon");
    const missingDisplayUrl = await fetchMarketFeed();
    assert.match(String(missingDisplayUrl.error), /market_media_display_url_failed/);
    await db.exec("reset role; update public.market_posts set cover_image_path = null where id = 'public-post'; set role anon");

    await db.exec("reset role; set role authenticated");
    sessionUser = { id: "viewer" };
    const signedIn = await fetchMarketFeed();
    assert.equal(signedIn.error, null);
    assert.equal(signedIn.currentUserId, "viewer");
    assert.deepEqual(signedIn.items.map((row) => row.id), ["public-post"]);
  } finally {
    delete globalThis.__marketDbClient;
    delete globalThis.__marketDbMediaError;
    await db.close();
  }
});
