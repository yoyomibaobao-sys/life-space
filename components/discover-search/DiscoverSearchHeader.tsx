export default function DiscoverSearchHeader() {
  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        marginBottom: 10,
      }}
    >
      <div style={{ fontSize: 22, fontWeight: 700, color: "#1f2d1f" }}>
        搜索记录
      </div>

      <a
        href="/discover"
        style={{
          display: "inline-flex",
          alignItems: "center",
          color: "#6f7f6f",
          fontSize: 13,
          textDecoration: "none",
          whiteSpace: "nowrap",
        }}
      >
        ← 返回发现
      </a>
    </header>
  );
}
