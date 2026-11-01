const ORIGIN = "https://life-space.uk";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** User-provided links never become external URLs or carry authentication tokens. */
export function safeSupportUrl(value?: string | null): string | null {
  const input = (value || "").trim();
  if (!input || /[\\\u0000-\u001f\u007f]/.test(input) || input.startsWith("//")) return null;
  if (!input.startsWith("/") && !input.startsWith(`${ORIGIN}/`)) return null;
  try {
    const url = new URL(input, ORIGIN);
    if (url.origin !== ORIGIN || url.username || url.password) return null;
    // Reject encoded control characters and backslashes as well.
    if (/[\\\u0000-\u001f\u007f]/.test(decodeURIComponent(url.pathname))) return null;
    const record = url.searchParams.get("record");
    return url.pathname + (record && UUID.test(record) ? `?record=${record.toLowerCase()}` : "");
  } catch {
    return null;
  }
}

export function getReportTarget(value?: string | null) {
  const path = safeSupportUrl(value);
  if (!path) return null;
  const url = new URL(path, ORIGIN);
  const match = url.pathname.match(/^\/archive\/([^/]+)\/?$/);
  const record = url.searchParams.get("record");
  if (!match || !UUID.test(match[1]) || !record || !UUID.test(record)) return null;
  const archiveId = match[1].toLowerCase();
  const id = record.toLowerCase();
  return { type: "record", id, url: `/archive/${archiveId}?record=${id}` };
}

export function buildReportHref(targetUrl: string) {
  const target = getReportTarget(targetUrl);
  return target ? `/report?target=${encodeURIComponent(target.url)}` : "/report";
}
