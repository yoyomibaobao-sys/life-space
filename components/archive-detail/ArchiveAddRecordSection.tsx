"use client";

import AddRecord from "@/app/archive/[id]/AddRecord";

export default function ArchiveAddRecordSection({
  archiveId,
  archiveIsPublic,
}: {
  archiveId: string;
  archiveIsPublic: boolean;
}) {
  return (
    <section
      style={{
        border: "1px solid #e9ede5",
        borderRadius: 22,
        background: "#fff",
        padding: 16,
        marginBottom: 16,
      }}
    >
      <div style={{ fontSize: 15, fontWeight: 650, color: "#233223", marginBottom: 10 }}>
        增加记录
      </div>
      <AddRecord
        archiveId={archiveId}
        archiveIsPublic={archiveIsPublic}
        placeholder="记录今天看到的变化…"
      />
    </section>
  );
}
