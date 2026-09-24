"use client";

import { useEffect, useState } from "react";
import type { DiscoveryProjectFeedItem } from "@/lib/discover-project-types";
import { attachMediaDisplayUrls } from "@/lib/media-urls";
import { supabase } from "@/lib/supabase";

type PublicRecord = {
  id: string;
  note: string | null;
  record_time: string | null;
  media: { id: string; display_url: string | null; display_thumb_url: string | null }[];
};

export default function ReadonlyPublicProjectDetail({
  item, language, onBack,
}: {
  item: DiscoveryProjectFeedItem;
  language: "zh" | "en";
  onBack: () => void;
}) {
  const [records, setRecords] = useState<PublicRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(false);
      const result = await supabase.from("records")
        .select("id, note, record_time")
        .eq("archive_id", item.archive_id)
        .eq("visibility", "public")
        .order("record_time", { ascending: false });
      if (cancelled) return;
      if (result.error) {
        setError(true);
        setLoading(false);
        return;
      }
      const rows = result.data || [];
      const ids = rows.map((record) => record.id);
      const mediaResult = ids.length
        ? await supabase.from("media").select("id, record_id, url, thumb_url, storage_path, thumb_path").in("record_id", ids)
        : { data: [], error: null };
      if (cancelled) return;
      const media = await attachMediaDisplayUrls(supabase, mediaResult.data || []);
      if (cancelled) return;
      setRecords(rows.map((record) => ({
        ...record,
        media: media.filter((entry) => entry.record_id === record.id),
      })));
      setLoading(false);
    }
    void load();
    return () => { cancelled = true; };
  }, [item.archive_id]);

  return (
    <section style={{ padding: "8px 4px 24px" }}>
      <button className="secondary-button" type="button" onClick={onBack}>
        {language === "zh" ? "返回" : "Back"}
      </button>
      <h1>{item.archive_title}</h1>
      <p className="project-meta">{item.profile_display_name}{item.system_name ? ` · ${item.system_name}` : ""}</p>
      {item.display_image_url ? (
        <img src={item.display_image_url} alt="" style={{ width: "100%", maxHeight: 300, objectFit: "cover", borderRadius: 14 }} />
      ) : null}
      {item.card_summary ? <p>{item.card_summary}</p> : null}
      <h2>{language === "zh" ? "公开记录" : "Public records"}</h2>
      {loading ? <p>{language === "zh" ? "正在读取…" : "Loading…"}</p> : null}
      {error ? <p role="alert">{language === "zh" ? "记录读取失败" : "Could not load records"}</p> : null}
      {!loading && !error && records.length === 0 ? <p>{language === "zh" ? "暂无公开记录" : "No public records"}</p> : null}
      <div className="record-list">
        {records.map((record) => (
          <article className="panel" key={record.id} style={{ marginBottom: 10, padding: 12 }}>
            <time className="project-meta">{record.record_time ? new Date(record.record_time).toLocaleDateString(language === "zh" ? "zh-CN" : "en") : ""}</time>
            {record.note ? <p style={{ whiteSpace: "pre-wrap" }}>{record.note}</p> : null}
            <div className="photo-grid">
              {record.media.map((image) => (
                <img key={image.id} src={image.display_thumb_url || image.display_url || ""} alt="" loading="lazy" style={{ width: "100%", borderRadius: 10 }} />
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
