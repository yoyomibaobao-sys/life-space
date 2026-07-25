import { getAuthenticatedRequestClient } from "@/lib/server/authenticated-request";

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

  return noStoreJson({ ok: true, items }, 200);
}
