const guardedPath = "/api/media/record-image";

export function guardedRecordImagePath(source) {
  if (typeof source !== "string" || !source.startsWith(guardedPath + "?")) return null;
  return source;
}

export async function fetchGuardedRecordImage(source, accessToken, signal) {
  const path = guardedRecordImagePath(source);
  if (!path) return null;

  const response = await fetch(path, {
    cache: "no-store",
    credentials: "omit",
    redirect: "error",
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    signal,
  });
  if (!response.ok || !response.headers.get("content-type")?.startsWith("image/")) return null;
  const blob = await response.blob();
  return blob.size ? blob : null;
}
