"use client";

import Link from "next/link";
import UiIcon from "@/components/ui/UiIcon";

export default function ArchivePrivateState() {
  return (
    <main style={{ padding: "16px", maxWidth: 680, margin: "0 auto" }}>
      <Link href="/discover" style={{ fontSize: 14, color: "#666" }}>
        <UiIcon name="arrow-left" size={15} /> 返回发现页
      </Link>

      <div
        style={{
          marginTop: 24,
          padding: 20,
          border: "1px solid #eee",
          borderRadius: 12,
          background: "#fff",
          color: "#666",
        }}
      >
        该项目仅自己可见。
      </div>
    </main>
  );
}
