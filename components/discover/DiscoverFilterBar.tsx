import type { FilterMode, FilterOption } from "@/lib/discover-types";
import UiIcon from "@/components/ui/UiIcon";

export function DiscoverFilterBar({
  options,
  activeMode,
  helpOnly = false,
  onChange,
  compactMobile = false,
}: {
  options: FilterOption[];
  activeMode: FilterMode;
  helpOnly?: boolean;
  onChange: (mode: FilterMode) => void;
  compactMobile?: boolean;
}) {
  const categoryOptions = options.filter((option) => option.value !== "help");
  const helpOption = options.find((option) => option.value === "help");

  if (compactMobile) {
    return (
      <div style={{ marginBottom: 7 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
            gap: 4,
          }}
        >
          {categoryOptions.map((option) => {
            const active = activeMode === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => onChange(option.value)}
                style={{
                  minWidth: 0,
                  minHeight: 38,
                  padding: "4px 2px",
                  overflow: "hidden",
                  borderRadius: 999,
                  border: active ? "1px solid #8bc58b" : "1px solid #e2e8df",
                  background: active ? "#f0fff4" : "#fff",
                  color: active ? "#2e7d32" : "#314131",
                  cursor: "pointer",
                  whiteSpace: "normal",
                  wordBreak: "keep-all",
                  lineHeight: 1.12,
                  fontSize: 13,
                  fontWeight: active ? 700 : 500,
                }}
              >
                {option.label}
              </button>
            );
          })}
        </div>

        {helpOption ? (
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 5 }}>
            <button
              type="button"
              aria-pressed={helpOnly}
              onClick={() => onChange("help")}
              style={{
                minHeight: 28,
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                padding: "3px 9px",
                borderRadius: 999,
                border: helpOnly ? "1px solid #d18a68" : "1px solid #efd8cc",
                background: helpOnly ? "#fde8dc" : "#fffaf6",
                color: "#a65f45",
                cursor: "pointer",
                fontSize: 12.5,
                fontWeight: helpOnly ? 750 : 600,
                lineHeight: 1.2,
              }}
            >
              <UiIcon name={helpOnly ? "check" : "warning"} size={13} strokeWidth={2} />
              {helpOption.label}
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        marginBottom: 14,
        overflowX: "auto",
        paddingBottom: 2,
        scrollbarWidth: "none",
        WebkitOverflowScrolling: "touch",
      }}
    >
      {options.map((option) => {
        const isHelpFilter = option.value === "help";
        const active = isHelpFilter ? helpOnly : activeMode === option.value;

        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            style={{
              flex: "0 0 auto",
              minWidth: 0,
              padding: isHelpFilter
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
