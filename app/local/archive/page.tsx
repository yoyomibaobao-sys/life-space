"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function LocalArchiveRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/archive?source=local");
  }, [router]);

  return (
    <main
      style={{
        minHeight: "calc(100vh - 70px)",
        padding: "24px 16px",
        background: "#fbfcf7",
        color: "#263326",
      }}
    >
      正在进入我的空间中的本地项目...
      <div style={{ marginTop: 12 }}>
        <Link href="/archive?source=local" style={{ color: "#2f6a31" }}>
          前往本地项目
        </Link>
      </div>
    </main>
  );
}
