import UiIcon from "@/components/ui/UiIcon";
import { useLanguage } from "@/lib/i18n/useLanguage";

type Props = {
  fromArchiveId: string;
  fromArchiveTitle: string;
};

export default function DiscoverSearchFromArchiveNotice({
  fromArchiveId,
  fromArchiveTitle,
}: Props) {
  const { t } = useLanguage();
  if (!fromArchiveId) return null;

  return (
    <div
      style={{
        marginBottom: 12,
        padding: "10px 12px",
        borderRadius: 14,
        border: "1px solid #e2eadf",
        background: "#f8fbf6",
        color: "#5d6a59",
        fontSize: 13,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        flexWrap: "wrap",
      }}
    >
      <span>
        {t.discover.search_ui.viewing_similar}
        {fromArchiveTitle
          ? ` · ${t.discover.search_ui.from_prefix}${fromArchiveTitle}${t.discover.search_ui.from_suffix}`
          : ""}
      </span>
      <a
        href={`/archive/${fromArchiveId}`}
        style={{ color: "#4CAF50", textDecoration: "none", whiteSpace: "nowrap" }}
      >
        <UiIcon name="arrow-left" size={14} /> {t.discover.search_ui.back_to_source}
      </a>
    </div>
  );
}
