import type { FilterMode, FilterOption } from "@/lib/discover-types";

export function DiscoverFilterBar({
  options,
  activeMode,
  onChange,
  compactMobile = false,
}: {
  options: FilterOption[];
  activeMode: FilterMode;
  onChange: (mode: FilterMode) => void;
  compactMobile?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: compactMobile ? 4 : 8,
        marginBottom: compactMobile ? 10 : 14,
        overflowX: "auto",
        paddingBottom: compactMobile ? 0 : 2,
        WebkitOverflowScrolling: "touch",
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
              flex: "0 0 auto",
              padding: compactMobile
                ? isHelpFilter
                  ? "6px 9px"
                  : "6px 8px"
                : isHelpFilter
                ? "8px 14px"
                : "8px 13px",
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
              fontSize: compactMobile ? 12 : 13,
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
