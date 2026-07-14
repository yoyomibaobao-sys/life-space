const MEDIA_BUCKET = "media";
export const MEDIA_SIGNED_URL_EXPIRES_IN = 60 * 60;

const MEDIA_OBJECT_URL_MARKERS = [
  "/storage/v1/object/public/media/",
  "/storage/v1/object/sign/media/",
  "/storage/v1/object/authenticated/media/",
  "/storage/v1/render/image/public/media/",
  "/storage/v1/render/image/sign/media/",
  "/storage/v1/render/image/authenticated/media/",
] as const;

type SignedUrlRow = {
  path?: string | null;
  signedUrl?: string | null;
};

type StorageBucketClient = {
  createSignedUrl: (
    path: string,
    expiresIn: number
  ) => Promise<{ data: { signedUrl: string } | null; error: unknown }>;
  createSignedUrls: (
    paths: string[],
    expiresIn: number
  ) => Promise<{ data: SignedUrlRow[] | null; error: unknown }>;
};

export type MediaUrlSupabaseClient = {
  storage: {
    from: (bucket: string) => StorageBucketClient;
  };
};

export type MediaUrlSource = {
  url?: string | null;
  file_url?: string | null;
  path?: string | null;
  storage_path?: string | null;
  thumb_url?: string | null;
  thumb_path?: string | null;
};

export type MediaDisplayUrls = {
  display_url: string | null;
  display_thumb_url: string | null;
};

function cleanPath(value?: string | null) {
  const next = String(value || "").trim();
  if (!next || /^https?:\/\//i.test(next)) return null;

  const clean = next.replace(/^\/+/, "").replace(/^media\//, "");
  if (!clean || clean.split("/").some((segment) => segment === "." || segment === "..")) {
    return null;
  }

  return clean;
}

export function getMediaStoragePathFromUrl(url?: string | null) {
  if (!url) return null;

  try {
    const parsed = new URL(url);
    const marker = MEDIA_OBJECT_URL_MARKERS.find((item) =>
      parsed.pathname.includes(item)
    );
    if (!marker) return null;

    const markerIndex = parsed.pathname.indexOf(marker);
    const rawPath = parsed.pathname.slice(markerIndex + marker.length);
    if (!rawPath) return null;
    const decodedPath = decodeURIComponent(rawPath).replace(/^\/+/, "");
    return cleanPath(decodedPath);
  } catch {
    return null;
  }
}

export function getMediaObjectPath(source: MediaUrlSource) {
  return (
    cleanPath(source.storage_path) ||
    cleanPath(source.path) ||
    getMediaStoragePathFromUrl(source.url) ||
    getMediaStoragePathFromUrl(source.file_url)
  );
}

export function getMediaThumbObjectPath(source: MediaUrlSource) {
  return cleanPath(source.thumb_path) || getMediaStoragePathFromUrl(source.thumb_url);
}

export async function createMediaSignedUrl(
  supabase: MediaUrlSupabaseClient,
  path: string | null | undefined,
  expiresIn = MEDIA_SIGNED_URL_EXPIRES_IN
) {
  const safePath = cleanPath(path);
  if (!safePath) return null;

  const { data, error } = await supabase.storage
    .from(MEDIA_BUCKET)
    .createSignedUrl(safePath, expiresIn);

  if (error) return null;
  return data?.signedUrl || null;
}

export async function createMediaSignedUrls(
  supabase: MediaUrlSupabaseClient,
  paths: Array<string | null | undefined>,
  expiresIn = MEDIA_SIGNED_URL_EXPIRES_IN
) {
  const uniquePaths = Array.from(
    new Set(paths.map(cleanPath).filter((path): path is string => Boolean(path)))
  );
  const signedUrlMap = new Map<string, string>();

  if (uniquePaths.length === 0) return signedUrlMap;

  const bucket = supabase.storage.from(MEDIA_BUCKET);

  const { data, error } = await bucket.createSignedUrls(uniquePaths, expiresIn);
  if (!error && data) {
    data.forEach((row) => {
      if (row.path && row.signedUrl) {
        signedUrlMap.set(row.path, row.signedUrl);
      }
    });
  }

  return signedUrlMap;
}

export async function resolveMediaDisplayUrl(
  supabase: MediaUrlSupabaseClient,
  source: MediaUrlSource,
  options?: { preferThumb?: boolean; expiresIn?: number }
) {
  const preferThumb = Boolean(options?.preferThumb);
  const path = preferThumb
    ? getMediaThumbObjectPath(source) || getMediaObjectPath(source)
    : getMediaObjectPath(source);
  const signedUrl = await createMediaSignedUrl(supabase, path, options?.expiresIn);

  return signedUrl;
}

export async function resolveMediaDisplayUrls(
  supabase: MediaUrlSupabaseClient,
  sources: MediaUrlSource[],
  options?: { preferThumb?: boolean; expiresIn?: number }
) {
  const preferThumb = Boolean(options?.preferThumb);
  const paths = sources.map((source) =>
    preferThumb
      ? getMediaThumbObjectPath(source) || getMediaObjectPath(source)
      : getMediaObjectPath(source)
  );
  const signedUrlMap = await createMediaSignedUrls(supabase, paths, options?.expiresIn);

  return sources.map((source, index) => {
    const path = cleanPath(paths[index]);
    return (path && signedUrlMap.get(path)) || null;
  });
}

export async function resolveMediaDisplayPairs<T extends MediaUrlSource>(
  supabase: MediaUrlSupabaseClient,
  sources: T[],
  options?: { expiresIn?: number }
) {
  const paths = sources.flatMap((source) => [
    getMediaObjectPath(source),
    getMediaThumbObjectPath(source),
  ]);
  const signedUrlMap = await createMediaSignedUrls(supabase, paths, options?.expiresIn);

  return sources.map((source) => {
    const imagePath = getMediaObjectPath(source);
    const thumbPath = getMediaThumbObjectPath(source);
    const displayUrl =
      (imagePath && signedUrlMap.get(imagePath)) || null;
    const displayThumbUrl =
      (thumbPath && signedUrlMap.get(thumbPath)) ||
      displayUrl;

    return {
      display_url: displayUrl || null,
      display_thumb_url: displayThumbUrl || null,
    } satisfies MediaDisplayUrls;
  });
}

export async function attachMediaDisplayUrls<T extends MediaUrlSource>(
  supabase: MediaUrlSupabaseClient,
  sources: T[],
  options?: { expiresIn?: number }
) {
  const pairs = await resolveMediaDisplayPairs(supabase, sources, options);
  return sources.map((source, index) => ({
    ...source,
    ...pairs[index],
  }));
}
