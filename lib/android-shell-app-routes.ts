export type AndroidShellRouteKind =
  | "list"
  | "profile"
  | "activity"
  | "discover-search"
  | "experience"
  | "following"
  | "market"
  | "guides"
  | "guide-detail"
  | "public-archive"
  | "local-archive"
  | "network-required";

export type AndroidShellRoute = {
  kind: AndroidShellRouteKind;
  id?: string;
};

export function parseAndroidShellPath(
  pathname: string,
  search = "",
): AndroidShellRoute | null {
  const path = pathname.replace(/\/+$/, "") || "/";
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);

  if (path === "/archive" || path === "/local/archive") return { kind: "list" };
  if (path === "/profile") return { kind: "profile" };
  if (path === "/discover") return { kind: "activity" };
  if (path === "/discover/search") return { kind: "discover-search" };
  if (path === "/experience") return { kind: "experience" };
  if (path === "/follow") return { kind: "following" };
  if (path === "/market") return { kind: "market" };
  if (path === "/plant") return { kind: "guides" };

  const localArchive = path.match(/^\/local\/archive\/([^/]+)$/);
  if (localArchive) return { kind: "local-archive", id: localArchive[1] };

  const cloudArchive = path.match(/^\/archive\/([^/]+)$/);
  if (cloudArchive) return { kind: "public-archive", id: cloudArchive[1] };

  const plantGuide = path.match(/^\/plant\/(?:guide\/)?([^/]+)$/);
  if (plantGuide) return { kind: "guide-detail", id: decodeURIComponent(plantGuide[1]) };

  if (
    path.startsWith("/membership") ||
    path.startsWith("/admin") ||
    path.startsWith("/market/") ||
    path.startsWith("/experience-cards") ||
    path.startsWith("/profile/")
  ) {
    return { kind: "network-required" };
  }

  if (params.get("tab") === "following" && path === "/discover") {
    return { kind: "following" };
  }

  return null;
}
