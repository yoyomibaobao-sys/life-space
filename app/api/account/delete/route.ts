import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getSupabaseServer } from "@/lib/supabaseServer";

export const runtime = "nodejs";

const DB_IN_BATCH_SIZE = 200;
const STORAGE_BATCH_SIZE = 100;
const STORAGE_LIST_LIMIT = 1000;

type AccountDeletionBody = {
  confirm?: boolean;
};

type StoragePathSets = {
  avatars: Set<string>;
  media: Set<string>;
};

type OwnedAccountIds = {
  archiveIds: string[];
  recordIds: string[];
  marketPostIds: string[];
  commentIds: string[];
  marketCommentIds: string[];
};

type IdRow = {
  id?: string | null;
};

type MediaStorageRow = {
  url?: string | null;
  thumb_url?: string | null;
  storage_path?: string | null;
  thumb_path?: string | null;
};

type MarketMediaStorageRow = {
  url?: string | null;
  thumb_url?: string | null;
  path?: string | null;
  thumb_path?: string | null;
};

type MarketPostStorageRow = {
  cover_image_url?: string | null;
  cover_image_path?: string | null;
  cover_thumb_url?: string | null;
  cover_thumb_path?: string | null;
};

function getSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error("Missing Supabase env for account deletion route.");
  }

  return { url, anonKey };
}

function createSupabaseWithBearerToken(accessToken: string) {
  const { url, anonKey } = getSupabaseEnv();

  return createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
}

