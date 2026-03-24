import { supabase } from "@/lib/supabase";
import { use } from "react";
import AddRecord from "./AddRecord";
import DeleteRecordButton from "./DeleteRecordButton";
import ImageViewer from "@/components/ImageViewer";
import EditRecord from "@/components/EditRecord";

export default function ArchiveDetail({ params }: any) {
  const resolvedParams = use(params);
  const id = resolvedParams.id;

  return <Content id={id} />;
}

async function Content({ id }: { id: string }) {
  const { data: archive } = await supabase
    .from("archives")
    .select("*")
    .eq("id", id)
    .single();

  if (!archive) {
    return <div style={{ padding: "40px" }}>档案不存在</div>;
  }

  const { data: records } = await supabase
    .from("records")
    .select("*, media(*)")
    .eq("archive_id", archive.id)
    .order("photo_time", { ascending: false });

  return (
    <main style={{ padding: "12px" }}>
      <h1>{archive?.title}</h1>

      <AddRecord archiveId={archive.id} />

      <h2>时间线</h2>

      {groupRecords(records).map((group: any) => (
        <div key={group.title} style={{ marginBottom: "30px" }}>
          {/* ✅ 时间标题优化 */}
          <h3
            style={{
              marginBottom: "10px",
              color: "#333",
              fontWeight: "bold",
              borderLeft: "4px solid #4CAF50",
              paddingLeft: "8px",
            }}
          >
            {group.title}
          </h3>

          {group.items.map((item: any) => (
            <div
              key={item.id}
              style={{
                borderLeft: "3px solid #4CAF50",
                padding: "10px 20px",
                marginBottom: "15px", // ✅ 间距优化
              }}
            >
              {/* 图片 */}
              {item.media && item.media.length > 0 && (
                <div style={{ marginBottom: "10px" }}>
                  <ImageViewer
                    images={item.media.map((m: any) => m.url)}
                  />
                </div>
              )}

              {/* 文字 */}
              <EditRecord id={item.id} initialText={item.note} />
              ：、、、、、、、、

              {/* 删除 */}
              <div style={{ marginTop: "10px" }}>
                <DeleteRecordButton id={item.id} />
              </div>
            </div>
          ))}
        </div>
      ))}
    </main>
  );
}

//
// 时间分组
//
function groupRecords(records: any[]) {
  if (!records) return [];

  const groups: any = {};

  records.forEach((item) => {
    const label = formatDate(item.photo_time || item.created_at);

    if (!groups[label]) {
      groups[label] = [];
    }

    groups[label].push(item);
  });

  return Object.keys(groups).map((key) => ({
    title: key,
    items: groups[key],
  }));
}

//
// ✅ 时间格式优化（核心）
//
function formatDate(dateString: string) {
  const date = new Date(dateString);

  const today = new Date();
  const d1 = new Date(date);
  const d2 = new Date(today);

  d1.setHours(0, 0, 0, 0);
  d2.setHours(0, 0, 0, 0);

  const diff = Math.floor(
    (d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24)
  );

  // 👉 只保留时分
  const timeStr = date.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  });

  if (diff === 0) return `今天 ${timeStr}`;
  if (diff === 1) return `昨天 ${timeStr}`;

  return date.toLocaleDateString("zh-CN") + " " + timeStr;
}