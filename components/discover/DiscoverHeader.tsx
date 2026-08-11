import Link from "next/link";
import UiIcon from "@/components/ui/UiIcon";
import { useLanguage } from "@/lib/i18n/useLanguage";

export function DiscoverHeader() {
  const { t } = useLanguage();

  return (
    <header style={{ marginBottom: 12 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ fontSize: 22, fontWeight: 700, color: "#1f2d1f" }}>
          {t.discover.title}
        </div>
        <Link
          href="/discover/search"
          style={{
            minHeight: 34,
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            color: "#5d7059",
            background: "#fff",
            border: "1px solid #dce6d8",
            borderRadius: 999,
            padding: "6px 11px",
            fontSize: 13,
            fontWeight: 750,
            textDecoration: "none",
            boxSizing: "border-box",
          }}
        >
          <UiIcon name="search" size={15} /> {t.discover.search}
        </Link>
      </div>
    </header>
  );
}