function getBearerToken(request: Request) {
  const authorization = request.headers.get("authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

async function getRequestUserId(request: Request) {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (!error && user?.id) {
    return user.id;
  }

  const accessToken = getBearerToken(request);
  if (!accessToken) return null;

  const tokenSupabase = createSupabaseWithBearerToken(accessToken);
  const tokenUserResult = await tokenSupabase.auth.getUser(accessToken);

  if (tokenUserResult.error || !tokenUserResult.data.user?.id) {
    return null;
  }

  return tokenUserResult.data.user.id;
}

function cleanStoragePath(value?: string | null) {
  const next = String(value || "").trim();
  if (!next || /^https?:\/\//i.test(next)) return null;
  return next.replace(/^\/+/, "");
}

function getStorageObjectFromPublicUrl(url?: string | null) {
  if (!url) return null;

  try {
    const parsed = new URL(url);
    const marker = "/storage/v1/object/public/";
    const index = parsed.pathname.indexOf(marker);
    if (index === -1) return null;

    const rest = parsed.pathname.slice(index + marker.length);
    const [bucket, ...pathParts] = rest.split("/");
    const path = decodeURIComponent(pathParts.join("/"));

    if (!bucket || !path) return null;
    return { bucket, path };
  } catch {
    return null;
  }
}

function addOwnedPath(
  sets: StoragePathSets,
  bucket: keyof StoragePathSets,
  userId: string,
  value?: string | null
) {
  const path = cleanStoragePath(value);
  if (!path || !path.startsWith(`${userId}/`)) return;
  sets[bucket].add(path);
}

function addOwnedPublicUrl(
  sets: StoragePathSets,
  userId: string,
  value?: string | null
) {
  const object = getStorageObjectFromPublicUrl(value);
  if (!object || !object.path.startsWith(`${userId}/`)) return;
  if (object.bucket === "media") sets.media.add(object.path);
  if (object.bucket === "avatars") sets.avatars.add(object.path);
}

async function assertNoError<T>(
  label: string,
  result: PromiseLike<{ data: unknown; error: unknown }>
) {
  const { data, error } = await result;
  if (error) {
    console.error(`${label}:`, error);
    throw new Error(label);
  }
  return data as T | null;
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function uniqueIds(...idLists: string[][]) {
  const ids = new Set<string>();
  for (const list of idLists) {
    for (const id of list) {
      if (id) ids.add(id);
    }
  }
  return Array.from(ids);
}

function normalizeIdRows(rows?: IdRow[] | null) {
  return uniqueIds((rows || []).map((row) => String(row.id || "")).filter(Boolean));
}

async function selectIdsByValue(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  table: string,
  column: string,
  value: string
) {
  const data = await assertNoError<IdRow[]>(
    `读取 ${table} 失败`,
    supabase.from(table).select("id").eq(column, value)
  );

  return normalizeIdRows(data);
}

async function selectIdsByIds(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  table: string,
  idColumn: string,
  ids: string[]
) {
  const result: string[] = [];

  for (const batch of chunkArray(ids, DB_IN_BATCH_SIZE)) {
    if (batch.length === 0) continue;

    const data = await assertNoError<IdRow[]>(
      `读取 ${table} 失败`,
      supabase.from(table).select("id").in(idColumn, batch)
    );

    result.push(...normalizeIdRows(data));
  }

  return uniqueIds(result);
}

async function selectRowsByIds<T>(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  label: string,
  table: string,
  columns: string,
  idColumn: string,
  ids: string[]
) {
  const rows: T[] = [];

  for (const batch of chunkArray(ids, DB_IN_BATCH_SIZE)) {
    if (batch.length === 0) continue;

    const data = await assertNoError<T[]>(
      label,
      supabase.from(table).select(columns).in(idColumn, batch)
    );

    rows.push(...(data || []));
  }

  return rows;
}

async function listStoragePrefix(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  bucketName: "media" | "avatars",
  prefix: string
) {
  const bucket = supabase.storage.from(bucketName);
  const paths = new Set<string>();
  const folders = [prefix.replace(/\/+$/, "")];

  while (folders.length > 0) {
    const folder = folders.pop();
    if (!folder) continue;

    let offset = 0;
    while (true) {
      const { data, error } = await bucket.list(folder, {
        limit: STORAGE_LIST_LIMIT,
        offset,
      });

      if (error) {
        console.error(`list ${bucketName}/${folder} error:`, error);
        throw new Error(`读取 ${bucketName} 文件列表失败`);
      }

      const rows = data || [];
      for (const item of rows) {
        const name = String(item.name || "").trim();
        if (!name) continue;

        const path = `${folder}/${name}`;
        const isFolder = !item.id && !item.metadata;

        if (isFolder) {
          folders.push(path);
        } else {
          paths.add(path);
        }
      }

      if (rows.length < STORAGE_LIST_LIMIT) break;
      offset += STORAGE_LIST_LIMIT;
    }
  }

  return paths;
}

async function collectOwnedAccountIds(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  userId: string
) {
  const archiveIds = await selectIdsByValue(supabase, "archives", "user_id", userId);
  const [directRecordIds, archiveRecordIds, marketPostIds] = await Promise.all([
    selectIdsByValue(supabase, "records", "user_id", userId),
    selectIdsByIds(supabase, "records", "archive_id", archiveIds),
    selectIdsByValue(supabase, "market_posts", "user_id", userId),
  ]);
  const recordIds = uniqueIds(directRecordIds, archiveRecordIds);

  const [userCommentIds, recordCommentIds, userMarketCommentIds, postMarketCommentIds] =
    await Promise.all([
      selectIdsByValue(supabase, "comments", "user_id", userId),
      selectIdsByIds(supabase, "comments", "record_id", recordIds),
      selectIdsByValue(supabase, "market_comments", "user_id", userId),
      selectIdsByIds(supabase, "market_comments", "market_post_id", marketPostIds),
    ]);

  return {
    archiveIds,
    recordIds,
    marketPostIds,
    commentIds: uniqueIds(userCommentIds, recordCommentIds),
    marketCommentIds: uniqueIds(userMarketCommentIds, postMarketCommentIds),
  };
}

async function collectStoragePaths(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  userId: string,
  ownedIds: OwnedAccountIds
) {
  const sets: StoragePathSets = {
    avatars: new Set<string>(),
    media: new Set<string>(),
  };

  const [
    mediaRowsByUser,
    mediaRowsByRecord,
    marketMediaRowsByUser,
    marketMediaRowsByPost,
    marketPostRows,
    profileRow,
  ] =
    await Promise.all([
      assertNoError(
        "读取记录图片失败",
        supabase
          .from("media")
          .select("url, thumb_url, storage_path, thumb_path")
          .eq("user_id", userId)
      ),
      selectRowsByIds<MediaStorageRow>(
        supabase,
        "读取记录关联图片失败",
        "media",
        "url, thumb_url, storage_path, thumb_path",
        "record_id",
        ownedIds.recordIds
      ),
      assertNoError(
        "读取集市图片失败",
        supabase
          .from("market_media")
          .select("url, thumb_url, path, thumb_path")
          .eq("user_id", userId)
      ),
      selectRowsByIds<MarketMediaStorageRow>(
        supabase,
        "读取集市关联图片失败",
        "market_media",
        "url, thumb_url, path, thumb_path",
        "market_post_id",
        ownedIds.marketPostIds
      ),
      assertNoError(
        "读取集市发布图片失败",
        supabase
          .from("market_posts")
          .select("cover_image_url, cover_image_path, cover_thumb_url, cover_thumb_path")
          .eq("user_id", userId)
      ),
      assertNoError(
        "读取头像失败",
        supabase.from("profiles").select("avatar_url").eq("id", userId).maybeSingle()
      ),
    ]);

  const mediaRows = [
    ...((mediaRowsByUser || []) as MediaStorageRow[]),
    ...mediaRowsByRecord,
  ];
  const marketMediaRows = [
    ...((marketMediaRowsByUser || []) as MarketMediaStorageRow[]),
    ...marketMediaRowsByPost,
  ];

  for (const row of mediaRows) {
    addOwnedPath(sets, "media", userId, row.storage_path);
    addOwnedPath(sets, "media", userId, row.thumb_path);
    addOwnedPublicUrl(sets, userId, row.url);
    addOwnedPublicUrl(sets, userId, row.thumb_url);
  }

  for (const row of marketMediaRows) {
    addOwnedPath(sets, "media", userId, row.path);
    addOwnedPath(sets, "media", userId, row.thumb_path);
    addOwnedPublicUrl(sets, userId, row.url);
    addOwnedPublicUrl(sets, userId, row.thumb_url);
  }

  for (const row of (marketPostRows || []) as MarketPostStorageRow[]) {
    addOwnedPath(sets, "media", userId, row.cover_image_path);
    addOwnedPath(sets, "media", userId, row.cover_thumb_path);
    addOwnedPublicUrl(sets, userId, row.cover_image_url);
    addOwnedPublicUrl(sets, userId, row.cover_thumb_url);
  }

  const profile = profileRow as { avatar_url?: string | null } | null;
  addOwnedPublicUrl(sets, userId, profile?.avatar_url);

  const [avatarPrefixPaths, mediaPrefixPaths] = await Promise.all([
    listStoragePrefix(supabase, "avatars", userId),
    listStoragePrefix(supabase, "media", userId),
  ]);

  avatarPrefixPaths.forEach((path) => sets.avatars.add(path));
  mediaPrefixPaths.forEach((path) => sets.media.add(path));

  return sets;
}

async function removeStoragePaths(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  bucketName: "media" | "avatars",
  paths: Set<string>
) {
  const list = Array.from(paths);
  const bucket = supabase.storage.from(bucketName);

  for (let index = 0; index < list.length; index += STORAGE_BATCH_SIZE) {
    const batch = list.slice(index, index + STORAGE_BATCH_SIZE);
    if (batch.length === 0) continue;

    const { error } = await bucket.remove(batch);
    if (error) {
      console.error(`remove ${bucketName} storage error:`, error);
      throw new Error(`删除 ${bucketName} 文件失败`);
    }
  }
}

async function deleteRows(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  table: string,
  column: string,
  userId: string
) {
  const { error } = await supabase.from(table).delete().eq(column, userId);
  if (error) {
    console.error(`delete ${table}.${column} error:`, error);
    throw new Error(`删除 ${table} 失败`);
  }
}

async function deleteRowsIn(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  table: string,
  column: string,
  ids: string[]
) {
  for (const batch of chunkArray(ids, DB_IN_BATCH_SIZE)) {
    if (batch.length === 0) continue;

    const { error } = await supabase.from(table).delete().in(column, batch);
    if (error) {
      console.error(`delete ${table}.${column} in error:`, error);
      throw new Error(`删除 ${table} 失败`);
    }
  }
}

async function updateRows(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  table: string,
  column: string,
  userId: string,
  values: Record<string, unknown>
) {
  const { error } = await supabase.from(table).update(values).eq(column, userId);
  if (error) {
    console.error(`update ${table}.${column} error:`, error);
    throw new Error(`更新 ${table} 失败`);
  }
}

async function updateRowsIn(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  table: string,
  column: string,
  ids: string[],
  values: Record<string, unknown>
) {
  for (const batch of chunkArray(ids, DB_IN_BATCH_SIZE)) {
    if (batch.length === 0) continue;

    const { error } = await supabase.from(table).update(values).in(column, batch);
    if (error) {
      console.error(`update ${table}.${column} in error:`, error);
      throw new Error(`更新 ${table} 失败`);
    }
  }
}

async function deleteAccountData(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  userId: string
) {
  const ownedIds = await collectOwnedAccountIds(supabase, userId);
  const storagePaths = await collectStoragePaths(supabase, userId, ownedIds);

  await removeStoragePaths(supabase, "avatars", storagePaths.avatars);
  await removeStoragePaths(supabase, "media", storagePaths.media);

  await deleteRows(supabase, "notifications", "user_id", userId);
  await deleteRowsIn(supabase, "notifications", "archive_id", ownedIds.archiveIds);
  await deleteRowsIn(supabase, "notifications", "record_id", ownedIds.recordIds);
  await deleteRowsIn(supabase, "notifications", "comment_id", ownedIds.commentIds);
  await updateRows(supabase, "notifications", "actor_user_id", userId, {
    actor_user_id: null,
  });

  await deleteRows(supabase, "comment_flowers", "sender_user_id", userId);
  await deleteRows(supabase, "comment_flowers", "receiver_user_id", userId);
  await deleteRowsIn(supabase, "comment_flowers", "record_id", ownedIds.recordIds);
  await deleteRowsIn(supabase, "comment_flowers", "comment_id", ownedIds.commentIds);
  await deleteRows(supabase, "comment_likes", "user_id", userId);
  await deleteRowsIn(supabase, "comment_likes", "comment_id", ownedIds.commentIds);
  await deleteRows(supabase, "record_likes", "user_id", userId);
  await deleteRowsIn(supabase, "record_likes", "record_id", ownedIds.recordIds);
  await deleteRowsIn(supabase, "market_comments", "id", ownedIds.marketCommentIds);
  await deleteRows(supabase, "market_comments", "user_id", userId);
  await deleteRowsIn(supabase, "market_comments", "market_post_id", ownedIds.marketPostIds);
  await deleteRowsIn(supabase, "comments", "id", ownedIds.commentIds);
  await deleteRows(supabase, "comments", "user_id", userId);

  await deleteRows(supabase, "archive_follows", "user_id", userId);
  await deleteRowsIn(supabase, "archive_follows", "archive_id", ownedIds.archiveIds);
  await deleteRows(supabase, "follows", "follower_id", userId);
  await deleteRows(supabase, "follows", "following_id", userId);

  await deleteRowsIn(supabase, "market_media", "market_post_id", ownedIds.marketPostIds);
  await deleteRows(supabase, "market_media", "user_id", userId);
  await updateRowsIn(supabase, "market_posts", "archive_id", ownedIds.archiveIds, {
    archive_id: null,
  });
  await updateRowsIn(supabase, "market_posts", "source_record_id", ownedIds.recordIds, {
    source_record_id: null,
  });
  await deleteRows(supabase, "market_posts", "user_id", userId);
  await deleteRows(supabase, "market_post_quota_addons", "user_id", userId);

  await deleteRows(supabase, "user_plant_interests", "user_id", userId);
  await deleteRows(supabase, "user_plant_plans", "user_id", userId);
  await updateRows(supabase, "plant_species_pending", "user_id", userId, {
    user_id: null,
    note: "账号已注销，用户关联已移除。",
  });

  await deleteRowsIn(supabase, "record_tags", "record_id", ownedIds.recordIds);
  await deleteRowsIn(supabase, "media", "record_id", ownedIds.recordIds);
  await deleteRows(supabase, "media", "user_id", userId);
  await deleteRowsIn(supabase, "records", "id", ownedIds.recordIds);
  await deleteRows(supabase, "records", "user_id", userId);
  await deleteRowsIn(supabase, "archives", "id", ownedIds.archiveIds);
  await deleteRows(supabase, "archives", "user_id", userId);
  await deleteRows(supabase, "locations", "user_id", userId);
  await deleteRows(supabase, "group_tags", "user_id", userId);
  await deleteRows(supabase, "sub_tags", "user_id", userId);
  await deleteRows(supabase, "app_admins", "user_id", userId);
  await deleteRows(supabase, "user_memberships", "user_id", userId);

  // membership_payments.user_id is NOT NULL and references auth.users.
  // Without a migration, it cannot be anonymized safely. We soft-delete the
  // Auth user below so payment audit rows remain attached to an unusable
  // deleted Auth identity instead of being cascaded away.
  await deleteRows(supabase, "profiles", "id", userId);
  await deleteRows(supabase, "users", "id", userId);

  const { error } = await supabase.auth.admin.deleteUser(userId, true);
  if (error) {
    console.error("delete auth user error:", error);
    throw new Error("删除登录账号失败");
  }

  return {
    avatarFileCount: storagePaths.avatars.size,
    mediaFileCount: storagePaths.media.size,
  };
}

export async function POST(request: Request) {
  let body: AccountDeletionBody | null = null;

  try {
    body = (await request.json()) as AccountDeletionBody;
  } catch {
    return Response.json({ error: "请求内容无效" }, { status: 400 });
  }

  if (body?.confirm !== true) {
    return Response.json({ error: "请先确认注销账号" }, { status: 400 });
  }

  const userId = await getRequestUserId(request);
  if (!userId) {
    return Response.json({ error: "请先登录后再注销账号" }, { status: 401 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const result = await deleteAccountData(supabase, userId);
    return Response.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "注销账号失败";
    return Response.json({ error: message }, { status: 500 });
  }
}
