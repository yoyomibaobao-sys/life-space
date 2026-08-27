const HTTP_URL_PATTERN = /https?:\/\/[^\s<>{}\[\]"']+/i;

/**
 * Accepts a normal URL or share text such as `【淘宝】https://...` and returns
 * the first safe HTTP(S) URL. Trailing punctuation added by chat apps is
 * stripped without changing punctuation that belongs inside the URL.
 */
export function extractExternalHttpUrl(value?: string | null) {
  const raw = (value || "").trim();
  if (!raw) return "";

  const match = raw.match(HTTP_URL_PATTERN);
  if (!match) return "";

  const candidate = match[0].replace(/[，。；、！？，.;!?）)】\]]+$/u, "");

  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return url.toString();
  } catch {
    return "";
  }
}
