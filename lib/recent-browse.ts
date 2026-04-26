export type RecentArchiveBrowseItem = {
  id: string;
  title: string;
  systemName?: string | null;
  category?: string | null;
  userId?: string | null;
  viewedAt: number;
};

const RECENT_ARCHIVE_BROWSE_KEY = "life_space_recent_archives";
const MAX_RECENT_ARCHIVES = 20;

export function getRecentArchiveBrowseItems(): RecentArchiveBrowseItem[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(RECENT_ARCHIVE_BROWSE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((item) => item && typeof item.id === "string")
      .slice(0, MAX_RECENT_ARCHIVES);
  } catch {
    return [];
  }
}

export function saveRecentArchiveBrowse(item: {
  id: string;
  title?: string | null;
  systemName?: string | null;
  category?: string | null;
  userId?: string | null;
}) {
  if (typeof window === "undefined") return;
  if (!item.id) return;

  const current = getRecentArchiveBrowseItems();

  const nextItem: RecentArchiveBrowseItem = {
    id: item.id,
    title: item.title || "未命名项目",
    systemName: item.systemName || null,
    category: item.category || null,
    userId: item.userId || null,
    viewedAt: Date.now(),
  };

  const next = [
    nextItem,
    ...current.filter((oldItem) => oldItem.id !== item.id),
  ].slice(0, MAX_RECENT_ARCHIVES);

  window.localStorage.setItem(RECENT_ARCHIVE_BROWSE_KEY, JSON.stringify(next));
}

export function clearRecentArchiveBrowseItems() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(RECENT_ARCHIVE_BROWSE_KEY);
}