import UiIcon from "@/components/ui/UiIcon";
import { useLanguage } from "@/lib/i18n/useLanguage";

export default function DiscoverSearchHeader() {
  const { t } = useLanguage();
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
        {t.discover.search_ui.title}
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
        <UiIcon name="arrow-left" size={14} /> {t.discover.search_ui.back_to_discover}
      </a>
    </header>
  );
}
