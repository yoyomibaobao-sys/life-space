type Props = {
  fromArchiveId: string;
  fromArchiveTitle: string;
};

export default function DiscoverSearchFromArchiveNotice({
  fromArchiveId,
  fromArchiveTitle,
}: Props) {
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
        正在查看同类记录
        {fromArchiveTitle ? ` · 来自「${fromArchiveTitle}」` : ""}
      </span>
      <a
        href={`/archive/${fromArchiveId}`}
        style={{ color: "#4CAF50", textDecoration: "none", whiteSpace: "nowrap" }}
      >
        返回原记录 →
      </a>
    </div>
  );
}
