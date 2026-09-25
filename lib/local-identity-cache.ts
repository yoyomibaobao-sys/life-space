"use client";

import type { MyMembership } from "@/lib/membership";

export const LOCAL_IDENTITY_CACHE_PREFIX = "lifespace_shell_identity_v1:";

const AVATAR_THUMB_SIZE = 96;
const AVATAR_THUMB_MAX_BYTES = 180_000;

export type CachedSpaceProfile = {
  username: string | null;
  avatar_url: string | null;
  avatar_data_url?: string | null;
  storage_used: number | null;
  storage_limit: number | null;
};

export type LocalIdentityCache = {
  userId?: string;
  profile: CachedSpaceProfile | null;
  membership: MyMembership | null;
  experienceCardCount: number;
};

export function identityCacheKey(userId: string) {
  return `${LOCAL_IDENTITY_CACHE_PREFIX}${userId}`;
}

export function readLocalIdentityCache(userId?: string | null): LocalIdentityCache | null {
  if (!userId) return null;
  try {
    const raw = window.localStorage.getItem(identityCacheKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LocalIdentityCache>;
    return {
      userId,
      profile: (parsed.profile || null) as CachedSpaceProfile | null,
      membership: (parsed.membership || null) as MyMembership | null,
      experienceCardCount: Math.max(0, Number(parsed.experienceCardCount || 0)),
    };
  } catch {
    return null;
  }
}

export function writeLocalIdentityCache(userId: string, value: LocalIdentityCache) {
  try {
    window.localStorage.setItem(
      identityCacheKey(userId),
      JSON.stringify({
        userId,
        profile: value.profile,
        membership: value.membership,
        experienceCardCount: value.experienceCardCount,
      })
    );
  } catch {
    // Identity cache is optional; local projects stay usable.
  }
}

export function clearLocalIdentityCache(userId?: string | null) {
  if (!userId) return;
  try {
    window.localStorage.removeItem(identityCacheKey(userId));
  } catch {
    // Explicit sign-out still clears in-memory identity even if storage is unavailable.
  }
}

export function recoverStoredOwnerFromIdentityCache(): { userId: string; email: string | null } | null {
  if (typeof window === "undefined") return null;

  const owners: { userId: string; email: string | null }[] = [];
  try {
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (!key?.startsWith(LOCAL_IDENTITY_CACHE_PREFIX)) continue;
      const userId = key.slice(LOCAL_IDENTITY_CACHE_PREFIX.length).trim();
      if (!userId) continue;
      owners.push({ userId, email: null });
      if (owners.length > 1) return null;
    }
  } catch {
    return null;
  }

  return owners.length === 1 ? owners[0] : null;
}

export function displayAvatarUrl(profile?: CachedSpaceProfile | null) {
  return profile?.avatar_data_url || profile?.avatar_url || null;
}

export async function cacheAvatarThumbnail(
  avatarUrl?: string | null,
  previousDataUrl?: string | null
): Promise<string | null> {
  const url = typeof avatarUrl === "string" ? avatarUrl.trim() : "";
  if (!url) return null;
  if (url.startsWith("data:image/")) return url;

  try {
    const response = await fetch(url, { cache: "force-cache", credentials: "omit" });
    if (!response.ok) return previousDataUrl || null;
    const blob = await response.blob();
    if (!blob.size || !blob.type.startsWith("image/")) return previousDataUrl || null;
    const dataUrl = await blobToThumbnailDataUrl(blob);
    if (dataUrl && dataUrl.length <= AVATAR_THUMB_MAX_BYTES * 1.4) return dataUrl;
    return previousDataUrl || null;
  } catch {
    return previousDataUrl || null;
  }
}

export async function persistLocalIdentityFromLiveProfile(
  userId: string,
  live: {
    profile: CachedSpaceProfile | null;
    membership: MyMembership | null;
    experienceCardCount: number;
  }
) {
  const previous = readLocalIdentityCache(userId);
  const sameAvatar = previous?.profile?.avatar_url === live.profile?.avatar_url;
  const avatar_data_url = live.profile
    ? sameAvatar && previous?.profile?.avatar_data_url
      ? previous.profile.avatar_data_url
      : await cacheAvatarThumbnail(
          live.profile.avatar_url,
          sameAvatar ? previous?.profile?.avatar_data_url : null
        )
    : null;
  const profile = live.profile
    ? { ...live.profile, avatar_data_url }
    : null;
  writeLocalIdentityCache(userId, {
    userId,
    profile,
    membership: live.membership,
    experienceCardCount: live.experienceCardCount,
  });
  return profile;
}

function blobToThumbnailDataUrl(blob: Blob): Promise<string | null> {
  return new Promise((resolve) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(blob);
    image.onload = () => {
      try {
        const scale = Math.min(
          1,
          AVATAR_THUMB_SIZE / Math.max(image.width || AVATAR_THUMB_SIZE, image.height || AVATAR_THUMB_SIZE)
        );
        const width = Math.max(1, Math.round((image.width || AVATAR_THUMB_SIZE) * scale));
        const height = Math.max(1, Math.round((image.height || AVATAR_THUMB_SIZE) * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        if (!context) {
          resolve(null);
          return;
        }
        context.drawImage(image, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.72));
      } catch {
        resolve(null);
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(null);
    };
    image.src = objectUrl;
  });
}

export const readShellIdentityCache = readLocalIdentityCache;
export const writeShellIdentityCache = writeLocalIdentityCache;
export const clearShellIdentityCache = clearLocalIdentityCache;
export const SHELL_IDENTITY_CACHE_PREFIX = LOCAL_IDENTITY_CACHE_PREFIX;
