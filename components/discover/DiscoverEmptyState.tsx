export function DiscoverEmptyState({
  filterMode,
  activeFilterLabel,
}: {
  filterMode: string;
  activeFilterLabel: string;
}) {
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
        ? "暂时没有公开的求助记录"
        : `还没有${activeFilterLabel === "全部" ? "" : activeFilterLabel}公开项目记录`}
      <div style={{ marginTop: 8, fontSize: 12, color: "#9aa59a" }}>
        当用户主动公开项目和记录后，会出现在这里。
      </div>
    </div>
  );
}
