/** Guide-entry aggregate-only cap; public item details keep their own access rules. */
export const GUIDE_FREE_PREVIEW_LIMIT = 2;
export function guideAssociationPreview<T>(rows: readonly T[], hasVerifiedPlus: boolean) {
  return {
    items: hasVerifiedPlus ? [...rows] : rows.slice(0, GUIDE_FREE_PREVIEW_LIMIT),
    hasMore: !hasVerifiedPlus && rows.length > GUIDE_FREE_PREVIEW_LIMIT,
  };
}
