"use client";

import { useEffect, useState, type ReactNode } from "react";
import ConfirmDialog from "@/components/ConfirmDialog";
import ArchiveCycleSettings from "@/components/archive-detail/ArchiveCycleSettings";
import ArchiveOwnerSettingsFields from "@/components/archive-detail/ArchiveOwnerSettingsFields";
import ArchiveRecordCard from "@/components/archive-detail/ArchiveRecordCard";
import ArchiveProjectDetailView from "@/components/archive-ui/ArchiveProjectDetailView";
import {
  archiveProjectDetailEmptyStateStyle,
  archiveProjectDetailExperienceHintStyle,
  archiveProjectDetailReadOnlyNoticeStyle,
  type ArchiveProjectDetailTabId,
} from "@/components/archive-ui/archiveProjectDetailLayout";
import type { LightboxImage, RecordItem } from "@/lib/archive-detail-types";
import { formatDate, getDayNumber } from "@/lib/archive-detail-utils";
import { formatLocalCycleDate } from "@/lib/archive-cycle-dates";
import { getArchiveCycleTerminology } from "@/lib/archive-cycle-terminology";
import type { MediaItem } from "@/lib/domain-types";
import { useLanguage } from "@/lib/i18n/useLanguage";
import { normalizeLocalImageBlob } from "@/lib/local-image-blob";
import {
  canAddLocalArchiveRecord,
  canEditLocalArchiveFields,
  canEditLocalArchiveRecord,
  isCloudOfflineCacheArchive,
  localArchiveToDetailArchive,
  localRecordToRecordItem,
} from "@/lib/local-archive-detail-adapters";
import {
  createLocalArchiveCycle,
  deleteLocalArchiveCycle,
  endLocalArchiveCycle,
  isPendingCloudSyncStatus,
  updateLocalArchiveCycleDates,
  updateLocalArchiveCycleName,
  updateLocalArchiveFields,
  updateLocalRecordFields,
  listVisibleLocalTaxonomyItems,
  type LocalTaxonomyItem,
  type LocalArchiveDetail,
  type LocalArchiveOwnerContext,
  type LocalRecordWithImages,
} from "@/lib/local-offline-db";
import { getLocalArchiveCategoryDepths } from "@/lib/archive-category-settings";

function getOngoingDays(createdAt?: string | null, endedAt?: string | null) {
  if (!createdAt) return null;
  const startedAt = new Date(createdAt);
  if (Number.isNaN(startedAt.getTime())) return null;
  const startDate = new Date(startedAt.getFullYear(), startedAt.getMonth(), startedAt.getDate()).getTime();
  const now = endedAt ? new Date(endedAt) : new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.max(1, Math.floor((today - startDate) / (24 * 60 * 60 * 1000)) + 1);
}

