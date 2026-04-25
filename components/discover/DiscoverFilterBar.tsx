import type { FilterMode, FilterOption } from "@/lib/discover-types";

export function DiscoverFilterBar({
  options,
  activeMode,
  onChange,
}: {
  options: FilterOption[];
  activeMode: FilterMode;
  onChange: (mode: FilterMode) => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        marginBottom: 14,
        overflowX: "auto",
        paddingBottom: 2,
      }}
    >
      {options.map((option) => {
        const active = activeMode === option.value;

        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            style={{
              padding: "8px 13px",
              borderRadius: 999,
              border: active ? "1px solid #8bc58b" : "1px solid #e2e8df",
              background: active ? "#f0fff4" : "#fff",
              color: active ? "#2e7d32" : "#314131",
              cursor: "pointer",
              whiteSpace: "nowrap",
              fontSize: 13,
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
