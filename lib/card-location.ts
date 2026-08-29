type CompactCardLocationInput = {
  city?: string | null;
  region?: string | null;
  country?: string | null;
  fallback?: string | null;
};

const LOCATION_SUFFIX_RE = /(市|县|縣|区|區|省|州|県|道|府)$/u;
const LOCATION_SEPARATORS_RE = /\s*(?:·|•|,|，|\/|＞|>|—|–|\|)\s*/u;

function compactLocationPart(value?: string | null) {
  const clean = value?.trim();
  if (!clean) return "";
  return clean.replace(LOCATION_SUFFIX_RE, "").trim();
}

function compactFallback(value?: string | null) {
  const clean = value?.trim();
  if (!clean) return "";

  const parts = clean
    .split(LOCATION_SEPARATORS_RE)
    .map((part) => part.trim())
    .filter(Boolean);

  return compactLocationPart(parts.at(-1) || clean);
}

export function getCompactCardLocation({
  city,
  region,
  country,
  fallback,
}: CompactCardLocationInput) {
  return (
    compactLocationPart(city) ||
    compactLocationPart(region) ||
    compactLocationPart(country) ||
    compactFallback(fallback)
  );
}
