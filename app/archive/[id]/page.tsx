import { getSupabaseServer } from "@/lib/supabaseServer";
import AddRecord from "./AddRecord";
import DeleteRecordButton from "./DeleteRecordButton";
import ImageViewer from "@/components/ImageViewer";
import EditRecord from "@/components/EditRecord";

export default async function ArchiveDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <Content id={id} />;
}

async function Content({ id }: { id: string }) {
  const supabase = await getSupabaseServer();

  // ✅ 1. 查档案（改成 maybeSingle，避免误判）
  const { data: archive } = await supabase
    .from("archives")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!archive) {
    return (
      <div style={{ padding: "40px" }}>
        档案不存在
        <br />
        id: {id}
      </div>
    );
  }
// ✅ 2. 查 records（修复类型问题）
const { data } = await supabase
  .from("records")
  .select("*")
  .eq("archive_id", archive.id)
  .order("photo_time", { ascending: false });

const recordsData = (data ?? []) as any[];

// ✅ 3. 查 media
const recordIds = recordsData.map((r) => r.id);

let mediaMap: Record<string, any[]> = {};

if (recordIds.length > 0) {
  const { data: mediaRaw } = await supabase
    .from("media")
    .select("*")
    .in("record_id", recordIds);

  const mediaData = (mediaRaw ?? []) as any[];

  // 分组
  mediaData.forEach((m) => {
    if (!mediaMap[m.record_id]) {
      mediaMap[m.record_id] = [];
    }
    mediaMap[m.record_id].push(m);
  });
}

// ✅ 4. 合并
const records = recordsData.map((r) => ({
  ...r,
  media: mediaMap[r.id] || [],
}));

  return (
    <main style={{ padding: "12px" }}>
      <h1>{archive.title}</h1>

      <AddRecord archiveId={archive.id} />

      <h2>时间线</h2>

      {groupRecords(records).map((group: any) => (
        <div key={group.title} style={{ marginBottom: "30px" }}>
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
                marginBottom: "15px",
              }}
            >
              {item.media?.length > 0 && (
                <div style={{ marginBottom: "10px" }}>
                  <ImageViewer
                    images={item.media.map((m: any) => m.url)}
                  />
                </div>
              )}

              <EditRecord id={item.id} initialText={item.note} />

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

function groupRecords(records: any[] = []): any[] {
  const groups: Record<string, any[]> = {};

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

  const timeStr = date.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  });

  if (diff === 0) return `今天 ${timeStr}`;
  if (diff === 1) return `昨天 ${timeStr}`;

  return date.toLocaleDateString("zh-CN") + " " + timeStr;
}