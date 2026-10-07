export type AndroidShellRouteKind =
  | "list"
  | "profile"
  | "project-categories"
  | "activity"
  | "discover-search"
  | "experience"
  | "my-experience"
  | "experience-detail"
  | "following"
  | "market"
  | "market-mine"
  | "market-new"
  | "market-detail"
  | "guides"
  | "interests"
  | "plant-detail"
  | "guide-detail"
  | "archive"
  | "local-archive"
  | "recent"
  | "trash"
  | "membership-payment"
  | "membership-refund"
  | "membership-benefits"
  | "data-security"
  | "legal"
  | "legal-page"
  | "feedback"
  | "app-update"
  | "login"
  | "admin-memberships"
  | "admin-guides"
  | "admin-support"
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

export type AndroidRouteCapability = "local" | "hybrid" | "online-controller" | "online-web" | "unsupported";

const WEB_ROUTES = [
  /^\/membership(?:\/|$)/, /^\/admin(?:\/|$)/,
  /^\/profile\/(?:helpful|flowers|account|backup|export|orders|followers)(?:\/|$)/,
  /^\/user(?:\/|$)/, /^\/legal(?:\/|$)/, /^\/feedback(?:\/|$)/,
  /^\/(?:reset-password|auth|download|app-update|notifications|report)(?:\/|$)/,
  /^\/market\/[^/]+\/edit(?:\/|$)/,
];

export function getAndroidRouteCapability(pathname: string): AndroidRouteCapability {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path === "/profile/recent" || path === "/profile/trash" || path === "/profile" ||
      path === "/archive" || path === "/local/archive" || path === "/archive/interests" || path === "/profile/project-categories" ||
      path === "/feedback" || path === "/app-update" || path === "/membership/payment" || path === "/membership/refund" ||
      /^\/local\/archive\//.test(path) || /^\/plant\//.test(path)) return "hybrid";
  if (path === "/login" || path === "/register" || path === "/admin/memberships" ||
      path === "/admin/guides" || path === "/admin/support") return "online-controller";
  if (path === "/plant" || path === "/" || path === "/membership/benefits" || path === "/profile/data-security" || path === "/legal" ||
      /^\/legal\/(?:privacy|terms|refunds|contact)$/.test(path)) return "local";
  if (path === "/discover" || path === "/discover/search" || path === "/experience" ||
      path === "/experience-cards" || /^\/experience-cards\/[^/]+$/.test(path) || path === "/follow" || path === "/market" ||
      path === "/market/mine" || path === "/market/new" || /^\/market\/[^/]+$/.test(path) || /^\/archive\//.test(path)) return "online-controller";
  if (WEB_ROUTES.some((pattern) => pattern.test(path))) return "online-web";
  return "unsupported";
}

export function isAndroidShellNetworkRequiredPath(pathname: string) {
  return getAndroidRouteCapability(pathname) === "online-web";
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
  if (path === "/profile/recent") return { kind: "recent" };
  if (path === "/profile/trash") return { kind: "trash" };
  if (path === "/membership/payment") return { kind: "membership-payment" };
  if (path === "/membership/refund") return { kind: "membership-refund" };
  if (path === "/membership/benefits") return { kind: "membership-benefits" };
  if (path === "/profile/data-security") return { kind: "data-security" };
  if (path === "/legal") return { kind: "legal" };
  const legalPage = path.match(/^\/legal\/(privacy|terms|refunds|contact)$/);
  if (legalPage) return { kind: "legal-page", id: legalPage[1] };
  if (path === "/feedback") return { kind: "feedback" };
  if (path === "/app-update") return { kind: "app-update" };
  if (path === "/login" || path === "/register") return { kind: "login", id: params.get("returnTo") || params.get("next") || "" };
  if (path === "/admin/memberships") return { kind: "admin-memberships" };
  if (path === "/admin/guides") return { kind: "admin-guides" };
  if (path === "/admin/support") return { kind: "admin-support" };
  if (path === "/discover") return { kind: "activity" };
  if (path === "/discover/search") return { kind: "discover-search" };
  if (path === "/experience") return { kind: "experience" };
  if (path === "/experience-cards") return { kind: "my-experience" };
  const experienceDetail = path.match(/^\/experience-cards\/([^/]+)$/);
  if (experienceDetail) return { kind: "experience-detail", id: decodeURIComponent(experienceDetail[1]) };
  if (path === "/follow") return { kind: "following" };
  if (path === "/market") return { kind: "market" };
  if (path === "/market/mine") return { kind: "market-mine" };
  if (path === "/market/new") return { kind: "market-new" };
  const marketDetail = path.match(/^\/market\/([^/]+)$/);
  if (marketDetail) return { kind: "market-detail", id: decodeURIComponent(marketDetail[1]) };
  if (path === "/plant") return { kind: "guides" };
  if (path === "/archive/interests") return { kind: "interests", id: params.get("section") || "plant" };

  const localArchive = path.match(/^\/local\/archive\/([^/]+)$/);
  if (localArchive) return { kind: "local-archive", id: localArchive[1] };

  const cloudArchive = path.match(/^\/archive\/([^/]+)$/);
  if (cloudArchive) return { kind: "archive", id: cloudArchive[1] };

  const plantGuide = path.match(/^\/plant\/guide\/([^/]+)$/);
  if (plantGuide) return { kind: "guide-detail", id: decodeURIComponent(plantGuide[1]) };

  const plantDetail = path.match(/^\/plant\/([^/]+)$/);
  if (plantDetail) return { kind: "plant-detail", id: decodeURIComponent(plantDetail[1]) };

  if (isAndroidShellNetworkRequiredPath(path)) {
    return { kind: "network-required" };
  }

  if (params.get("tab") === "following" && path === "/discover") {
    return { kind: "following" };
  }

  return null;
}
