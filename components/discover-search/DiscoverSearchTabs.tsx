import type { DiscoverSearchKind } from "@/lib/discover-search-types";
import { useLanguage } from "@/lib/i18n/useLanguage";

export default function DiscoverSearchTabs({
  value,
  onChange,
}: {
  value: DiscoverSearchKind;
  onChange: (value: DiscoverSearchKind) => void;
}) {
  const { t } = useLanguage();
  const options: Array<{ value: DiscoverSearchKind; label: string }> = [
    { value: "projects", label: t.discover.search_ui.projects },
    { value: "records", label: t.discover.search_ui.records },
    { value: "experience", label: t.discover.search_ui.experience_cards },
  ];

  return (
    <nav
      aria-label={t.discover.search_ui.search_type}
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
        gap: 5,
        marginBottom: 10,
        padding: 4,
        borderRadius: 13,
        background: "#f0f4ed",
      }}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-current={active ? "page" : undefined}
            onClick={() => onChange(option.value)}
            style={{
              minHeight: 38,
              border: active ? "1px solid #d6e3d1" : "1px solid transparent",
              borderRadius: 10,
              background: active ? "#fff" : "transparent",
              color: active ? "#31532f" : "#6c7869",
              boxShadow: active ? "0 1px 4px rgba(41, 72, 39, 0.06)" : "none",
              fontSize: 14,
              fontWeight: active ? 800 : 650,
              cursor: "pointer",
            }}
          >
            {option.label}
          </button>
        );
      })}
    </nav>
  );
}
