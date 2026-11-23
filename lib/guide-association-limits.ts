export function guideAssociationPreview<T>(rows: readonly T[], signedIn: boolean) {
  return { items: signedIn ? [...rows] : [], hasMore: false };
}
