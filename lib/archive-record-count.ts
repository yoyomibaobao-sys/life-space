// archives.record_count includes private records. Public surfaces already
// count only public records; a visitor header must use the same boundary.
export function displayedArchiveRecordCount(input: {
  viewer: "owner" | "visitor";
  storedCount: number;
  visibleCount: number;
}) {
  const visible = Math.max(0, Number(input.visibleCount) || 0);
  if (input.viewer === "visitor") return visible;
  const stored = Number(input.storedCount) || 0;
  return stored > 0 ? stored : visible;
}
