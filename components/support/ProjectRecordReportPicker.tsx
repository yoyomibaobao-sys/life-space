"use client";
import Link from "next/link";
import { buildReportHref } from "@/lib/support-links";
import type { RecordItem } from "@/lib/archive-detail-types";

/** One entry per public project, with a record choice; never reports the entire project. */
export default function ProjectRecordReportPicker({ archiveId, records, language }: {
  archiveId: string;
  records: RecordItem[];
  language: "zh" | "en";
}) {
  const publicRecords = records.filter(record => record.visibility === "public");
  if (!publicRecords.length) return null;
  return <details style={{ fontSize: 12, color: "#6c7868", padding: "10px 0" }}>
    <summary style={{ cursor: "pointer" }}>{language === "zh" ? "举报记录" : "Report a record"}</summary>
    <p>{language === "zh" ? "请选择需要举报的具体记录：" : "Select the record you wish to report:"}</p>
    <div style={{ maxHeight: 220, overflowY: "auto", display: "grid", gap: 8 }}>
      {publicRecords.map((record, index) => <Link
        key={record.id}
        href={buildReportHref(`/archive/${archiveId}?record=${record.id}`)}
        style={{ display: "block", color: "inherit" }}
      >
        {index + 1}. {record.record_time?.slice(0, 10) || ""}
        {record.note ? ` · ${record.note.slice(0, 36)}` : ""}
      </Link>)}
    </div>
  </details>;
}
