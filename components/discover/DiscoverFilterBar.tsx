import type { FilterMode, FilterOption } from "@/lib/discover-types";
import filterStyles from "@/components/ui/CategoryFilterRow.module.css";

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
      <div className={`${filterStyles.row} ${filterStyles.withHelp}`}>
          {categoryOptions.map((option) => {
            const active = activeMode === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => onChange(option.value)}
                aria-pressed={active}
                className={filterStyles.button}
              >
                {/^[\u4e00-\u9fff]{4}$/.test(option.label) ? (
                  <>{option.label.slice(0, 2)}<br />{option.label.slice(2)}</>
                ) : option.label}
              </button>
            );
          })}
        {helpOption ? (
            <button
              type="button"
              aria-pressed={helpOnly}
              onClick={() => onChange("help")}
              className={`${filterStyles.button} ${filterStyles.help}`}
            >
              {helpOption.label}
            </button>
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
