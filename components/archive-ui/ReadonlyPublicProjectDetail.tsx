"use client";

import { useEffect, useState } from "react";
import ArchiveProjectDetailView from "@/components/archive-ui/ArchiveProjectDetailView";
import ArchiveRecordCard from "@/components/archive-detail/ArchiveRecordCard";
import ArchiveProjectDetailStatus, { ArchiveProjectDetailLoading } from "@/components/archive-ui/ArchiveProjectDetailStatus";
import type { ArchiveProjectDetailTabId } from "@/components/archive-ui/archiveProjectDetailLayout";
import type { ArchiveDetailArchive, LightboxImage, RecordItem } from "@/lib/archive-detail-types";
import type { ArchiveCategory } from "@/lib/archive-categories";
import { getArchiveCategoryLabel } from "@/lib/archive-categories";
import type { ReadonlyPublicProjectSummary } from "@/lib/cloud-archive-detail";
import { attachMediaDisplayUrls } from "@/lib/media-urls";
import type { MediaItem } from "@/lib/domain-types";
import { supabase } from "@/lib/supabase";
import { useLanguage } from "@/lib/i18n/useLanguage";
import { saveRecentArchiveBrowse } from "@/lib/recent-browse";

// Public, local, cached and live owner details share the same presentation tree.
export default function ReadonlyPublicProjectDetail({ item, language, onBack }: {
  item: ReadonlyPublicProjectSummary;
  language: "zh" | "en";
  onBack: () => void;
}) {
  const { t } = useLanguage();
  const [archive, setArchive] = useState<ArchiveDetailArchive | null>(null);
  const [records, setRecords] = useState<RecordItem[]>([]);
  const [subcategoryLabel, setSubcategoryLabel] = useState<string | null>(null);
  const [groupLabel, setGroupLabel] = useState<string | null>(null);
  const [tab, setTab] = useState<ArchiveProjectDetailTabId>("records");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [lightbox, setLightbox] = useState<{ images: LightboxImage[]; index: number; record: RecordItem } | null>(null);
  useEffect(() => {
    saveRecentArchiveBrowse({ id: item.archive_id, title: item.archive_title,
      systemName: item.system_name });
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(false);
      try {
        const [archiveResult, recordResult] = await Promise.all([
          supabase.from("archives").select("*").eq("id", item.archive_id).eq("is_public", true).maybeSingle(),
          supabase.from("records").select("id, note, record_time, status_tag, visibility")
            .eq("archive_id", item.archive_id).eq("visibility", "public")
            .order("record_time", { ascending: false }),
        ]);
        if (archiveResult.error || recordResult.error || !archiveResult.data) throw archiveResult.error || recordResult.error || Error("public_archive_missing");
        const rows = recordResult.data || [];
        const ids = rows.map((record) => record.id);
        const mediaResult = ids.length
          ? await supabase.from("media").select("id, record_id, url, thumb_url, storage_path, thumb_path").in("record_id", ids)
          : { data: [], error: null };
        if (mediaResult.error) throw mediaResult.error;
        const media = await attachMediaDisplayUrls(supabase, (mediaResult.data || []) as MediaItem[]);
        const publicArchive = archiveResult.data as ArchiveDetailArchive;
        const [sub, group] = await Promise.all([
          publicArchive.sub_tag_id ? supabase.from("sub_tags").select("name").eq("id", String(publicArchive.sub_tag_id)).maybeSingle() : null,
          publicArchive.group_tag_id ? supabase.from("group_tags").select("name").eq("id", String(publicArchive.group_tag_id)).maybeSingle() : null,
        ]);
        if (cancelled) return;
        setArchive(publicArchive);
        setSubcategoryLabel(sub?.data?.name || null);
        setGroupLabel(group?.data?.name || null);
        setRecords(rows.map((record) => ({ ...record,
          status_tag: record.status_tag === "help" || record.status_tag === "resolved" ? record.status_tag : null,
          media: media.filter((entry) => entry.record_id === record.id),
        })));
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [item.archive_id]);

  if (loading) return <ArchiveProjectDetailLoading>{language === "zh" ? "正在读取…" : "Loading…"}</ArchiveProjectDetailLoading>;
  if (error || !archive) return <ArchiveProjectDetailStatus status="error"
    title={language === "zh" ? "无法读取公开项目" : "Could not load project"}
    message={language === "zh" ? "请联网后重试。" : "Reconnect and retry."}
    backLabel={t.nav.back} onBack={onBack} />;

  return <ArchiveProjectDetailView
    archive={archive} records={records} cycles={[]} cycleEnabled={false}
    mode="viewer" capabilities={{ canWriteArchive: false, canAddRecord: false, canManageCycle: false,
      canFollow: false, canSaveToLocal: false, canToggleVisibility: false }}
    isMobileViewport language={language} copy={t.archive}
    username={item.profile_display_name || ""}
    archiveDisplayName={archive.system_name || archive.species_name_snapshot || item.system_name || ""}
    archiveCategoryLabel={getArchiveCategoryLabel(archive.category as ArchiveCategory, language)}
    archiveSubcategoryLabel={subcategoryLabel} archiveGroupLabel={groupLabel}
    latestUpdate={archive.last_record_time || records[0]?.record_time || null}
    recordCount={Number(archive.record_count || records.length)} durationDays={null}
    viewCount={Number(archive.view_count || 0)}
    statusBadge={language === "zh" ? "公开" : "Public"}
    activeTab={tab} onTabChange={setTab} experienceTabLabel={t.archive.experience_cards}
    experienceContent={null}
    onToggleArchiveVisibility={() => undefined}
    headerFallbackHref="/discover" headerBackLabel={t.nav.back} onHeaderBack={onBack}
    emptyRecordsText={language === "zh" ? "暂无公开记录" : "No public records"}
    renderRecord={(record, index) => <ArchiveRecordCard key={record.id} archive={archive}
      item={record} index={index} mode="viewer" isMobileViewport isHighlighted={false}
      sameTagLinks={[]} canOpenMediaLightbox
      onOpenLightbox={(media, imageIndex, selectedRecord) => {
        const images = media.map((image) => ({ id: image.id, recordId: selectedRecord.id,
          url: image.display_url || image.url || "", alt: image.original_filename || "" })).filter((image) => image.url);
        if (images.length) setLightbox({ images, index: imageIndex, record: selectedRecord });
      }}
      onDeleteMedia={async () => undefined} onVisibilityChange={async () => undefined}
      onSetHelpStatus={async () => undefined} onRemoveTag={() => undefined}
      onAddTag={async () => undefined} />}
    lightbox={lightbox ? { ...lightbox, metaText: new Date(lightbox.record.record_time).toLocaleDateString(language === "zh" ? "zh-CN" : "en"),
      note: lightbox.record.note || "", onChange: (index) => setLightbox((current) => current ? { ...current, index } : null),
      onClose: () => setLightbox(null) } : null}
  />;
}
