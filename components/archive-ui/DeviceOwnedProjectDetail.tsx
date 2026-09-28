"use client";

import { useEffect, useMemo, useState } from "react";
import PlantingRegionEditor from "@/components/archive/PlantingRegionEditor";
import ConfirmDialog from "@/components/ConfirmDialog";
import ArchiveCycleSettings from "@/components/archive-detail/ArchiveCycleSettings";
import ArchiveCycleTimeline from "@/components/archive-detail/ArchiveCycleTimeline";
import ArchiveLightbox from "@/components/archive-detail/ArchiveLightbox";
import ArchiveOwnerSettingsFields from "@/components/archive-detail/ArchiveOwnerSettingsFields";
import ArchiveRecordCard from "@/components/archive-detail/ArchiveRecordCard";
import ArchiveDetailHeaderView, {
  type ArchiveProfileFieldSave,
} from "@/components/archive-ui/ArchiveDetailHeaderView";
import ArchiveProjectDetailTabs from "@/components/archive-ui/ArchiveProjectDetailTabs";
import {
  archiveProjectDetailBadgeStyle,
  archiveProjectDetailEmptyStateStyle,
  archiveProjectDetailExperienceHintStyle,
  archiveProjectDetailFloatingAddStyle,
  archiveProjectDetailGuideTextStyle,
  archiveProjectDetailHeaderProjectStyle,
  archiveProjectDetailHeaderTitleStyle,
  archiveProjectDetailMainStyle,
  archiveProjectDetailMetaLineStyle,
  archiveProjectDetailReadOnlyNoticeStyle,
  archiveProjectDetailStatsStyle,
  type ArchiveProjectDetailTabId,
} from "@/components/archive-ui/archiveProjectDetailLayout";
import type { ArchiveProjectView } from "@/components/archive-ui/types";
import MobilePageHeaderView from "@/components/mobile/MobilePageHeaderView";
import ProjectMetaLine from "@/components/ui/ProjectMetaLine";
import { getArchiveCategoryIcon } from "@/lib/archive-categories";
import { formatLocalCycleDate } from "@/lib/archive-cycle-dates";
import { getArchiveCycleTerminology } from "@/lib/archive-cycle-terminology";
import type { ArchiveCycle, LightboxImage, RecordItem } from "@/lib/archive-detail-types";
import { formatDate, getDayNumber } from "@/lib/archive-detail-utils";
import type { MediaItem } from "@/lib/domain-types";
import { useLanguage } from "@/lib/i18n/useLanguage";
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
  type LocalArchiveDetail,
  type LocalArchiveOwnerContext,
  type LocalRecordWithImages,
} from "@/lib/local-offline-db";

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
}: {
  detail: LocalArchiveDetail;
  ownerContext: LocalArchiveOwnerContext | null;
  onBack: () => void;
  onChanged: () => Promise<void>;
  onAddRecord: () => void;
  onDeleteArchive: () => void;
  onDeleteRecord: (recordId: string) => void;
}) {
  const { language, t } = useLanguage();
  const archiveCopy = t.archive;
  const recordCopy = t.record;
  const archive = detail.archive;
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

  useEffect(() => {
    const urls: string[] = [];
    const items = detail.records.map((record) => {
      const imageUrls = record.images.map((image) => {
        const url = URL.createObjectURL(image.blob);
        urls.push(url);
        return url;
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
  const projectView = useMemo<ArchiveProjectView>(() => ({
    id: archive.id,
    mode: "local",
    title: archive.title || archiveCopy.unnamed_project,
    category: archive.category,
    plantId: archive.plant_id,
    plantSlug: archive.plant_slug,
    categoryLabel: localCategoryLabel,
    categoryIcon: getArchiveCategoryIcon(archive.category),
    systemName: archive.system_name || archive.species_name || archiveCopy.not_filled,
    visibilityLabel: isCloudCache ? null : archiveCopy.local_project,
    visibilityTone: "neutral",
    storageLabel: isCloudCache ? archiveCopy.device : archiveCopy.saved_on_this_device,
    storageTone: "device",
    recordCount: detail.records.length,
    durationDays: ongoingDays,
    latestTime: latestUpdate,
    ended: archive.status === "ended",
  }), [
    archive,
    archiveCopy.device,
    archiveCopy.local_project,
    archiveCopy.not_filled,
    archiveCopy.saved_on_this_device,
    archiveCopy.unnamed_project,
    detail.records.length,
    isCloudCache,
    latestUpdate,
    localCategoryLabel,
    ongoingDays,
  ]);
  const durationText = ongoingDays
    ? `${archiveCopy.ongoing_days_prefix} ${ongoingDays} ${archiveCopy.days_suffix}`
    : archiveCopy.none;
  const archiveDisplayName = archive.system_name || archive.species_name || "";
  const localArchiveRecordShell = localArchiveToDetailArchive(
    archive,
    detail.records.length,
    archiveCopy.local_project,
  );
  const cycleOptions = (archive.cycles || []).map((cycle) => ({
    id: cycle.id,
    label: `${cycle.display_name || cycleTerminology.cycleLabel(cycle.cycle_no)} (${cycle.status === "active" ? archiveCopy.ongoing : archiveCopy.ended} · ${formatLocalCycleDate(cycle.started_at)})`,
  }));
  const localSystemNameLabel =
    archive.category === "plant"
      ? archiveCopy.system_plant_name_required
      : archiveCopy.system_name_required;
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

  async function saveProfileField(changeField: ArchiveProfileFieldSave) {
    if (!canEditArchive) return;
    if (changeField.field === "title") {
      await updateLocalArchiveFields(archive.id, { title: changeField.value }, ownerContext);
    } else if (changeField.field === "category") {
      await updateLocalArchiveFields(archive.id, { category: changeField.value }, ownerContext);
    } else if (changeField.field === "systemName") {
      await updateLocalArchiveFields(
        archive.id,
        {
          system_name: changeField.value.name,
          species_name: changeField.value.name,
        },
        ownerContext,
      );
    } else if (changeField.field === "source") {
      await updateLocalArchiveFields(archive.id, { source: changeField.value }, ownerContext);
    } else if (changeField.field === "note") {
      await updateLocalArchiveFields(archive.id, { note: changeField.value }, ownerContext);
    } else if (changeField.field === "archiveSummary") {
      await updateLocalArchiveFields(archive.id, { archive_summary: changeField.value }, ownerContext);
    }
    await onChanged();
  }

  function openLightbox(mediaItems: MediaItem[], imageIndex: number, record: RecordItem) {
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
    isPendingCloudSyncStatus(record.sync.status)
  ).length;
  const archivePending = isPendingCloudSyncStatus(archive.sync.status);
  const showPendingNotice = archivePending || pendingRecordCount > 0;

  const profileRows = [
    {
      label: archiveCopy.project_name_required,
      value: archive.title || archiveCopy.unnamed_project,
      field: "title" as const,
    },
    {
      label: localSystemNameLabel,
      value: archive.system_name || archive.species_name || archiveCopy.not_filled,
      field: "systemName" as const,
    },
    {
      label: archiveCopy.category,
      value: localCategoryLabel,
      field: "category" as const,
    },
    ...(archive.category === "plant"
      ? [{
          label: archiveCopy.planting_region_required,
          content: (
            <PlantingRegionEditor
              layout="attribute"
              language={language}
              value={archive.planting_region}
              canEdit={canEditArchive && !busy}
              onSave={async (region) => {
                await updateLocalArchiveFields(archive.id, { planting_region: region }, ownerContext);
                await onChanged();
              }}
            />
          ),
        }]
      : []),
    {
      label: archiveCopy.source,
      value: archive.source || archiveCopy.not_filled,
      field: "source" as const,
    },
    {
      label: archiveCopy.note,
      value: archive.note || archiveCopy.not_filled,
      field: "note" as const,
    },
    {
      label: archiveCopy.summary,
      value: archive.archive_summary || archiveCopy.not_filled,
      field: "archiveSummary" as const,
    },
    { label: archiveCopy.created_time, value: formatDate(archive.created_at) || archiveCopy.none },
    { label: archiveCopy.latest_update, value: formatDate(latestUpdate) || archiveCopy.none },
    { label: archiveCopy.record_count, value: `${detail.records.length}` },
    { label: archiveCopy.duration_days, value: durationText },
  ];

  return (
    <>
      <MobilePageHeaderView
        title={
          <span style={archiveProjectDetailHeaderTitleStyle}>
            <span style={archiveProjectDetailHeaderProjectStyle}>{archive.title}</span>
          </span>
        }
        titleText={archive.title}
        showBack
        ariaLabel={t.nav.back}
        onBack={onBack}
      />
      <main style={archiveProjectDetailMainStyle(true)}>
        <div style={archiveProjectDetailStatsStyle}>
          {archiveDisplayName ? (
            <span style={archiveProjectDetailGuideTextStyle}>{archiveDisplayName}</span>
          ) : null}
          {isCloudCache ? null : (
            <span style={archiveProjectDetailBadgeStyle}>{archiveCopy.local_project}</span>
          )}
          <ProjectMetaLine
            recordCount={detail.records.length}
            durationDays={ongoingDays}
            ended={archive.status === "ended"}
            order={["record", "duration"]}
            style={archiveProjectDetailMetaLineStyle}
          />
        </div>

        {isCloudCache ? (
          <div style={archiveProjectDetailReadOnlyNoticeStyle}>
            <span>{archiveCopy.cloud_read_only_notice}</span>
          </div>
        ) : (
          <div style={{ margin: "0 0 10px", color: "#617258", fontSize: 13, lineHeight: 1.45 }}>
            {archiveCopy.saved_on_this_device}
          </div>
        )}
        {showPendingNotice ? (
          <div style={{ margin: "0 0 10px", color: "#8a5a36", fontSize: 12, lineHeight: 1.4 }}>
            {archiveCopy.pending_sync_workspace_notice}
          </div>
        ) : null}

        <ArchiveProjectDetailTabs
          ariaLabel={archiveCopy.detail_navigation}
          active={activeDetailTab}
          onChange={setActiveDetailTab}
          labels={{
            records: archiveCopy.details,
            profile: archiveCopy.dossier,
            experience: language === "en"
              ? `${archiveCopy.experience_cards} (0)`
              : `${archiveCopy.experience_cards}（0）`,
          }}
        />

        {activeDetailTab === "profile" ? (
          <ArchiveDetailHeaderView
            project={projectView}
            eyebrow={archiveCopy.project_archive}
            latestUpdateText={`${archiveCopy.latest_update} ${formatDate(latestUpdate) || archiveCopy.none}`}
            recordCountText={`${archiveCopy.records} ${detail.records.length}`}
            durationText={ongoingDays ? durationText : undefined}
            hint={isCloudCache ? archiveCopy.cloud_read_only_notice : archiveCopy.saved_on_this_device}
            profileAlwaysOpen
            showPageChrome={false}
            showSystemNameInTitle={false}
            profileRows={profileRows}
            profileEditor={canEditArchive ? {
              values: {
                title: archive.title || "",
                category: archive.category,
                systemName: archive.system_name || archive.species_name || "",
                source: archive.source || "",
                note: archive.note || "",
                archiveSummary: archive.archive_summary || "",
              },
              onSaveField: saveProfileField,
              systemNameMode: "text",
            } : undefined}
            profileActions={canEditArchive ? (
              <div>
                <button
                  type="button"
                  onClick={() => setDeleteArchiveOpen(true)}
                  style={{
                    border: "1px solid #efd8d5",
                    borderRadius: 999,
                    background: "#fff",
                    color: "#9a4a42",
                    padding: "8px 14px",
                    fontSize: 13,
                    fontWeight: 750,
                  }}
                >
                  {archiveCopy.delete_local_project}
                </button>
              </div>
            ) : null}
            profileExtra={
              <div>
                <ArchiveOwnerSettingsFields
                  category={archive.category}
                  subTagId={archive.subcategory || null}
                  groupTagId={archive.group_name || null}
                  subTags={[]}
                  groupTags={[]}
                  maxDepth={1}
                  ended={archive.status === "ended"}
                  isPublic={false}
                  canWrite={canEditArchive && !busy}
                  busy={busy}
                  showVisibility={false}
                  onChangeSubcategory={() => undefined}
                  onChangeGroup={() => undefined}
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
              </div>
            }
          />
        ) : null}

        {activeDetailTab === "experience" ? (
          <div style={archiveProjectDetailEmptyStateStyle}>
            <div>{t.experience.no_cards}</div>
            <div style={archiveProjectDetailExperienceHintStyle}>
              {archiveCopy.local_experience_cards_hint}
            </div>
          </div>
        ) : null}

        {activeDetailTab === "records" ? (
          <ArchiveCycleTimeline
            cycles={cycleEnabled ? ((archive.cycles || []) as ArchiveCycle[]) : []}
            records={recordItems}
            category={archive.category}
            mobileMode
            canManage={canEditArchive && cycleEnabled}
            busy={busy}
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
            emptyState={
              <div style={archiveProjectDetailEmptyStateStyle}>
                {recordCopy.no_local_records}
              </div>
            }
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
          />
        ) : null}

        {lightboxImages.length > 0 ? (
          <ArchiveLightbox
            images={lightboxImages}
            index={lightboxIndex}
            onChange={setLightboxIndex}
            isMobileViewport
            metaText={lightboxMetaText}
            note={lightboxRecord?.note || ""}
            onClose={() => {
              setLightboxImages([]);
              setLightboxIndex(0);
              setLightboxRecord(null);
            }}
          />
        ) : null}

        {canAddRecord && activeDetailTab === "records" ? (
          <button type="button" onClick={onAddRecord} style={archiveProjectDetailFloatingAddStyle}>
            {recordCopy.add_record_short}
          </button>
        ) : null}

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
      </main>
    </>
  );
}
