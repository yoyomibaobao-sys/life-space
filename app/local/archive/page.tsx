"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/lib/i18n/useLanguage";

export default function LocalArchiveRedirectPage() {
  const router = useRouter();
  const { t } = useLanguage();

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
      {t.local_mode.redirecting}
      <div style={{ marginTop: 12 }}>
        <Link href="/archive?source=local" style={{ color: "#2f6a31" }}>
          {t.local_mode.open_projects}
        </Link>
      </div>
    </main>
  );
}
