import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { hasValidMutationOrigin } from "@/lib/server/authenticated-request";

export const runtime = "nodejs";

const DB_IN_BATCH_SIZE = 200;
const STORAGE_BATCH_SIZE = 100;
const STORAGE_LIST_LIMIT = 1000;

type AccountDeletionBody = {
  confirm?: boolean;
  targetUserId?: unknown;
  confirmPermanent?: unknown;
  confirmationText?: unknown;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type StoragePathSets = {
  avatars: Set<string>;
  media: Set<string>;
  paymentProofs: Set<string>;
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

type AuthLookupError = {
  status?: unknown;
  code?: unknown;
  message?: unknown;
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

function isMissingAuthUserError(error: unknown) {
  if (!error || typeof error !== "object") return false;

  const candidate = error as AuthLookupError;
  const status = Number(candidate.status);
  const code = String(candidate.code || "").toLowerCase();
  const message = String(candidate.message || "").toLowerCase();

  return (
    status === 404 ||
    code === "user_not_found" ||
    message.includes("user not found")
  );
}

async function hasResidualAccountData(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  userId: string
) {
  const probes = [
    ["profiles", "id"],
    ["users", "id"],
    ["archives", "user_id"],
    ["records", "user_id"],
    ["media", "user_id"],
    ["user_memberships", "user_id"],
    ["market_posts", "user_id"],
    ["comments", "user_id"],
    ["locations", "user_id"],
    ["group_tags", "user_id"],
    ["sub_tags", "user_id"],
  ] as const;

  const results = await Promise.all(
    probes.map(async ([table, column]) => {
      const { data, error } = await supabase
        .from(table)
        .select(column)
        .eq(column, userId)
        .limit(1);

      if (error) {
        console.error(`check residual ${table}.${column} error:`, error);
        throw new Error("核对残留账号数据失败");
      }

      return Array.isArray(data) && data.length > 0;
    })
  );

  return results.some(Boolean);
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
  bucketName: "media" | "avatars" | "payment-proofs",
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
    paymentProofs: new Set<string>(),
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

  const [avatarPrefixPaths, mediaPrefixPaths, paymentProofPrefixPaths] = await Promise.all([
    listStoragePrefix(supabase, "avatars", userId),
    listStoragePrefix(supabase, "media", userId),
    listStoragePrefix(supabase, "payment-proofs", userId),
  ]);

  avatarPrefixPaths.forEach((path) => sets.avatars.add(path));
  mediaPrefixPaths.forEach((path) => sets.media.add(path));
  paymentProofPrefixPaths.forEach((path) => sets.paymentProofs.add(path));

  return sets;
}

async function removeStoragePaths(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  bucketName: "media" | "avatars" | "payment-proofs",
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
  userId: string,
  authUserExists = true
) {
  const ownedIds = await collectOwnedAccountIds(supabase, userId);
  const storagePaths = await collectStoragePaths(supabase, userId, ownedIds);

  await removeStoragePaths(supabase, "avatars", storagePaths.avatars);
  await removeStoragePaths(supabase, "media", storagePaths.media);
  await removeStoragePaths(supabase, "payment-proofs", storagePaths.paymentProofs);

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

  const { data: openRefundRequest, error: openRefundRequestError } = await supabase
    .from("membership_refund_requests")
    .select("id")
    .eq("user_id", userId)
    .in("status", ["submitted", "approved_pending_refund"])
    .limit(1)
    .maybeSingle();
  if (openRefundRequestError) {
    console.error("check open membership refund requests error:", openRefundRequestError);
    throw new Error("核对未完成退款申请失败");
  }
  if (openRefundRequest) {
    throw new Error("存在未完成的退款申请，请先完成退款或联系运营者后再注销账号");
  }

  const accountDeletedAt = new Date().toISOString();
  await deleteRows(supabase, "user_memberships", "user_id", userId);
  await updateRows(supabase, "membership_payments", "user_id", userId, {
    proof_path: null,
  });
  const { error: cancelPaymentOrderError } = await supabase
    .from("membership_payments")
    .update({
      status: "canceled",
      review_note: "account_deleted",
      reviewed_at: accountDeletedAt,
      updated_at: accountDeletedAt,
    })
    .eq("user_id", userId)
    .in("status", ["pending_payment", "submitted", "needs_update"]);
  if (cancelPaymentOrderError) {
    console.error("cancel open membership payment orders error:", cancelPaymentOrderError);
    throw new Error("取消未完成付款订单失败");
  }

  // membership_payments.user_id is NOT NULL and references auth.users.
  // Without a migration, it cannot be anonymized safely. We soft-delete the
  // Auth user below so payment audit rows remain attached to an unusable
  // deleted Auth identity instead of being cascaded away.
  await deleteRows(supabase, "profiles", "id", userId);
  await deleteRows(supabase, "users", "id", userId);

  if (authUserExists) {
    const { error } = await supabase.auth.admin.deleteUser(userId, true);
    if (error) {
      console.error("delete auth user error:", error);
      throw new Error("删除登录账号失败");
    }
  }

  return {
    avatarFileCount: storagePaths.avatars.size,
    mediaFileCount: storagePaths.media.size,
    paymentProofFileCount: storagePaths.paymentProofs.size,
  };
}

export async function POST(request: Request) {
  if (!hasValidMutationOrigin(request)) {
    return Response.json({ error: "请求来源无效" }, { status: 403 });
  }

  let body: AccountDeletionBody | null = null;

  try {
    body = (await request.json()) as AccountDeletionBody;
  } catch {
    return Response.json({ error: "请求内容无效" }, { status: 400 });
  }

  if (body?.confirm !== true) {
    return Response.json({ error: "请先确认注销账号" }, { status: 400 });
  }

  const requestedBy = await getRequestUserId(request);
  if (!requestedBy) {
    return Response.json({ error: "请先登录后再注销账号" }, { status: 401 });
  }

  const requestedTargetUserId =
    typeof body.targetUserId === "string" ? body.targetUserId.trim() : "";
  const isAdminInitiated = Boolean(requestedTargetUserId);
  const userId = requestedTargetUserId || requestedBy;

  if (!UUID_PATTERN.test(userId)) {
    return Response.json({ error: "账号 ID 不正确" }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();

    const [
      { data: accountRow, error: accountError },
      { data: authUserData, error: authUserError },
      { data: requesterAdmin, error: requesterAdminError },
    ] =
      await Promise.all([
        supabase
          .from("users")
          .select("id, account_number")
          .eq("id", userId)
          .maybeSingle(),
        supabase.auth.admin.getUserById(userId),
        isAdminInitiated
          ? supabase
              .from("app_admins")
              .select("user_id")
              .eq("user_id", requestedBy)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);

    if (accountError) {
      console.error("load account deletion identity error:", accountError);
      return Response.json({ error: "读取账号信息失败" }, { status: 500 });
    }

    if (isAdminInitiated && requesterAdminError) {
      console.error("verify admin account deletion requester error:", requesterAdminError);
      return Response.json({ error: "无法核对管理员权限" }, { status: 500 });
    }

    if (isAdminInitiated && !requesterAdmin) {
      return Response.json({ error: "没有管理员权限" }, { status: 403 });
    }

    if (isAdminInitiated && userId === requestedBy) {
      return Response.json({ error: "不能通过管理员页面注销自己" }, { status: 400 });
    }

    const authUserExists = Boolean(authUserData?.user);
    const authUserMissing =
      !authUserExists && (!authUserError || isMissingAuthUserError(authUserError));

    if (authUserError && !authUserMissing) {
      console.error("load account deletion auth identity error:", authUserError);
      return Response.json({ error: "读取登录账号信息失败" }, { status: 500 });
    }

    if (!authUserExists && !isAdminInitiated) {
      return Response.json({ error: "账号不存在或已经注销" }, { status: 404 });
    }

    if (!authUserExists) {
      const residualDataExists = await hasResidualAccountData(supabase, userId);
      if (!residualDataExists) {
        return Response.json({ error: "账号不存在或已经注销" }, { status: 404 });
      }
    }

    if (!isAdminInitiated) {
      const { data: selfAdmin, error: selfAdminError } = await supabase
        .from("app_admins")
        .select("user_id")
        .eq("user_id", requestedBy)
        .maybeSingle();

      if (selfAdminError) {
        console.error("verify self-service admin deletion error:", selfAdminError);
        return Response.json({ error: "无法核对账号权限" }, { status: 500 });
      }

      if (selfAdmin) {
        return Response.json(
          { error: "管理员账号不能自助注销，请先通过受控流程撤销管理员身份" },
          { status: 400 }
        );
      }
    }

    if (isAdminInitiated) {
      const [
        { data: targetAdmin, error: targetAdminError },
        { data: targetMembership, error: targetMembershipError },
      ] =
        await Promise.all([
          supabase
            .from("app_admins")
            .select("user_id")
            .eq("user_id", userId)
            .maybeSingle(),
          supabase
            .from("user_memberships")
            .select("plan")
            .eq("user_id", userId)
            .maybeSingle(),
        ]);

      if (targetAdminError || targetMembershipError) {
        console.error("verify admin account deletion target error:", {
          targetAdminError,
          targetMembershipError,
        });
        return Response.json({ error: "无法核对管理员与目标账号" }, { status: 500 });
      }

      if (targetAdmin || targetMembership?.plan === "admin") {
        return Response.json({ error: "管理员账号不能在这里注销" }, { status: 400 });
      }

      const requiredConfirmation = accountRow?.account_number || userId;
      const confirmationText =
        typeof body.confirmationText === "string" ? body.confirmationText.trim() : "";

      if (
        body.confirmPermanent !== true ||
        confirmationText !== requiredConfirmation
      ) {
        return Response.json(
          { error: "请准确输入账号编号并确认永久注销" },
          { status: 400 }
        );
      }
    }

    const { data: openRefund, error: openRefundError } = await supabase
      .from("membership_refund_requests")
      .select("id")
      .eq("user_id", userId)
      .in("status", ["submitted", "approved_pending_refund"])
      .limit(1)
      .maybeSingle();

    if (openRefundError) {
      console.error("verify refund status before account deletion error:", openRefundError);
      return Response.json({ error: "无法核对退款状态，账号未注销" }, { status: 500 });
    }

    if (openRefund) {
      return Response.json(
        { error: "存在未完成的退款申请，请先完成退款或联系运营者后再注销账号" },
        { status: 409 }
      );
    }

    const { data: auditRow, error: auditError } = await supabase
      .from("account_deletion_audits")
      .insert({
        target_user_id: userId,
        target_account_number: accountRow?.account_number || null,
        initiated_by: isAdminInitiated ? "admin" : "self",
        requested_by: requestedBy,
        status: "processing",
      })
      .select("id")
      .single();

    if (auditError || !auditRow?.id) {
      console.error("create account deletion audit error:", auditError);
      return Response.json(
        { error: "无法建立销号操作记录，账号未注销" },
        { status: 500 }
      );
    }

    try {
      const result = await deleteAccountData(supabase, userId, authUserExists);
      const deletedStorageObjectCount =
        result.avatarFileCount +
        result.mediaFileCount +
        result.paymentProofFileCount;

      const { error: completeAuditError } = await supabase
        .from("account_deletion_audits")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          deleted_storage_object_count: deletedStorageObjectCount,
          error_code: null,
        })
        .eq("id", auditRow.id);

      if (completeAuditError) {
        console.error("complete account deletion audit error:", completeAuditError);
      }

      return Response.json({ ok: true, ...result });
    } catch (error) {
      const { error: failAuditError } = await supabase
        .from("account_deletion_audits")
        .update({
          status: "failed",
          failed_at: new Date().toISOString(),
          error_code: "account_deletion_failed",
        })
        .eq("id", auditRow.id);

      if (failAuditError) {
        console.error("fail account deletion audit error:", failAuditError);
      }

      throw error;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "注销账号失败";
    return Response.json({ error: message }, { status: 500 });
  }
}
