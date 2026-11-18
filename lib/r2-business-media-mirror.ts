import { supabase } from "@/lib/supabase";
import { Capacitor, CapacitorHttp } from "@capacitor/core";
import {
  clearPendingR2Mirror, listPendingR2Mirrors, readPendingR2Mirror, writePendingR2Mirror,
} from "@/lib/r2-mirror-pending-journal";

// R2 is a verified shadow copy. Supabase remains the readable source, and
// this module never writes media metadata, changes quota, or deletes an object.
const MIRROR_PATH = "/__internal/r2/business-media/mirror";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type R2MirrorScope = "qa" | "production";
type R2MirrorConfig = { supabaseOrigin: string; origin: string; scope: R2MirrorScope };
// The build helper validates the exact QA/formal pair before setting the
// validated marker. Keep QA hosts out of formal client bundles.
const FORMAL_SUPABASE_ORIGIN = "https://eidltoikfpnrzxruvawf.supabase.co";
const FORMAL_SITE_ORIGIN = "https://life-space.uk";
const QA_SUPABASE_ORIGIN = process.env.NEXT_PUBLIC_LIFESPACE_BUILD_SCOPE === "production"
  ? "" : "https://mablwxlipcgbmbnfdbkc.supabase.co";
const QA_MEDIA_ORIGIN = process.env.NEXT_PUBLIC_LIFESPACE_BUILD_SCOPE === "production"
  ? "" : "https://lifespace-site-media-qa-20261028.lifespace-assets-isolated-lab.workers.dev";

function httpsOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password ||
        url.pathname !== "/" || url.search || url.hash) return null;
    return url.origin;
  } catch { return null; }
}

function getMirrorConfig(): R2MirrorConfig | null {
  if (process.env.NEXT_PUBLIC_R2_MEDIA_MIRROR_ENABLED !== "true" ||
      process.env.NEXT_PUBLIC_R2_MEDIA_MIRROR_CONFIG_VALIDATED !== "true") return null;
  const scope = process.env.NEXT_PUBLIC_R2_MEDIA_MIRROR_SCOPE;
  if (scope !== "qa" && scope !== "production") return null;
  const supabaseOrigin = httpsOrigin(process.env.NEXT_PUBLIC_SUPABASE_URL || "");
  const origin = httpsOrigin(process.env.NEXT_PUBLIC_R2_MEDIA_MIRROR_ORIGIN || "");
  if (!supabaseOrigin || !origin) return null;
  if (scope === "production" &&
      (supabaseOrigin !== FORMAL_SUPABASE_ORIGIN || origin !== FORMAL_SITE_ORIGIN)) return null;
  if (scope === "qa" &&
      (supabaseOrigin !== QA_SUPABASE_ORIGIN || origin !== QA_MEDIA_ORIGIN)) return null;
  return { supabaseOrigin, origin, scope };
}

function mirrorOriginAvailable(config: R2MirrorConfig): boolean {
  if (typeof window === "undefined") return false;
  const native = Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
  return native || window.location.origin === config.origin;
}

export type R2MirrorOutcome = "disabled" | "not_applicable" |
  "authentication_required" | "journal_unavailable" | "mirrored" | "full_pending" | "thumb_pending";

