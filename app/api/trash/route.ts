import { getAuthenticatedRequestClient } from "@/lib/server/authenticated-request";
import { resolveMediaDisplayPairs, type MediaUrlSource } from "@/lib/media-urls";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type TrashListingRpcRow = {
  trash_entry_id?: unknown;
  target_type?: unknown;
  target_id?: unknown;
  deleted_at?: unknown;
  status?: unknown;
  display_title?: unknown;
  parent_title?: unknown;
  child_record_count?: unknown;
  child_media_count?: unknown;
  can_retry?: unknown;
};

type TrashPreviewEntryRow = {
  id: string;
  restore_snapshot: Record<string, unknown> | null;
};

type TrashPreviewMediaRow = MediaUrlSource & {
  id: string;
  trash_entry_id: string | null;
  sort_order: number | null;
  created_at: string | null;
};

function getSnapshotMediaId(
  item: { type: string; id: string },
  snapshot?: Record<string, unknown> | null
) {
  if (item.type === "media") return item.id;
  const value =
    item.type === "archive"
      ? snapshot?.archive_cover_media_id
      : item.type === "record"
        ? snapshot?.record_primary_media_id
        : null;
  return typeof value === "string" ? value : null;
}

function noStoreJson(body: unknown, status: number) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(request: Request) {
  const auth = await getAuthenticatedRequestClient(request);
  if (!auth) {
    return noStoreJson({ error: "unauthorized" }, 401);
  }

  const result = await auth.supabase.rpc("list_my_trash_entries");
  if (result.error) {
    console.error("cloud trash listing failed", { errorCode: "rpc_failed" });
    return noStoreJson({ error: "trash_list_failed" }, 500);
  }

  const rows = Array.isArray(result.data)
    ? (result.data as TrashListingRpcRow[])
    : [];
  const items = rows.flatMap((row) => {
    const type = row.target_type;
    const trashEntryId = row.trash_entry_id;
    const id = row.target_id;
    const deletedAt = row.deleted_at;

    if (
      (type !== "archive" && type !== "record" && type !== "media") ||
      typeof trashEntryId !== "string" ||
      typeof id !== "string" ||
      typeof deletedAt !== "string" ||
      (row.status !== "active" && row.status !== "purging" && row.status !== "failed")
    ) {
      return [];
    }

    return [
      {
        trashEntryId,
        type,
        id,
        title:
          typeof row.display_title === "string" && row.display_title.trim()
            ? row.display_title.trim()
            : type === "archive"
              ? "未命名项目"
              : type === "record"
                ? "记录"
                : "照片",
        parentTitle:
          typeof row.parent_title === "string" && row.parent_title.trim()
            ? row.parent_title.trim()
            : null,
        deletedAt,
        status: row.status,
        recordCount: Math.max(0, Number(row.child_record_count) || 0),
        mediaCount: Math.max(0, Number(row.child_media_count) || 0),
        canRetry: row.can_retry === true,
      },
    ];
  });

  if (items.length === 0) {
    return noStoreJson({ ok: true, items }, 200);
  }

  const admin = getSupabaseAdmin();
  const trashEntryIds = items.map((item) => item.trashEntryId);
  const [entryResult, mediaResult] = await Promise.all([
    admin
      .from("trash_entries")
      .select("id, restore_snapshot")
      .eq("owner_user_id", auth.userId)
      .in("id", trashEntryIds),
    admin
      .from("media")
      .select(
        "id, trash_entry_id, url, storage_path, thumb_url, thumb_path, sort_order, created_at"
      )
      .eq("user_id", auth.userId)
      .eq("type", "image")
      .in("trash_entry_id", trashEntryIds)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
  ]);

  if (entryResult.error || mediaResult.error) {
    console.warn("cloud trash preview lookup failed", {
      errorCode: "preview_lookup_failed",
    });
    return noStoreJson(
      { ok: true, items: items.map((item) => ({ ...item, previewUrl: null })) },
      200
    );
  }

  const entryMap = new Map(
    ((entryResult.data || []) as TrashPreviewEntryRow[]).map((entry) => [
      entry.id,
      entry,
    ])
  );
  const mediaRows = (mediaResult.data || []) as TrashPreviewMediaRow[];
  const mediaById = new Map(mediaRows.map((media) => [media.id, media]));
  const mediaByTrashEntry = new Map<string, TrashPreviewMediaRow[]>();
  mediaRows.forEach((media) => {
    if (!media.trash_entry_id) return;
    const list = mediaByTrashEntry.get(media.trash_entry_id) || [];
    list.push(media);
    mediaByTrashEntry.set(media.trash_entry_id, list);
  });

  const previewSources = items.map((item) => {
    const entry = entryMap.get(item.trashEntryId);
    const preferredId = getSnapshotMediaId(item, entry?.restore_snapshot);
    return (
      (preferredId ? mediaById.get(preferredId) : null) ||
      mediaByTrashEntry.get(item.trashEntryId)?.[0] ||
      {}
    );
  });
  const previewPairs = await resolveMediaDisplayPairs(admin, previewSources);
  const itemsWithPreviews = items.map((item, index) => ({
    ...item,
    previewUrl:
      previewPairs[index]?.display_thumb_url ||
      previewPairs[index]?.display_url ||
      null,
  }));

  return noStoreJson({ ok: true, items: itemsWithPreviews }, 200);
}
