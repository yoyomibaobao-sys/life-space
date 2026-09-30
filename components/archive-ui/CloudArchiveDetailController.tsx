"use client";

import { useCallback, useEffect, useState } from "react";
import ArchiveProjectDetailView from "@/components/archive-ui/ArchiveProjectDetailView";
import ArchiveExperienceCards from "@/components/archive-detail/ArchiveExperienceCards";
import ArchiveOwnerSettingsFields from "@/components/archive-detail/ArchiveOwnerSettingsFields";
import ArchiveCycleSettings from "@/components/archive-detail/ArchiveCycleSettings";
import ArchiveAddRecordSection from "@/components/archive-detail/ArchiveAddRecordSection";
import ArchiveRecordCard from "@/components/archive-detail/ArchiveRecordCard";
import ArchiveProjectDetailStatus, { ArchiveProjectDetailLoading } from "@/components/archive-ui/ArchiveProjectDetailStatus";
import {
  archiveProjectDetailNoticeLinkStyle,
  archiveProjectDetailReadOnlyNoticeStyle,
} from "@/components/archive-ui/ArchiveProjectDetailView";
import {
  type ArchiveProjectDetailTabId,
} from "@/components/archive-ui/archiveProjectDetailLayout";
import InternalLink from "@/components/navigation/InternalLink";
import type { ArchiveCycle, ArchiveDetailArchive, LightboxImage, RecordItem } from "@/lib/archive-detail-types";
import type { ArchiveCategory } from "@/lib/archive-categories";
import { getArchiveCategoryLabel } from "@/lib/archive-categories";
import type { MediaItem } from "@/lib/domain-types";
import { loadCloudArchiveDetail } from "@/lib/cloud-archive-detail";
import { requestCloudTrash } from "@/lib/cloud-trash";
import { supabase } from "@/lib/supabase";
import { useLanguage } from "@/lib/i18n/useLanguage";
import { getDurationDays } from "@/lib/follow-utils";
import { canCreateMembershipContent, normalizeMembershipRpcResult } from "@/lib/membership";
import type { PlantingRegion } from "@/lib/planting-region";
import { getArchiveCycleTerminology } from "@/lib/archive-cycle-terminology";
import { getSystemNameCandidates } from "@/lib/system-name-candidates";
import { resolveSystemNameSelection } from "@/lib/system-name-candidates";
import { uploadCloudRecordImages } from "@/lib/cloud-record-media";
import { isAndroidOnline } from "@/lib/android-connectivity";

type Detail = NonNullable<Awaited<ReturnType<typeof loadCloudArchiveDetail>>>;

