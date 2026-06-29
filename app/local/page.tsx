import Link from "next/link";

export default function LocalModePage() {
  return (
    <main
      style={{
        minHeight: "calc(100vh - 70px)",
        padding: "36px 20px",
        background: "#fbfcf7",
        color: "#263326",
      }}
    >
      <section
        style={{
          maxWidth: 720,
          margin: "0 auto",
          padding: 24,
          borderRadius: 18,
          border: "1px solid #e0ead8",
          background: "#fff",
          boxShadow: "0 12px 32px rgba(75, 95, 62, 0.08)",
        }}
      >
        <div style={{ color: "#6c7a63", fontSize: 13, marginBottom: 8 }}>
          临时本地使用
        </div>
        <h1 style={{ margin: "0 0 14px", fontSize: 28 }}>先本地使用</h1>
        <p style={{ margin: 0, lineHeight: 1.9, color: "#4f5d4a" }}>
          本地离线模式指 App 私有存储中的项目、记录和图片缓存，不会默认写入系统相册，也不会上传云端或进入发现页。
          真正的离线记录、图片缓存和后续同步会在 App 内逐步完成；当前网页端仍建议注册 / 登录后使用云端档案。
        </p>

        <div
          style={{
            marginTop: 18,
            padding: 14,
            borderRadius: 14,
            background: "#f6faf3",
            border: "1px solid #e3eddb",
            color: "#5f6f58",
            lineHeight: 1.8,
            fontSize: 14,
          }}
        >
          开通云空间后，本地数据应同步为云空间私密；上传云空间不等于公开，旧记录不会自动公开。
        </div>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 24 }}>
          <Link href="/register" style={primaryLinkStyle}>
            注册账号
          </Link>
          <Link href="/login" style={secondaryLinkStyle}>
            登录
          </Link>
          <Link href="/" style={ghostLinkStyle}>
            返回首页
          </Link>
        </div>
      </section>
    </main>
  );
}

const primaryLinkStyle = {
  padding: "11px 18px",
  borderRadius: 999,
  background: "#3f7d3d",
  color: "#fff",
  textDecoration: "none",
  fontSize: 14,
  fontWeight: 700,
};

const secondaryLinkStyle = {
  padding: "11px 18px",
  borderRadius: 999,
  background: "#eef6e8",
  color: "#2f5f2d",
  textDecoration: "none",
  fontSize: 14,
  fontWeight: 700,
};

const ghostLinkStyle = {
  padding: "11px 18px",
  borderRadius: 999,
  background: "#fff",
  color: "#6f7b69",
  border: "1px solid #e0e8dc",
  textDecoration: "none",
  fontSize: 14,
  fontWeight: 700,
};
