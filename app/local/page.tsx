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
          你可以先在本机建立项目和记录，本轮只提供本机保存与查看。
        </p>

        <ul
          style={{
            margin: "18px 0 0",
            padding: "0 0 0 18px",
            color: "#4f5d4a",
            lineHeight: 1.85,
            fontSize: 14,
          }}
        >
          <li>免费使用，不需要先开通云空间。</li>
          <li>只保存在这台设备，不支持多设备同步。</li>
          <li>不上传云端，不进入发现页，也没有互动或发布入口。</li>
          <li>换设备、卸载 App、清理浏览器数据后，本地数据可能丢失。</li>
        </ul>

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
          当前版本不提供本地数据迁移操作；需要长期保存的重要资料，请定期自行导出备份。
        </div>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 24 }}>
          <Link href="/local/archive" style={primaryLinkStyle}>
            进入本地记录
          </Link>
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
