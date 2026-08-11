import { useLanguage } from "@/lib/i18n/useLanguage";

export function DiscoverEmptyState({
  filterMode,
  activeFilterLabel,
}: {
  filterMode: string;
  activeFilterLabel: string;
}) {
  const { t } = useLanguage();

  return (
    <div
      style={{
        padding: "34px 16px",
        textAlign: "center",
        color: "#768476",
        fontSize: 14,
        background: "#fff",
        border: "1px solid #edf2ea",
        borderRadius: 16,
      }}
    >
      {filterMode === "help"
        ? t.discover.grid.empty_public_help
        : `${t.discover.grid.empty_public_prefix}${activeFilterLabel === t.discover.filters.all ? "" : activeFilterLabel}${t.discover.grid.empty_public_suffix}`}
    </div>
  );
}