// Android's live owner controller shares the website timeline loader and the
// single detail presentation. Offline cache is rendered by DeviceOwnedProjectDetail.
export default function CloudArchiveDetailController({ archiveId, userId, onBack, onCacheChanged, initialFiles, initialCapturedAt, initialNote, onRecordCreated, onRecordCancelled }: {
  archiveId: string;
  userId: string;
  onBack: () => void;
  onCacheChanged: () => Promise<void>;
  initialFiles?: File[];
  initialCapturedAt?: (string | null)[];
  initialNote?: string;
  onRecordCreated?: () => void;
  onRecordCancelled?: () => void;
}) {
  const { language, t } = useLanguage();
  const copy = t.archive;
  const recordCopy = t.record;
  const [detail, setDetail] = useState<Detail | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "not-found" | "error">("loading");
  const [error, setError] = useState("");
  const [tab, setTab] = useState<ArchiveProjectDetailTabId>("records");
  const [addOpen, setAddOpen] = useState(Boolean(initialFiles?.length));
  const [busy, setBusy] = useState(false);
  const [canWrite, setCanWrite] = useState(false);
  const [candidates, setCandidates] = useState<Awaited<ReturnType<typeof getSystemNameCandidates>>>([]);
  const [lightbox, setLightbox] = useState<{ images: LightboxImage[]; index: number; record: RecordItem } | null>(null);
  const [experienceCardCount, setExperienceCardCount] = useState(0);

  const reload = useCallback(async () => {
    const [next, membership] = await Promise.all([
      loadCloudArchiveDetail(archiveId, userId),
      supabase.rpc("get_my_membership"),
    ]);
    setDetail(next);
    setCanWrite(!membership.error && canCreateMembershipContent(normalizeMembershipRpcResult(membership.data)));
    setStatus(next ? "ready" : "not-found");
    if (next) {
      const list = await getSystemNameCandidates({
        category: next.archive.category || "plant",
        currentValue: next.archive.system_name || next.archive.species_name_snapshot || "",
        mode: "cloud", supabase, userId,
        includeUserArchives: true, includeOtherCategories: true, limit: null,
      }).catch(() => []);
      setCandidates(list);
    }
  }, [archiveId, userId]);

  useEffect(() => {
    let active = true;
    setStatus("loading");
    void reload().catch((cause) => {
      if (!active) return;
      setError(cause instanceof Error ? cause.message : String(cause));
      setStatus("error");
    });
    return () => { active = false; };
  }, [reload]);

  useEffect(() => {
    const refresh = () => { void reload().catch((cause) => setError(String(cause))); };
    window.addEventListener("lifespace-cloud-sync-complete", refresh);
    return () => window.removeEventListener("lifespace-cloud-sync-complete", refresh);
  }, [reload]);

  async function change(work: () => Promise<unknown>, requiresCloudWrite = true) {
    if (busy || (requiresCloudWrite && !canWrite) || !isAndroidOnline()) return;
    setBusy(true);
    setError("");
    try { await work(); await reload(); await onCacheChanged(); }
    catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      void reload().catch(() => undefined);
    }
    finally { setBusy(false); }
  }

  async function patchArchive(patch: Record<string, unknown>) {
    await change(async () => {
      const result = await supabase.from("archives").update(patch).eq("id", archiveId).eq("user_id", userId).select("id").single();
      if (result.error) throw result.error;
    });
  }

  async function updateCycle(cycle: ArchiveCycle, patch: Record<string, unknown>) {
    await change(async () => {
      const result = await supabase.from("archive_cycles").update(patch).eq("id", cycle.id).eq("archive_id", archiveId).select("id").single();
      if (result.error) throw result.error;
    });
  }

  if (status === "loading") return <ArchiveProjectDetailLoading>{copy.loading}</ArchiveProjectDetailLoading>;
  if (status !== "ready" || !detail) return <ArchiveProjectDetailStatus
    status={status === "not-found" ? "not-found" : "error"}
    title={status === "not-found" ? (language === "zh" ? "找不到项目" : "Project not found") : (language === "zh" ? "项目读取失败" : "Could not load project")}
    message={error || (language === "zh" ? "请联网重试。" : "Connect and retry.")}
    backLabel={t.nav.back} retryLabel={language === "zh" ? "重试" : "Retry"}
    onBack={onBack} onRetry={() => void reload().catch((cause) => setError(String(cause)))}
  />;

  const { archive, records, cycles, subTags, groupTags, depths } = detail;
  const category = (archive.category || "other") as ArchiveCategory;
  const subTag = subTags.find((item) => item.id === archive.sub_tag_id);
  const groupTag = groupTags.find((item) => item.id === archive.group_tag_id);
  const term = getArchiveCycleTerminology(archive.category, language);
  const activeCycles = cycles.filter((cycle) => cycle.status === "active");
  const encyclopediaHref = category === "plant" && archive.species_id
    ? `/plant/${encodeURIComponent(archive.species_id)}`
    : null;

  return <>
    {error ? <p role="alert" style={{ color: "#a33622", padding: "8px 16px" }}>{error}</p> : null}
    <ArchiveProjectDetailView
      archive={archive} records={records} cycles={cycles} cycleEnabled={Boolean(archive.cycle_enabled)}
      mode="owner" capabilities={{ canWriteArchive: canWrite, canAddRecord: canWrite, canManageCycle: canWrite && Boolean(archive.cycle_enabled), canSaveToLocal: false, canDeleteArchive: true, canToggleVisibility: canWrite }}
      isMobileViewport language={language} copy={copy} username={detail.username || ""}
      archiveDisplayName={archive.system_name || archive.species_name_snapshot || ""}
      archiveCategoryLabel={getArchiveCategoryLabel(category, language)}
      archiveSubcategoryLabel={depths[category] >= 2 ? subTag?.name : null}
      archiveGroupLabel={depths[category] >= 3 ? groupTag?.name : null}
      encyclopediaHref={encyclopediaHref}
      systemNameCandidates={candidates} systemNameMode="candidate" latestUpdate={archive.last_record_time || records[0]?.record_time || null}
      recordCount={Number(archive.record_count || records.length)} durationDays={getDurationDays(archive.created_at || null, archive.status === "ended" ? archive.ended_at || null : null)}
      viewCount={Number(archive.view_count || 0)}
      statusNotice={!canWrite ? (
        <div style={archiveProjectDetailReadOnlyNoticeStyle}>
          <span>{copy.cloud_read_only_notice}</span>
          <InternalLink href="/membership" style={archiveProjectDetailNoticeLinkStyle}>
            {copy.view_cloud_membership}
          </InternalLink>
        </div>
      ) : null}
      activeTab={tab} onTabChange={setTab} experienceTabLabel={
        language === "en"
          ? `${copy.experience_cards} (${experienceCardCount})`
          : `${copy.experience_cards}（${experienceCardCount}）`
      }
      experienceContent={<ArchiveExperienceCards archiveId={archiveId} isOwner canCreate={canWrite} onCountChange={setExperienceCardCount} />}
      onToggleArchiveVisibility={() => void change(async () => {
        const result = await supabase.rpc(archive.is_public ? "make_my_archive_private" : "make_my_archive_public", { p_archive_id: archiveId });
        if (result.error || result.data !== true) throw result.error || new Error(recordCopy.visibility_update_failed);
      })}
      onToggleArchiveStatus={() => void change(async () => {
        if (archive.status !== "ended" && !window.confirm(copy.end_project_message)) return;
        const result = await supabase.rpc(archive.status === "ended" ? "restore_archive_active" : "mark_archive_ended", { p_archive_id: archiveId });
        if (result.error) throw result.error;
      })}
      onDeleteArchive={() => void change(async () => {
        if (!window.confirm(copy.project_trash_message)) return;
        if (!await requestCloudTrash("archives", archiveId)) throw new Error(copy.save_retry);
        onBack();
      }, false)}
      onSaveTitle={(value) => patchArchive({ title: value })}
      onSaveCategory={(value) => patchArchive({ category: value, sub_tag_id: null, group_tag_id: null })}
      onSaveSystemName={async (selection) => {
        const resolved = resolveSystemNameSelection(candidates, selection, category);
        await patchArchive({ category: resolved.category, species_id: resolved.plantId,
          species_name_snapshot: resolved.category === "plant" ? resolved.name : null,
          system_name: resolved.category === "plant" ? null : resolved.name,
          ...(resolved.category !== category ? { sub_tag_id: null, group_tag_id: null } : {}) });
      }}
      onSaveSource={(value) => patchArchive({ source: value || null })}
      onSaveNote={(value) => patchArchive({ note: value || null })}
      onSaveArchiveSummary={(value) => patchArchive({ archive_summary: value || null })}
      onSavePlantingRegion={(region: PlantingRegion) => patchArchive({ planting_region: region })}
      storageLabel={copy.cloud_project} storageTone="cloud"
      headerFallbackHref="/archive" headerBackLabel={t.nav.my_space} onHeaderBack={onBack}
      mobileOwnerSettings={<>
        <ArchiveOwnerSettingsFields category={category} subTagId={typeof archive.sub_tag_id === "string" ? archive.sub_tag_id : null}
          groupTagId={typeof archive.group_tag_id === "string" ? archive.group_tag_id : null}
          subTags={subTags} groupTags={groupTags} maxDepth={depths[category]}
          ended={archive.status === "ended"} isPublic={archive.is_public} canWrite={canWrite} busy={busy}
          onChangeSubcategory={(id) => void patchArchive({ sub_tag_id: id || null, group_tag_id: null })}
          onChangeGroup={(id) => void patchArchive({ group_tag_id: id || null })}
          onToggleEnded={() => void change(async () => {
            if (archive.status !== "ended" && !window.confirm(copy.end_project_message)) return;
            const result = await supabase.rpc(archive.status === "ended" ? "restore_archive_active" : "mark_archive_ended", { p_archive_id: archiveId });
            if (result.error) throw result.error;
          })}
          onTogglePublic={() => void change(async () => {
            const result = await supabase.rpc(archive.is_public ? "make_my_archive_private" : "make_my_archive_public", { p_archive_id: archiveId });
            if (result.error || result.data !== true) throw result.error || new Error(recordCopy.visibility_update_failed);
          })} />
        <ArchiveCycleSettings enabled={Boolean(archive.cycle_enabled)} busy={busy}
          onSave={({ enabled }) => patchArchive({ cycle_enabled: enabled, next_cycle_name: null })} />
      </>}
      recordComposer={<ArchiveAddRecordSection archiveId={archiveId} archiveCategory={archive.category}
        archiveIsPublic={archive.is_public} activeCycles={activeCycles} mobileMode open={addOpen}
        initialFiles={initialFiles} initialCapturedAt={initialCapturedAt} initialNote={initialNote}
        onClose={() => { setAddOpen(false); onRecordCancelled?.(); }} onRecordCreated={async () => { await reload(); setAddOpen(false); onRecordCreated?.(); }} />}
      onFloatingAdd={() => setAddOpen(true)} floatingAddLabel={language === "zh" ? "添加记录" : "Add record"}
      emptyRecordsText={copy.no_records_owner}
      onStartCycle={(startedAt) => change(async () => {
        const result = await supabase.rpc("create_archive_cycle", { p_archive_id: archiveId, p_started_at: startedAt });
        if (result.error) throw result.error;
      })}
      onEndCycle={(cycle, endedAt) => updateCycle(cycle, { status: "ended", ended_at: endedAt })}
      onUpdateCycleDates={(cycle, dates) => updateCycle(cycle, { started_at: dates.startedAt, ended_at: dates.endedAt })}
      onRenameCycle={(cycle, name) => updateCycle(cycle, { display_name: name.trim() || null })}
      onDeleteCycle={async (cycle) => {
        let ok = false;
        await change(async () => {
          const result = await supabase.rpc("move_archive_cycle_to_trash", { p_cycle_id: cycle.id });
          if (result.error) throw result.error;
          ok = Boolean((Array.isArray(result.data) ? result.data[0] : result.data)?.ok);
          if (!ok) throw new Error(recordCopy.delete_failed);
        });
        return ok;
      }}
      renderRecord={(item, index) => <ArchiveRecordCard key={item.id} archive={archive as ArchiveDetailArchive}
        item={item} index={index} mode="owner" cloudWritable={canWrite} startTime={records.at(-1)?.record_time || archive.created_at}
        isHighlighted={false} sameTagLinks={[]} currentUserId={userId} isMobileViewport
        canOpenMediaLightbox
        onOpenLightbox={(media: MediaItem[], imageIndex: number, record: RecordItem) => {
          const images = media.map((m) => ({ id: m.id, recordId: record.id, url: m.display_url || m.url || "", alt: m.original_filename || "" })).filter((m) => m.url);
          if (images.length) setLightbox({ images, index: imageIndex, record });
        }}
        onDeleteMedia={async (_recordId, mediaId) => { if (!await requestCloudTrash("media", mediaId)) throw new Error(recordCopy.delete_failed); await reload(); }}
        onAddMedia={(recordId, files) => change(async () => { await uploadCloudRecordImages({ recordId, files, userId }); })}
        onReplaceMedia={(recordId, mediaId, files) => change(async () => {
          const uploaded = await uploadCloudRecordImages({ recordId, files: files.slice(0, 1), userId });
          if (uploaded.length && !await requestCloudTrash("media", mediaId)) throw new Error(recordCopy.delete_failed);
        })}
        onVisibilityChange={(recordId, visibility) => change(async () => {
          const result = visibility === "private"
            ? await supabase.rpc("make_my_record_private", { p_record_id: recordId })
            : await supabase.from("records").update({ visibility }).eq("id", recordId).eq("archive_id", archiveId);
          if (result.error) throw result.error;
        })}
        onSetHelpStatus={(recordId, status) => change(async () => {
          const target = records.find((record) => record.id === recordId);
          const publish = status === "help" && (!archive.is_public || target?.visibility !== "public");
          if (publish && !window.confirm(recordCopy.help_public_confirm)) return;
          if (publish && !archive.is_public) {
            const madePublic = await supabase.rpc("make_my_archive_public", { p_archive_id: archiveId });
            if (madePublic.error || madePublic.data !== true) throw madePublic.error || new Error(recordCopy.publish_shell_failed);
          }
          const result = await supabase.from("records")
            .update({ status_tag: status, ...(publish ? { visibility: "public" } : {}) })
            .eq("id", recordId).eq("archive_id", archiveId);
          if (result.error) throw result.error;
          const updated = records.map((record) => record.id === recordId ? { ...record, status_tag: status } : record);
          const aggregate = updated.some((record) => record.status_tag === "help") ? "open"
            : updated.some((record) => record.status_tag === "resolved") ? "resolved" : "none";
          const now = new Date().toISOString();
          const archiveResult = await supabase.from("archives").update({
            help_status: aggregate, help_updated_at: now,
            ...(aggregate === "open" ? { help_opened_at: archive.help_opened_at || now, help_resolved_at: null }
              : aggregate === "resolved" ? { help_resolved_at: now }
                : { help_opened_at: null, help_resolved_at: null }),
          }).eq("id", archiveId).eq("user_id", userId);
          if (archiveResult.error) throw archiveResult.error;
        })}
        onRemoveTag={(recordId, tag) => void change(async () => {
          const result = await supabase.from("record_tags").update({ is_active: false })
            .eq("record_id", recordId).eq("tag", tag).eq("tag_type", "behavior");
          if (result.error) throw result.error;
        })} onAddTag={async (recordId, tag) => { await change(async () => {
          const result = await supabase.from("record_tags").insert([{ record_id: recordId, tag, tag_type: "behavior", source: "user", is_active: true }]);
          if (result.error) throw result.error;
        }); }}
        onRecordUpdated={() => void reload()} onNoteSaved={() => void reload()}
        onRecordDeleted={() => void reload()} cycleOptions={cycles.map((c) => ({ id: c.id, label: c.display_name || term.cycleLabel(c.cycle_no) }))}
        onCycleChange={(recordId, cycleId) => change(async () => {
          const result = await supabase.from("records").update({ cycle_id: cycleId }).eq("id", recordId).eq("archive_id", archiveId);
          if (result.error) throw result.error;
        })}
      />}
      lightbox={lightbox ? { ...lightbox, metaText: lightbox.record.record_time, note: lightbox.record.note || "",
        onChange: (index) => setLightbox((current) => current ? { ...current, index } : null),
        onClose: () => setLightbox(null) } : null}
    />
  </>;
}
