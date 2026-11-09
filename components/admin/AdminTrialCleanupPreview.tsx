"use client";

export default function AdminTrialCleanupPreview({ language }: { language: "zh" | "en" }) {
  const zh = language === "zh";

  return (
    <div role="note" style={{ display: "grid", gap: 8 }}>
      <p style={{ margin: 0, fontSize: 13, lineHeight: 1.7 }}>
        {zh
          ? "历史云体验（Trial）清理预览已冻结。此处不再调用旧版预览RPC，也不会执行删除；不得将其作为Free永久30MB资料清理的资格或统计依据。"
          : "The legacy cloud-trial cleanup preview is frozen. This section no longer calls the old preview RPC or performs deletion; it is not the Free-tier 30 MB idle-data cleanup."}
      </p>
      <p style={{ margin: 0, fontSize: 12, lineHeight: 1.7, color: "#8c4d36" }}>
        {zh
          ? "Free闲置资料清理仍需独立核实365天登录记录、从未成功付费、30天通知实际送达、存储压力及共享媒体引用，并经管理员逐账号确认。"
          : "Free idle-data cleanup still requires independent proof of 365-day inactivity, never-paid history, 30-day notice delivery, storage pressure and shared-media references, followed by per-account administrator confirmation."}
      </p>
    </div>
  );
}
