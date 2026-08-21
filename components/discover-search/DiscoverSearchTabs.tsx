import { useLanguage } from "@/lib/i18n/useLanguage";

export type ActivitySearchScope = "all" | "projects" | "records";

export default function DiscoverSearchTabs({
  value,
  onChange,
}: {
  value: ActivitySearchScope;
  onChange: (value: ActivitySearchScope) => void;
}) {
  const { t } = useLanguage();
  const options: Array<{ value: ActivitySearchScope; label: string }> = [
    { value: "all", label: t.discover.search_ui.all },
    { value: "projects", label: t.discover.search_ui.projects },
    { value: "records", label: t.discover.search_ui.records },
  ];

  return (
    <nav
      aria-label={t.discover.search_ui.search_type}
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
        gap: 6,
        marginBottom: 10,
        padding: 0,
        background: "transparent",
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
              minHeight: 36,
              border: active ? "1px solid #8fb18a" : "1px solid #dce5d9",
              borderRadius: 999,
              background: active ? "#eef7eb" : "#fff",
              color: active ? "#31532f" : "#6c7869",
              boxShadow: "none",
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
