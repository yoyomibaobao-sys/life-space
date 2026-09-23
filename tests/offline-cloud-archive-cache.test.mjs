import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { IDBFactory } from "fake-indexeddb";

async function moduleFrom(entry) {
  const result = await build({
    entryPoints: [entry],
    bundle: true,
    write: false,
    platform: "node",
    format: "esm",
  });
  return import(
    `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString("base64")}`
  );
}

const cache = await moduleFrom("lib/offline-cloud-archive-cache.ts");

function resetDb() {
  globalThis.indexedDB = new IDBFactory();
}

test("offline cloud cache keeps active summaries and excludes ended projects", async () => {
  resetDb();
  const thumbnail = new Blob([Uint8Array.from([1, 2, 3])], {
    type: "image/jpeg",
  });

  await cache.replaceOfflineCloudArchiveCache("owner-a", [
    {
      id: "active-project",
      title: "阳台番茄",
      category: "plant",
      status: "active",
      updated_at: "2026-09-23T09:00:00.000Z",
      record_count: 12,
      cover_thumbnail: thumbnail,
    },
    {
      id: "ended-project",
      title: "已结束项目",
      category: "system",
      status: "ended",
      updated_at: "2026-09-23T10:00:00.000Z",
      cover_thumbnail: thumbnail,
    },
  ]);

  const rows = await cache.listOfflineCloudArchiveCache("owner-a");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, "active-project");
  assert.equal(rows[0].record_count, 12);
  assert.equal(rows[0].cover_thumbnail.size, thumbnail.size);
  assert.equal(rows[0].status, "active");
});

test("metadata refresh preserves a prior thumbnail and ending a project removes it", async () => {
  resetDb();
  const thumbnail = new Blob([Uint8Array.from([4, 5, 6])], {
    type: "image/jpeg",
  });

  await cache.replaceOfflineCloudArchiveCache("owner-a", [
    {
      id: "project-a",
      title: "第一版",
      status: "active",
      cover_thumbnail: thumbnail,
    },
  ]);
  await cache.replaceOfflineCloudArchiveCache("owner-a", [
    {
      id: "project-a",
      title: "更新后的标题",
      status: "active",
      cover_thumbnail: undefined,
    },
  ]);

  const refreshed = await cache.listOfflineCloudArchiveCache("owner-a");
  assert.equal(refreshed[0].title, "更新后的标题");
  assert.equal(refreshed[0].cover_thumbnail.size, thumbnail.size);

  await cache.replaceOfflineCloudArchiveCache("owner-a", [
    { id: "project-a", title: "结束", status: "ended" },
  ]);
  assert.deepEqual(await cache.listOfflineCloudArchiveCache("owner-a"), []);
});

test("cache is owner-scoped, size-bounded, and clearable", async () => {
  resetDb();
  const oversized = new Blob([
    new Uint8Array(cache.OFFLINE_CLOUD_CACHE_MAX_THUMBNAIL_BYTES + 1),
  ]);
  const small = new Blob([Uint8Array.from([1])]);
  const rows = Array.from(
    { length: cache.OFFLINE_CLOUD_CACHE_MAX_ARCHIVES + 5 },
    (_, index) => ({
      id: `project-${index}`,
      title: `Project ${index}`,
      status: "active",
      updated_at: new Date(1_700_000_000_000 + index * 1000).toISOString(),
      cover_thumbnail:
        index === cache.OFFLINE_CLOUD_CACHE_MAX_ARCHIVES + 4
          ? oversized
          : small,
    }),
  );

  await cache.replaceOfflineCloudArchiveCache("owner-a", rows);
  await cache.replaceOfflineCloudArchiveCache("owner-b", [
    { id: "private-b", title: "B", status: "active" },
  ]);

  const ownerA = await cache.listOfflineCloudArchiveCache("owner-a");
  assert.equal(ownerA.length, cache.OFFLINE_CLOUD_CACHE_MAX_ARCHIVES);
  assert.equal(ownerA.find((row) => row.id === "project-0"), undefined);
  assert.equal(ownerA[0].cover_thumbnail, null);
  assert.equal(
    ownerA.filter((row) => row.cover_thumbnail).length,
    cache.OFFLINE_CLOUD_CACHE_MAX_THUMBNAILS - 1,
  );
  assert.deepEqual(
    (await cache.listOfflineCloudArchiveCache("owner-b")).map((row) => row.id),
    ["private-b"],
  );

  await cache.clearOfflineCloudArchiveCache("owner-a");
  assert.deepEqual(await cache.listOfflineCloudArchiveCache("owner-a"), []);
  assert.equal((await cache.listOfflineCloudArchiveCache("owner-b")).length, 1);
});
