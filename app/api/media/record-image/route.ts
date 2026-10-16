import { NextResponse } from "next/server";
import { getAuthenticatedRequestClient } from "@/lib/server/authenticated-request";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getMediaObjectPath, getMediaThumbObjectPath } from "@/lib/media-urls";
import { isOwnerMediaPath, mayServeRecordImage } from "@/lib/server/record-media-gate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NO_STORE = {
  "Cache-Control": "private, no-store, max-age=0",
  "CDN-Cache-Control": "no-store",
  "Surrogate-Control": "no-store",
  "Vary": "Cookie, Authorization",
  "Cross-Origin-Resource-Policy": "same-origin",
  "X-Content-Type-Options": "nosniff",
};

function reject(status: number) {
  return NextResponse.json({ error: "image_unavailable" }, {
    status,
    headers: NO_STORE,
  });
}

/**
 * Opt-in guarded download for record photos. Unlike an hour-long signed URL,
 * every GET checks the record, archive and trial claim again before serving.
 * Not yet wired into the existing client signers; keep disabled until QA.
 */
export async function GET(request: Request) {
  if (process.env.TRIAL_MEDIA_PROXY_ENABLED !== "true") return reject(404);

  const url = new URL(request.url);
  const mediaId = url.searchParams.get("id") || "";
  const variant = url.searchParams.get("variant") || "full";
  if (!UUID_RE.test(mediaId) || (variant !== "full" && variant !== "thumb")) {
    return reject(400);
  }

  try {
    const requester = await getAuthenticatedRequestClient(request);
    const admin = getSupabaseAdmin();
    const { data: media, error: mediaError } = await admin.from("media")
      .select("id,user_id,record_id,type,trashed_at,storage_path,thumb_path,url,thumb_url")
      .eq("id", mediaId).eq("type", "image").maybeSingle();
    if (mediaError || !media?.record_id) return reject(404);

    const { data: record, error: recordError } = await admin.from("records")
      .select("id,user_id,archive_id,visibility,trashed_at")
      .eq("id", media.record_id).maybeSingle();
    if (recordError || !record) return reject(404);

    const { data: archive, error: archiveError } = await admin.from("archives")
      .select("id,user_id,is_public,trashed_at")
      .eq("id", record.archive_id).maybeSingle();
    if (archiveError || !archive) return reject(404);

    // Fail closed if the un-applied trial access migration is unavailable.
    const { data: allowed, error: accessError } = await admin.rpc(
      "can_read_trial_cloud_owner", { p_user_id: media.user_id }
    );
    if (accessError || allowed !== true) return reject(403);

    if (!mayServeRecordImage({
      media, record, archive,
      viewerId: requester?.userId || null,
      trialOwnerCanRead: allowed,
    })) return reject(404);

    const path = variant === "thumb"
      ? getMediaThumbObjectPath(media) || getMediaObjectPath(media)
      : getMediaObjectPath(media);
    if (!path || !isOwnerMediaPath(path, media.user_id)) return reject(404);

    const { data: blob, error: downloadError } = await admin.storage
      .from("media").download(path);
    if (downloadError || !blob) return reject(404);
    if (!blob.type.startsWith("image/")) return reject(415);

    // A long download can straddle the handling deadline or a membership
    // change. Never serve bytes on the strength of an earlier access check.
    const { data: stillAllowed, error: recheckError } = await admin.rpc(
      "can_read_trial_cloud_owner", { p_user_id: media.user_id }
    );
    if (recheckError || stillAllowed !== true) return reject(403);

    return new Response(blob, {
      status: 200,
      headers: { ...NO_STORE, "Content-Type": blob.type },
    });
  } catch {
    return reject(503);
  }
}
