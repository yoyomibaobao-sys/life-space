const MEDIA_BUCKET = "media";
const DEFAULT_MEDIA_SIGNED_URL_EXPIRES_IN = 60 * 60;

type SignedUrlRow = {
  path?: string | null;
  signedUrl?: string | null;
};

type StorageBucketClient = {
  createSignedUrl: (
    path: string,
    expiresIn: number
  ) => Promise<{ data: { signedUrl: string } | null; error: unknown }>;
  createSignedUrls?: (
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
  return next;
}

function cleanUrl(value?: string | null) {
  const next = String(value || "").trim();
  return /^https?:\/\//i.test(next) ? next : null;
}

export function getMediaStoragePathFromPublicUrl(url?: string | null) {
  if (!url) return null;

  try {
    const parsed = new URL(url);
    const marker = "/storage/v1/object/public/media/";
    const markerIndex = parsed.pathname.indexOf(marker);
    if (markerIndex === -1) return null;

    const rawPath = parsed.pathname.slice(markerIndex + marker.length);
    if (!rawPath) return null;
    return decodeURIComponent(rawPath);
  } catch {
    return null;
  }
}

export function getMediaObjectPath(source: MediaUrlSource) {
  return (
    cleanPath(source.storage_path) ||
    cleanPath(source.path) ||
    getMediaStoragePathFromPublicUrl(source.url) ||
    getMediaStoragePathFromPublicUrl(source.file_url)
  );
}

export function getMediaThumbObjectPath(source: MediaUrlSource) {
  return cleanPath(source.thumb_path) || getMediaStoragePathFromPublicUrl(source.thumb_url);
}

export function getMediaFallbackUrl(source: MediaUrlSource, preferThumb = false) {
  if (preferThumb) {
    return (
      cleanUrl(source.thumb_url) ||
      cleanUrl(source.url) ||
      cleanUrl(source.file_url)
    );
  }

  return (
    cleanUrl(source.url) ||
    cleanUrl(source.file_url) ||
    cleanUrl(source.thumb_url)
  );
}

export async function createMediaSignedUrl(
  supabase: MediaUrlSupabaseClient,
  path: string | null | undefined,
  expiresIn = DEFAULT_MEDIA_SIGNED_URL_EXPIRES_IN
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
  expiresIn = DEFAULT_MEDIA_SIGNED_URL_EXPIRES_IN
) {
  const uniquePaths = Array.from(
    new Set(paths.map(cleanPath).filter((path): path is string => Boolean(path)))
  );
  const signedUrlMap = new Map<string, string>();

  if (uniquePaths.length === 0) return signedUrlMap;

  const bucket = supabase.storage.from(MEDIA_BUCKET);

  if (typeof bucket.createSignedUrls === "function") {
    const { data, error } = await bucket.createSignedUrls(uniquePaths, expiresIn);
    if (!error && data) {
      data.forEach((row) => {
        if (row.path && row.signedUrl) {
          signedUrlMap.set(row.path, row.signedUrl);
        }
      });
    }
  }

  const missingPaths = uniquePaths.filter((path) => !signedUrlMap.has(path));
  await Promise.all(
    missingPaths.map(async (path) => {
      const signedUrl = await createMediaSignedUrl(supabase, path, expiresIn);
      if (signedUrl) signedUrlMap.set(path, signedUrl);
    })
  );

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

  return signedUrl || getMediaFallbackUrl(source, preferThumb);
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
    return (path && signedUrlMap.get(path)) || getMediaFallbackUrl(source, preferThumb);
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
      (imagePath && signedUrlMap.get(imagePath)) ||
      getMediaFallbackUrl(source, false);
    const displayThumbUrl =
      (thumbPath && signedUrlMap.get(thumbPath)) ||
      getMediaFallbackUrl(source, true) ||
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
