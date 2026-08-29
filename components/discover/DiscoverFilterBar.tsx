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
        gap: compactMobile ? 5 : 8,
        marginBottom: compactMobile ? 8 : 14,
        overflowX: "auto",
        paddingBottom: 2,
        scrollbarWidth: "none",
        WebkitOverflowScrolling: "touch",
      }}
    >
      {options.map((option, index) => {
        const active = activeMode === option.value;
        const isHelpFilter = option.value === "help";
        const fixedAll = compactMobile && index === 0;

        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            style={{
              position: fixedAll ? "sticky" : undefined,
              left: fixedAll ? 0 : undefined,
              zIndex: fixedAll ? 2 : undefined,
              flex: "0 0 auto",
              minWidth: compactMobile ? "max-content" : 0,
              minHeight: compactMobile ? 32 : undefined,
              padding: compactMobile
                ? "5px 9px"
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
              wordBreak: "keep-all",
              lineHeight: compactMobile ? 1.2 : undefined,
              fontSize: 13,
              fontWeight: isHelpFilter || active ? 600 : 400,
              boxShadow: fixedAll ? "4px 0 8px rgba(246,248,243,0.95)" : undefined,
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
