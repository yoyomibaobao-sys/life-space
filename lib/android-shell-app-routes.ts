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
