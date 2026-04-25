import Link from "next/link";
import type { PlantRecordItem } from "@/lib/plant-detail-types";

export default function PlantRelatedRecords({
  plantId,
  records,
}: {
  plantId: string;
  records: PlantRecordItem[];
}) {
  return (
    <section style={{ marginTop: 16 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 10,
        }}
      >
        <h2 style={{ margin: 0, fontSize: 18 }}>相关公开记录</h2>
        <Link
          href={`/discover/search?species=${plantId}`}
          style={{ fontSize: 13, color: "#4CAF50", textDecoration: "none" }}
        >
          查看更多 →
        </Link>
      </div>

      {records.length === 0 ? (
        <div
          style={{
            padding: 18,
            border: "1px solid #eee",
            borderRadius: 14,
            color: "#888",
            background: "#fff",
          }}
        >
          暂时还没有相关公开记录。
        </div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {records.map((record) => (
            <Link
              key={record.record_id}
              href={`/archive/${record.archive_id}?mode=viewer`}
              style={{
                display: "block",
                padding: 14,
                border: "1px solid #eee",
                borderRadius: 14,
                background: "#fff",
                color: "inherit",
                textDecoration: "none",
              }}
            >
              {record.primary_image_url && (
                <img
                  src={record.primary_image_url}
                  alt=""
                  style={{
                    width: "100%",
                    maxHeight: 180,
                    objectFit: "cover",
                    borderRadius: 10,
                    marginBottom: 10,
                  }}
                />
              )}
              <div style={{ fontWeight: 600 }}>{record.archive_title || "种植记录"}</div>
              <div
                style={{
                  marginTop: 6,
                  color: "#555",
                  fontSize: 14,
                  lineHeight: 1.6,
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
              >
                {record.note || "没有文字内容"}
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
