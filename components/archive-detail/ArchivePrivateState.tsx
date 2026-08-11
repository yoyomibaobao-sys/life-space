"use client";

import Link from "next/link";
import UiIcon from "@/components/ui/UiIcon";
import { useLanguage } from "@/lib/i18n/useLanguage";

export default function ArchivePrivateState() {
  const { t } = useLanguage();

  return (
    <main style={{ padding: "16px", maxWidth: 680, margin: "0 auto" }}>
      <Link href="/discover" style={{ fontSize: 14, color: "#666" }}>
        <UiIcon name="arrow-left" size={15} /> {t.archive.back_to_discover}
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
        {t.archive.private_project_message}
      </div>
    </main>
  );
}