export default function DeviceOwnedProjectDetail({
  detail,
  ownerContext,
  onBack,
  onChanged,
  onAddRecord,
  onDeleteArchive,
  onDeleteRecord,
  onTransferToCloud,
  extra,
  recordComposer,
  showFloatingAdd = true,
  view: View = ArchiveProjectDetailView,
}: {
  detail: LocalArchiveDetail;
  ownerContext: LocalArchiveOwnerContext | null;
  onBack: () => void;
  onChanged: () => Promise<void>;
  onAddRecord: () => void;
  onDeleteArchive: () => void;
  onDeleteRecord: (recordId: string) => void;
  onTransferToCloud?: () => void;
  extra?: ReactNode;
  recordComposer?: ReactNode;
  showFloatingAdd?: boolean;
  view?: typeof ArchiveProjectDetailView;
}) {
  const { language, t } = useLanguage();
  const archiveCopy = t.archive;
  const workspaceCopy = t.archive_workspace;
  const recordCopy = t.record;
  const archive = detail.archive;
  const encyclopediaHref = archive.plant_id
    ? `/plant/${encodeURIComponent(archive.plant_id)}`
    : archive.plant_slug
      ? `/plant/${encodeURIComponent(archive.plant_slug)}`
      : null;
  const isCloudCache = isCloudOfflineCacheArchive(archive);
  const canEditArchive = canEditLocalArchiveFields(archive);
  const canAddRecord = canAddLocalArchiveRecord(archive);
  const cycleEnabled = Boolean(archive.cycle_enabled);
  const [activeDetailTab, setActiveDetailTab] = useState<ArchiveProjectDetailTabId>("records");
  const [busy, setBusy] = useState(false);
  const [recordItems, setRecordItems] = useState<RecordItem[]>([]);
  const [lightboxImages, setLightboxImages] = useState<LightboxImage[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [lightboxRecord, setLightboxRecord] = useState<RecordItem | null>(null);
  const [recordToDelete, setRecordToDelete] = useState<LocalRecordWithImages | null>(null);
  const [deleteArchiveOpen, setDeleteArchiveOpen] = useState(false);
  const [taxonomy, setTaxonomy] = useState<LocalTaxonomyItem[]>([]);
  useEffect(() => {
    let active = true;
    void listVisibleLocalTaxonomyItems(ownerContext).then((rows) => { if (active) setTaxonomy(rows); });
    return () => { active = false; };
  }, [ownerContext, detail]);
  const subTags = taxonomy.filter((row) => row.kind === "subcategory" && row.category === archive.category)
    .map((row) => ({ id: row.label, name: row.label, category: archive.category,
      user_id: ownerContext?.userId || "", created_at: row.created_at }));
  const groupTags = taxonomy.filter((row) => row.kind === "group" && row.category === archive.category)
    .map((row) => ({ id: row.label, name: row.label, sub_tag_id: row.subcategory || "",
      user_id: ownerContext?.userId || "", created_at: row.created_at }));
  const maxDepth = isCloudCache ? 3 : getLocalArchiveCategoryDepths(ownerContext?.userId)[archive.category];

  useEffect(() => {
    const urls: string[] = [];
    const items = detail.records.map((record) => {
      const imageUrls = record.images.map((image) => {
        const blob = normalizeLocalImageBlob(image.blob, image.mime_type);
        if (!blob) return "";
        try {
          const url = URL.createObjectURL(blob);
          urls.push(url);
          return url;
        } catch {
          return "";
        }
      });
      return localRecordToRecordItem(record, imageUrls);
    });
    setRecordItems(items);
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [detail]);

  const cycleTerminology = getArchiveCycleTerminology(archive.category, language);
  const startTime = detail.records.length
    ? detail.records[detail.records.length - 1]?.record_time || archive.created_at
    : archive.created_at;
  const latestUpdate = detail.records[0]?.record_time || archive.updated_at || archive.created_at;
  const ongoingDays = getOngoingDays(archive.created_at, archive.status === "ended" ? archive.ended_at : null);
  const localCategoryLabel =
    archive.category === "plant"
      ? archiveCopy.categories.plant_label
      : archive.category === "system"
        ? archiveCopy.categories.system_label
        : archive.category === "insect_fish"
          ? archiveCopy.categories.insect_fish_label
          : archiveCopy.categories.other_label;
  const localArchiveRecordShell = localArchiveToDetailArchive(
    archive,
    detail.records.length,
    archiveCopy.local_project,
  );
  const cycleOptions = (archive.cycles || []).map((cycle) => ({
    id: cycle.id,
    label: `${cycle.display_name || cycleTerminology.cycleLabel(cycle.cycle_no)} (${cycle.status === "active" ? archiveCopy.ongoing : archiveCopy.ended} · ${formatLocalCycleDate(cycle.started_at)})`,
  }));
  const lightboxRecordIndex = lightboxRecord
    ? recordItems.findIndex((record) => record.id === lightboxRecord.id)
    : -1;
  const lightboxMetaText = lightboxRecord
    ? `${lightboxRecordIndex === 0 ? `${archiveCopy.latest_update} · ` : ""}${recordCopy.day_prefix} ${getDayNumber(
        startTime,
        lightboxRecord.record_time,
      )}${recordCopy.day_suffix ? ` ${recordCopy.day_suffix}` : ""} · ${formatDate(lightboxRecord.record_time)}`
    : "";

  async function change(work: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    try {
      await work();
      await onChanged();
    } finally {
      setBusy(false);
    }
  }

  function openLightbox(mediaItems: MediaItem[], imageIndex: number, record: RecordItem) {
    if (isCloudCache) return;
    const images = mediaItems
      .map((item, index) => ({
        id: item.id,
        recordId: item.record_id,
        url: item.display_url || item.url || item.file_url || "",
        alt: item.original_filename || `${recordCopy.local_image_alt} ${index + 1}`,
      }))
      .filter((item) => Boolean(item.url));
    if (!images.length) return;
    setLightboxImages(images);
    setLightboxIndex(Math.max(0, Math.min(imageIndex, images.length - 1)));
    setLightboxRecord(record);
  }

  const pendingRecordCount = detail.records.filter((record) =>
    isPendingCloudSyncStatus(record.sync.status),
  ).length;
  const archivePending = isPendingCloudSyncStatus(archive.sync.status);
  const showPendingNotice = archivePending || pendingRecordCount > 0;
  const archiveDisplayName = archive.system_name || archive.species_name || "";

  return (
    <View
      archive={localArchiveRecordShell}
      records={recordItems}
      cycles={cycleEnabled ? ((archive.cycles || []) as never) : []}
      cycleEnabled={cycleEnabled}
      mode="owner"
      capabilities={{
        canFollow: false,
        canWriteArchive: canEditArchive,
        canAddRecord,
        canManageCycle: canEditArchive && cycleEnabled,
        canSaveToLocal: false,
        canDeleteArchive: canEditArchive,
        canToggleVisibility: false,
      }}
      isMobileViewport
      language={language}
      copy={archiveCopy}
      username={ownerContext?.email || archiveCopy.default_user}
      archiveDisplayName={archiveDisplayName}
      archiveCategoryLabel={localCategoryLabel}
      archiveSubcategoryLabel={archive.subcategory || null}
      archiveGroupLabel={archive.group_name || null}
      encyclopediaHref={encyclopediaHref}
      systemNameMode="text"
      latestUpdate={latestUpdate}
      recordCount={detail.records.length}
      viewCount={0}
      followerCount={0}
      durationDays={ongoingDays}
      statusBadge={isCloudCache ? workspaceCopy.cloud_cache_copy : archiveCopy.local_project}
      statusNotice={
        <>
          <div style={archiveProjectDetailReadOnlyNoticeStyle}>
            <span>
              {isCloudCache ? archiveCopy.cloud_read_only_notice : archiveCopy.saved_on_this_device}
            </span>
          </div>
          {showPendingNotice ? (
            <div style={{ margin: "0 0 10px", color: "#8a5a36", fontSize: 12, lineHeight: 1.4 }}>
              {archiveCopy.pending_sync_workspace_notice}
            </div>
          ) : null}
        </>
      }
      activeTab={activeDetailTab}
      onTabChange={setActiveDetailTab}
      experienceTabLabel={
        language === "en"
          ? `${archiveCopy.experience_cards} (0)`
          : `${archiveCopy.experience_cards}（0）`
      }
      experienceContent={
        <div style={archiveProjectDetailEmptyStateStyle}>
          <div>{t.experience.no_cards}</div>
          <div style={archiveProjectDetailExperienceHintStyle}>
            {archiveCopy.local_experience_cards_hint}
          </div>
        </div>
      }
      headerFallbackHref="/archive"
      headerBackLabel={t.nav.back}
      onHeaderBack={onBack}
      onToggleArchiveVisibility={() => undefined}
      onToggleArchiveStatus={() => {
        void change(() => updateLocalArchiveFields(archive.id, {
          status: archive.status === "ended" ? "active" : "ended",
          ended_at: archive.status === "ended" ? null : new Date().toISOString(),
        }, ownerContext));
      }}
      onDeleteArchive={() => setDeleteArchiveOpen(true)}
      onSaveTitle={async (nextTitle) => {
        await updateLocalArchiveFields(archive.id, { title: nextTitle }, ownerContext);
        await onChanged();
      }}
      onSaveCategory={async (nextCategory) => {
        await updateLocalArchiveFields(archive.id, { category: nextCategory }, ownerContext);
        await onChanged();
      }}
      onSaveSystemName={async (value) => {
        await updateLocalArchiveFields(archive.id, {
          system_name: value.name,
          species_name: value.name,
        }, ownerContext);
        await onChanged();
      }}
      onSaveSource={async (nextSource) => {
        await updateLocalArchiveFields(archive.id, { source: nextSource }, ownerContext);
        await onChanged();
      }}
      onSaveNote={async (nextNote) => {
        await updateLocalArchiveFields(archive.id, { note: nextNote }, ownerContext);
        await onChanged();
      }}
      onSaveArchiveSummary={async (nextSummary) => {
        await updateLocalArchiveFields(archive.id, { archive_summary: nextSummary }, ownerContext);
        await onChanged();
      }}
      onSavePlantingRegion={async (region) => {
        await updateLocalArchiveFields(archive.id, { planting_region: region }, ownerContext);
        await onChanged();
      }}
      storageLabel={isCloudCache ? archiveCopy.device : archiveCopy.saved_on_this_device}
      storageTone="device"
      visibilityLabel={isCloudCache ? workspaceCopy.cloud_cache_copy : archiveCopy.local_project}
      mobileOwnerSettings={
        <>
          <ArchiveOwnerSettingsFields
            category={archive.category}
            subTagId={archive.subcategory || null}
            groupTagId={archive.group_name || null}
            subTags={subTags}
            groupTags={groupTags}
            maxDepth={maxDepth}
            ended={archive.status === "ended"}
            isPublic={false}
            canWrite={canEditArchive && !busy}
            busy={busy}
            showVisibility={false}
            footerAction={onTransferToCloud && !isCloudCache ? {
              label: language === "zh" ? "上传到云端" : "Upload to cloud",
              onClick: onTransferToCloud,
              disabled: busy,
            } : undefined}
            onChangeSubcategory={(value) => { void change(() => updateLocalArchiveFields(archive.id,
              { subcategory: value || null, group_name: null }, ownerContext)); }}
            onChangeGroup={(value) => { void change(() => updateLocalArchiveFields(archive.id,
              { group_name: value || null }, ownerContext)); }}
            onToggleEnded={() => {
              void change(() => updateLocalArchiveFields(archive.id, {
                status: archive.status === "ended" ? "active" : "ended",
                ended_at: archive.status === "ended" ? null : new Date().toISOString(),
              }, ownerContext));
            }}
          />
          {canEditArchive ? (
            <ArchiveCycleSettings
              key={archive.id}
              enabled={cycleEnabled}
              busy={busy}
              onSave={async ({ enabled }) => {
                await change(() => updateLocalArchiveFields(archive.id, { cycle_enabled: enabled }, ownerContext));
              }}
            />
          ) : null}
        </>
      }
      timelineBusy={busy}
      onStartCycle={canEditArchive && cycleEnabled
        ? (startedAt) => change(() => createLocalArchiveCycle(archive.id, startedAt, ownerContext))
        : undefined}
      onEndCycle={canEditArchive && cycleEnabled
        ? (cycle, endedAt) => change(() => endLocalArchiveCycle(archive.id, cycle.id, endedAt, ownerContext))
        : undefined}
      onUpdateCycleDates={canEditArchive && cycleEnabled
        ? (cycle, dates) => change(() => updateLocalArchiveCycleDates(
          archive.id,
          cycle.id,
          { started_at: dates.startedAt, ended_at: dates.endedAt },
          ownerContext,
        ))
        : undefined}
      onRenameCycle={canEditArchive && cycleEnabled
        ? (cycle, displayName) => change(() => updateLocalArchiveCycleName(archive.id, cycle.id, displayName, ownerContext))
        : undefined}
      onDeleteCycle={canEditArchive && cycleEnabled
        ? async (cycle) => {
            await deleteLocalArchiveCycle(archive.id, cycle.id, ownerContext);
            await onChanged();
            return true;
          }
        : undefined}
      emptyRecordsText={recordCopy.no_local_records}
      renderRecord={(record, index) => {
        const source = detail.records.find((item) => item.id === record.id);
        const editable = source ? canEditLocalArchiveRecord(archive, source) : false;
        return (
          <ArchiveRecordCard
            key={record.id}
            variant="local"
            archive={localArchiveRecordShell}
            item={record}
            index={index}
            mode={editable ? "owner" : "viewer"}
            startTime={startTime}
            isHighlighted={false}
            sameTagLinks={[]}
            isMobileViewport
            canOpenMediaLightbox={!isCloudCache}
            onOpenLightbox={openLightbox}
            onDeleteMedia={async () => undefined}
            onVisibilityChange={async () => undefined}
            onSetHelpStatus={async () => undefined}
            onRemoveTag={() => undefined}
            onAddTag={async () => undefined}
            onRecordUpdated={editable ? async (recordId, patch) => {
              await updateLocalRecordFields(recordId, {
                location: patch.location,
                note: typeof patch.note === "string" ? patch.note : undefined,
                record_time: typeof patch.record_time === "string" ? patch.record_time : undefined,
              });
              await onChanged();
            } : undefined}
            onNoteSaved={async () => undefined}
            onRecordDeleted={editable ? (recordId) => {
              const target = detail.records.find((item) => item.id === recordId);
              if (target) setRecordToDelete(target);
            } : undefined}
            cycleOptions={cycleOptions}
            onCycleChange={editable ? async (recordId, cycleId) => {
              await updateLocalRecordFields(recordId, { cycle_id: cycleId });
              await onChanged();
            } : undefined}
          />
        );
      }}
      lightbox={lightboxImages.length > 0 ? {
        images: lightboxImages,
        index: lightboxIndex,
        onChange: setLightboxIndex,
        metaText: lightboxMetaText,
        note: lightboxRecord?.note || "",
        onClose: () => {
          setLightboxImages([]);
          setLightboxIndex(0);
          setLightboxRecord(null);
        },
      } : null}
      recordComposer={recordComposer}
      extra={extra}
      floatingAddLabel={recordCopy.add_record_short}
      onFloatingAdd={showFloatingAdd ? onAddRecord : undefined}
      dialogs={
        <>
          <ConfirmDialog
            open={Boolean(recordToDelete)}
            title={recordCopy.delete_local_record_title}
            message={recordCopy.delete_local_record_message}
            confirmText={recordCopy.confirm_delete}
            danger
            onClose={() => setRecordToDelete(null)}
            onConfirm={() => {
              if (recordToDelete) onDeleteRecord(recordToDelete.id);
              setRecordToDelete(null);
            }}
          />
          <ConfirmDialog
            open={deleteArchiveOpen}
            title={archiveCopy.delete_local_project}
            message={archiveCopy.delete_local_project_message}
            confirmText={archiveCopy.confirm_delete_project}
            danger
            onClose={() => setDeleteArchiveOpen(false)}
            onConfirm={() => {
              setDeleteArchiveOpen(false);
              onDeleteArchive();
            }}
          />
        </>
      }
    />
  );
}
