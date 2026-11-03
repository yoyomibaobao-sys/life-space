export const GUIDE_PAGE_SIZE = 24;
export const GUIDE_FREE_TARGET = 3; // two visible entries plus one for unlock indication

export type GuidePage<T> = { data: T[] | null; error?: unknown | null };
export type GuidePageResult<T> = { items: T[]; hasMore: boolean };

/** Server-paged, stable-order scan. Verify public status BEFORE counting.
 * Fetches beyond false/private/duplicate candidates, including after page 1.
 * A Free caller stops at 3 legal rows; Plus scans all pages without a hard cap.
 * The caller must still enforce server RLS/Owner and stable .order(id).
 */
export async function scanGuidePages<T extends { id: string }>({
  loadPage,
  accept = async () => true,
  target = Number.POSITIVE_INFINITY,
  pageSize = GUIDE_PAGE_SIZE,
}: {
  loadPage: (from: number, to: number) => Promise<GuidePage<T>>;
  accept?: (row: T) => boolean | Promise<boolean>;
  target?: number;
  pageSize?: number;
}): Promise<GuidePageResult<T>> {
  if (!Number.isInteger(pageSize) || pageSize < 1 || target < 1) throw Error("Invalid guide paging limits");
  const seen = new Set<string>();
  const items: T[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await loadPage(from, from + pageSize - 1);
    if (error) throw Error("Guide association page could not be read");
    const page = data || [];
    if (!Array.isArray(page)) throw Error("Invalid guide association response");
    for (const item of page) {
      if (!item?.id || seen.has(item.id)) continue;
      seen.add(item.id);
      if (await accept(item)) {
        items.push(item);
        if (items.length >= target) return { items, hasMore: true };
      }
    }
    if (page.length < pageSize) return { items, hasMore: false };
    from += pageSize;
  }
}
