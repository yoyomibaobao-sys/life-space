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
        const isHelpFilter = option.value === "help";

        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            style={{
              padding: isHelpFilter ? "8px 14px" : "8px 13px",
              borderRadius: 999,
              border: isHelpFilter
                ? active
                  ? "1px solid #d59a7f"
                  : "1px solid #efd8cc"
                : active
                ? "1px solid #8bc58b"
                : "1px solid #e2e8df",
              background: isHelpFilter
                ? active
                  ? "#fff0e8"
                  : "#fffaf6"
                : active
                ? "#f0fff4"
                : "#fff",
              color: isHelpFilter ? "#a65f45" : active ? "#2e7d32" : "#314131",
              cursor: "pointer",
              whiteSpace: "nowrap",
              fontSize: 13,
              fontWeight: isHelpFilter || active ? 600 : 400,
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
