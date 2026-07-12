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
        display: compactMobile ? "grid" : "flex",
        gridTemplateColumns: compactMobile
          ? `repeat(${options.length > 5 ? 3 : options.length}, minmax(0, 1fr))`
          : undefined,
        gap: compactMobile ? 6 : 8,
        marginBottom: compactMobile ? 10 : 14,
        overflowX: compactMobile ? "visible" : "auto",
        paddingBottom: compactMobile ? 0 : 2,
        WebkitOverflowScrolling: compactMobile ? undefined : "touch",
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
              flex: compactMobile ? undefined : "0 0 auto",
              minWidth: 0,
              minHeight: compactMobile ? 38 : undefined,
              padding: compactMobile
                ? isHelpFilter
                  ? "7px 6px"
                  : "7px 6px"
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
              whiteSpace: compactMobile ? "normal" : "nowrap",
              wordBreak: "keep-all",
              lineHeight: compactMobile ? 1.15 : undefined,
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
