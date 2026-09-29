export type AndroidShellRouteKind =
  | "list"
  | "profile"
  | "project-categories"
  | "activity"
  | "discover-search"
  | "experience"
  | "following"
  | "market"
  | "guides"
  | "guide-detail"
  | "archive"
  | "local-archive"
  | "network-required";

export type AndroidShellRoute = {
  kind: AndroidShellRouteKind;
  id?: string;
};

export type AndroidShellOwnedArchive = {
  id: string;
  local_role?: string | null;
  source_cloud_archive_id?: string | null;
};

const NETWORK_REQUIRED_PREFIXES = [
  "/membership",
  "/admin",
  "/market/",
  "/experience-cards",
  "/profile/",
  "/user/",
  "/legal",
  "/feedback",
  "/login",
  "/register",
  "/download",
  "/app-update",
  "/notifications",
  "/report",
];

export function isAndroidShellNetworkRequiredPath(pathname: string) {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path === "/profile/project-categories") return false;
  return NETWORK_REQUIRED_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(prefix),
  );
}

export type AndroidArchiveScreenTarget =
  | { kind: "cloud-detail"; archiveId: string }
  | { kind: "local-detail"; archiveId: string }
  | { kind: "public-detail" }
  | { kind: "public-cloud-detail"; archiveId: string }
  | { kind: "need-network" };

export const ANDROID_NETWORK_FEED_SCREENS = [
  "activity",
  "discover-search",
  "public-detail",
  "public-cloud-detail",
  "following",
  "market",
] as const;

export function isAndroidNetworkFeedScreen(kind: string) {
  return (ANDROID_NETWORK_FEED_SCREENS as readonly string[]).includes(kind);
}

export function liveCloudCardImageUrl(archive: {
  display_cover_thumb_url?: string | null;
  display_cover_image_url?: string | null;
  cover_image_url?: string | null;
}) {
  return archive.display_cover_thumb_url
    || archive.display_cover_image_url
    || archive.cover_image_url
    || null;
}

export function resolveLiveCloudArchiveId(
  requestedId: string,
  cloudArchives: Array<{ id: string }>,
  ownedArchives: AndroidShellOwnedArchive[],
) {
  const id = String(requestedId || "").trim();
  if (!id) return null;
  if (cloudArchives.some((archive) => archive.id === id)) return id;
  const bySource = ownedArchives.find((archive) => archive.source_cloud_archive_id === id);
  if (bySource?.source_cloud_archive_id) return bySource.source_cloud_archive_id;
  const byLocal = ownedArchives.find(
    (archive) => archive.id === id && Boolean(archive.source_cloud_archive_id),
  );
  return byLocal?.source_cloud_archive_id || null;
}

export function resolveAndroidArchiveScreen(input: {
  online: boolean;
  archiveId: string;
  cloudUserId: string | null;
  cloudArchives: Array<{ id: string }>;
  activityOwnerUserId: string | null;
  hasPublicFeedItem: boolean;
  ownedLocalArchives: AndroidShellOwnedArchive[];
}): AndroidArchiveScreenTarget {
  const archiveId = String(input.archiveId || "").trim();
  const liveCloudId = resolveLiveCloudArchiveId(
    archiveId,
    input.cloudArchives,
    input.ownedLocalArchives,
  );
  const ownedFromFeed = Boolean(
    input.cloudUserId &&
    input.activityOwnerUserId &&
    input.activityOwnerUserId === input.cloudUserId,
  );

  if (input.online) {
    if (input.cloudUserId && (liveCloudId || ownedFromFeed)) {
      return { kind: "cloud-detail", archiveId: liveCloudId || archiveId };
    }
    if (input.hasPublicFeedItem) return { kind: "public-detail" };
    return { kind: "public-cloud-detail", archiveId };
  }

  const ownedId = resolveOwnedShellArchiveId(archiveId, input.ownedLocalArchives);
  if (ownedId) return { kind: "local-detail", archiveId: ownedId };
  return { kind: "need-network" };
}

export function resolveOwnedShellArchiveId(
  requestedId: string,
  ownedArchives: AndroidShellOwnedArchive[],
) {
  const id = String(requestedId || "").trim();
  if (!id) return null;

  const exact = ownedArchives.find((archive) => archive.id === id);
  if (exact) return exact.id;

  const cache = ownedArchives.find(
    (archive) =>
      archive.source_cloud_archive_id === id &&
      archive.local_role === "cloud-offline-cache",
  );
  if (cache) return cache.id;

  const mapped = ownedArchives.find(
    (archive) => archive.source_cloud_archive_id === id,
  );
  return mapped?.id || null;
}

export function parseAndroidShellPath(
  pathname: string,
  search = "",
): AndroidShellRoute | null {
  const path = pathname.replace(/\/+$/, "") || "/";
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);

  if (path === "/archive" || path === "/local/archive") return { kind: "list" };
  if (path === "/profile") return { kind: "profile" };
  if (path === "/profile/project-categories") return { kind: "project-categories" };
  if (path === "/discover") return { kind: "activity" };
  if (path === "/discover/search") return { kind: "discover-search" };
  if (path === "/experience") return { kind: "experience" };
  if (path === "/follow") return { kind: "following" };
  if (path === "/market") return { kind: "market" };
  if (path === "/plant") return { kind: "guides" };

  const localArchive = path.match(/^\/local\/archive\/([^/]+)$/);
  if (localArchive) return { kind: "local-archive", id: localArchive[1] };

  const cloudArchive = path.match(/^\/archive\/([^/]+)$/);
  if (cloudArchive) return { kind: "archive", id: cloudArchive[1] };

  const plantGuide = path.match(/^\/plant\/(?:guide\/)?([^/]+)$/);
  if (plantGuide) return { kind: "guide-detail", id: decodeURIComponent(plantGuide[1]) };

  if (isAndroidShellNetworkRequiredPath(path)) {
    return { kind: "network-required" };
  }

  if (params.get("tab") === "following" && path === "/discover") {
    return { kind: "following" };
  }

  return null;
}