export async function mirrorCommittedRecordMedia(params: {
  mediaId: string; ownerId: string; thumbPath: string | null;
}): Promise<R2MirrorOutcome> {
  if (process.env.NEXT_PUBLIC_R2_MEDIA_MIRROR_ENABLED !== "true") return "disabled";
  const config = getMirrorConfig();
  if (!config || typeof window === "undefined" ||
      typeof navigator === "undefined" || !navigator.onLine ||
      !mirrorOriginAvailable(config) ||
      !UUID.test(params.mediaId) || !UUID.test(params.ownerId))
    return "not_applicable";
  const { origin, supabaseOrigin, scope } = config;
  const native = Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";

  let pendingStage: "full" | "thumb" = "full";
  try {
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError || auth.user?.id !== params.ownerId) return "authentication_required";
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session?.access_token || data.session.user.id !== params.ownerId)
      return "authentication_required";
    // Verify the JWT issuer before any bearer can leave the device.
    try {
      const segment = data.session.access_token.split(".")[1] || "";
      const issuer = JSON.parse(atob(segment.replace(/-/g, "+").replace(/_/g, "/"))).iss;
      if (issuer !== supabaseOrigin + "/auth/v1") return "authentication_required";
    } catch { return "authentication_required"; }
    const existing = readPendingR2Mirror(params.ownerId, params.mediaId, scope);
    const needsThumb = Boolean(params.thumbPath);
    if (existing === undefined || (existing && existing.needsThumb !== needsThumb)) {
      console.warn("R2 mirror journal unavailable or changed; source remains intact");
      return "journal_unavailable";
    }
    pendingStage = existing?.nextVariant || "full";
    // Persist before the first network request. A lost HTTP response must not
    // cause source deletion or an untracked shadow mirror attempt.
    if (!existing && !writePendingR2Mirror({
      ownerId: params.ownerId, mediaId: params.mediaId, needsThumb, nextVariant: "full",
    }, scope)) {
      console.warn("R2 mirror journal cannot be saved; no request sent");
      return "journal_unavailable";
    }
    const mirrorVariant = async (variant: "full" | "thumb") => {
      const body = JSON.stringify({ businessType: "media", businessId: params.mediaId, variant });
      if (native) {
        try {
          const result = await CapacitorHttp.request({
            url: origin + MIRROR_PATH, method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: "Bearer " + data.session!.access_token,
            },
            data: body, disableRedirects: true, responseType: "json",
            connectTimeout: 10000, readTimeout: 10000,
          });
          const responseUrl = result.url ? new URL(result.url) : new URL(origin + MIRROR_PATH);
          const payload = typeof result.data === "string"
            ? JSON.parse(result.data) : result.data;
          return responseUrl.origin === origin && result.status === 200 &&
            ["copied_verified", "already_verified"].includes(payload?.status);
        } catch { return false; }
      }
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      try {
        const response = await fetch(origin + MIRROR_PATH, {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + data.session!.access_token,
          },
          body,
          signal: controller.signal,
        });
        if (response.status !== 200) return false;
        const payload = await response.json().catch(() => null);
        return ["copied_verified", "already_verified"].includes(payload?.status);
      } catch {
        return false;
      } finally {
        clearTimeout(timeout);
      }
    };
    if (pendingStage === "full") {
      if (!await mirrorVariant("full")) return "full_pending";
      if (params.thumbPath && !writePendingR2Mirror({
        ownerId: params.ownerId, mediaId: params.mediaId, needsThumb: true, nextVariant: "thumb",
      }, scope)) return "full_pending";
      pendingStage = "thumb";
    }
    if (params.thumbPath && !await mirrorVariant("thumb")) return "thumb_pending";
    if (!clearPendingR2Mirror(params.ownerId, params.mediaId, scope)) {
      // A stale marker is safer than losing the only durable recovery point.
      return params.thumbPath ? "thumb_pending" : "full_pending";
    }
    return "mirrored";
  } catch {
    // An unknown HTTP outcome remains in the local environment-scoped journal.
    // Reattempts use the server's Owner check and conditional R2 writes.
    return pendingStage === "thumb" ? "thumb_pending" : "full_pending";
  }
}
function availableMirrorScope(): R2MirrorConfig | null {
  const config = getMirrorConfig();
  if (!config || !mirrorOriginAvailable(config)) return null;
  return config;
}

export function getPendingR2MirrorCountForOwner(ownerId: string): number {
  const config = availableMirrorScope();
  if (!config || !UUID.test(ownerId)) return 0;
  return listPendingR2Mirrors(ownerId, config.scope)?.length || 0;
}

// Called only from an explicit user action; never on online/reconnect events.
// The original Supabase upload and its main pending queue are not touched.
export async function retryPendingR2MediaMirrorsForOwner(ownerId: string): Promise<{
  attempted: number; completed: number; pending: number; blocked: boolean;
}> {
  const nothing = { attempted: 0, completed: 0, pending: 0, blocked: false };
  const config = availableMirrorScope();
  if (!config || !UUID.test(ownerId)) return { ...nothing, blocked: true };
  const items = listPendingR2Mirrors(ownerId, config.scope);
  if (!items) return { ...nothing, blocked: true };
  let attempted = 0;
  let completed = 0;
  let blocked = false;
  for (const item of items.slice(0, 20)) {
    attempted++;
    const outcome = await mirrorCommittedRecordMedia({
      mediaId: item.mediaId,
      ownerId,
      // Only presence matters. The service resolves the actual thumbnail path.
      thumbPath: item.needsThumb ? "server-resolved" : null,
    });
    if (outcome === "mirrored") completed++;
    else if (outcome !== "full_pending" && outcome !== "thumb_pending") {
      blocked = true;
      break;
    }
  }
  const after = listPendingR2Mirrors(ownerId, config.scope);
  return { attempted, completed, pending: after?.length ?? items.length - completed,
    blocked: blocked || after === null };
}
