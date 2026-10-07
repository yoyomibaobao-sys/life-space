declare const __LIFESPACE_CLOUD_ORIGIN__: string | undefined;

export function getRuntimeCloudOrigin() {
  if (
    typeof __LIFESPACE_CLOUD_ORIGIN__ !== "undefined" &&
    typeof __LIFESPACE_CLOUD_ORIGIN__ === "string" &&
    __LIFESPACE_CLOUD_ORIGIN__
  ) {
    return __LIFESPACE_CLOUD_ORIGIN__;
  }
  if (typeof window !== "undefined") return window.location.origin;
  return "";
}

export function resolveRuntimeCloudUrl(value: string) {
  const input = String(value || "").trim();
  if (!input) return input;
  if (/^https:\/\//i.test(input)) return input;
  const origin = getRuntimeCloudOrigin();
  if (!origin) return input;
  try {
    return new URL(input, origin).toString();
  } catch {
    return input;
  }
}
