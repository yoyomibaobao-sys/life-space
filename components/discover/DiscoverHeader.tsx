export function DiscoverHeader() {
  return (
    <header style={{ marginBottom: 14 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 12,
          marginBottom: 12,
        }}
      >
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#1f2d1f" }}>
            发现大家的耕作项目
          </div>
        </div>
      </div>

      <a
        href="/discover/search"
        style={{
          width: "100%",
          display: "block",
          textAlign: "left",
          color: "#6f7f6f",
          background: "#fff",
          border: "1px solid #e6ece3",
          borderRadius: 999,
          padding: "10px 14px",
          fontSize: 14,
          boxShadow: "0 1px 8px rgba(0,0,0,0.03)",
          cursor: "pointer",
          textDecoration: "none",
          boxSizing: "border-box",
        }}
      >
        🔍 搜索记录
      </a>
    </header>
  );
}
