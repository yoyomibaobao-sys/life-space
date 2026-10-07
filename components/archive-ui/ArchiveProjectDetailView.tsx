"use client";

import type { CSSProperties, ReactNode } from "react";
import ArchiveCycleTimeline from "@/components/archive-detail/ArchiveCycleTimeline";
import ArchiveDetailHeader from "@/components/archive-detail/ArchiveDetailHeader";
import ArchiveLightbox from "@/components/archive-detail/ArchiveLightbox";
import type { ArchiveProfileSystemNameValue, ArchiveSystemNameCandidate } from "@/components/archive-ui/ArchiveDetailHeaderView";
import ArchiveProjectDetailTabs from "@/components/archive-ui/ArchiveProjectDetailTabs";
import {
  archiveProjectDetailBadgeStyle,
  archiveProjectDetailEmptyStateStyle,
  archiveProjectDetailFloatingAddStyle,
  archiveProjectDetailGuideLinkStyle,
  archiveProjectDetailGuideTextStyle,
  archiveProjectDetailHeaderProjectStyle,
  archiveProjectDetailHeaderTitleStyle,
  archiveProjectDetailMainStyle,
  archiveProjectDetailReadOnlyNoticeStyle,
  archiveProjectDetailStatsStyle,
  type ArchiveProjectDetailTabId,
} from "@/components/archive-ui/archiveProjectDetailLayout";
import MobilePageHeader from "@/components/mobile/MobilePageHeader";
import MobilePageHeaderView from "@/components/mobile/MobilePageHeaderView";
import InternalLink from "@/components/navigation/InternalLink";
import ProjectMetaLine from "@/components/ui/ProjectMetaLine";
import UiIcon from "@/components/ui/UiIcon";
import type { ArchiveCategory } from "@/lib/archive-categories";
import type {
  ArchiveCycle,
  ArchiveDetailArchive,
  ArchiveMode,
  LightboxImage,
  RecordItem,
} from "@/lib/archive-detail-types";
import type { PlantingRegion } from "@/lib/planting-region";

export type ArchiveProjectDetailCapabilities = {
  canFollow?: boolean;
  canWriteArchive: boolean;
  canAddRecord?: boolean;
  canManageCycle: boolean;
  canSaveToLocal?: boolean;
  canDeleteArchive?: boolean;
  canToggleVisibility?: boolean;
};

// All data adapters target this single detail contract; their writable actions
// differ through capabilities and handlers, not a separate presentation.
export type ArchiveProjectDetailPresentationModel = Parameters<typeof ArchiveProjectDetailView>[0];

export default function ArchiveProjectDetailView({
  archive,
  records,
  cycles,
  cycleEnabled,
  mode,
  capabilities,
  isMobileViewport,
  language,
  copy,
  username,
  archiveDisplayName,
  archiveCategoryLabel,
  archiveSubcategoryLabel,
  archiveGroupLabel,
  encyclopediaHref,
  systemNameCandidates,
  systemNameCandidatesLoading,
  systemNameMode = "candidate",
  latestUpdate,
  recordCount,
  viewCount = 0,
  followerCount = 0,
  durationDays,
  isProjectFollowed = false,
  onToggleFollow,
  reportSlot,
  statusBadge,
  statusNotice,
  activeTab,
  onTabChange,
  experienceTabLabel,
  experienceContent,
  profileExtra,
  mobileOwnerSettings,
  onToggleArchiveVisibility,
  onToggleArchiveStatus,
  onSaveToLocal,
  saveToLocalLabel,
  saveToLocalDisabled,
  onDeleteArchive,
  onSaveTitle,
  onSaveCategory,
  onSaveSystemName,
  onSaveSource,
  onSaveNote,
  onSaveArchiveSummary,
  onSavePlantingRegion,
  storageLabel,
  storageTone,
  visibilityLabel,
  headerFallbackHref,
  headerBackLabel,
  onHeaderBack,
  headerRight,
  desktopFollow,
  recordComposer,
  timelineBusy = false,
  onStartCycle,
  onEndCycle,
  onUpdateCycleDates,
  onRenameCycle,
  onDeleteCycle,
  emptyRecordsText,
  renderRecord,
  lightbox,
  floatingAddLabel,
  onFloatingAdd,
  extra,
  dialogs,
}: {
  archive: ArchiveDetailArchive;
  records: RecordItem[];
  cycles: ArchiveCycle[];
  cycleEnabled: boolean;
  mode: ArchiveMode;
  capabilities: ArchiveProjectDetailCapabilities;
  isMobileViewport: boolean;
  language: string;
  copy: {
    details: string;
    dossier: string;
    experience_cards: string;
    detail_navigation: string;
    follow_project: string;
    followed_project: string;
    back_to_my_projects: string;
    enter_user_space_prefix: string;
    enter_user_space_suffix: string;
    add_record_short?: string;
  };
  username: string;
  archiveDisplayName: string;
  archiveCategoryLabel: string;
  archiveSubcategoryLabel?: string | null;
  archiveGroupLabel?: string | null;
  encyclopediaHref?: string | null;
  systemNameCandidates?: ArchiveSystemNameCandidate[];
  systemNameCandidatesLoading?: boolean;
  systemNameMode?: "candidate" | "text";
  latestUpdate?: string | null;
  recordCount: number;
  viewCount?: number;
  followerCount?: number;
  durationDays: number | null;
  isProjectFollowed?: boolean;
  onToggleFollow?: () => void;
  reportSlot?: ReactNode;
  statusBadge?: ReactNode;
  statusNotice?: ReactNode;
  activeTab: ArchiveProjectDetailTabId;
  onTabChange: (tab: ArchiveProjectDetailTabId) => void;
  experienceTabLabel: string;
  experienceContent: ReactNode;
  profileExtra?: ReactNode;
  mobileOwnerSettings?: ReactNode;
  onToggleArchiveVisibility: () => void;
  onToggleArchiveStatus?: () => void;
  onSaveToLocal?: () => void;
  saveToLocalLabel?: string;
  saveToLocalDisabled?: boolean;
  onDeleteArchive?: () => void;
  onSaveTitle?: (value: string) => Promise<void> | void;
  onSaveCategory?: (value: ArchiveCategory) => Promise<void> | void;
  onSaveSystemName?: (value: ArchiveProfileSystemNameValue) => Promise<void> | void;
  onSaveSource?: (value: string) => Promise<void> | void;
  onSaveNote?: (value: string) => Promise<void> | void;
  onSaveArchiveSummary?: (value: string) => Promise<void> | void;
  onSavePlantingRegion?: (region: PlantingRegion) => Promise<void>;
  storageLabel?: string;
  storageTone?: "cloud" | "device";
  visibilityLabel?: string | null;
  headerFallbackHref: string;
  headerBackLabel: string;
  onHeaderBack?: () => void;
  headerRight?: ReactNode;
  desktopFollow?: ReactNode;
  recordComposer?: ReactNode;
  timelineBusy?: boolean;
  onStartCycle?: (startedAt: string) => Promise<void> | void;
  onEndCycle?: (cycle: ArchiveCycle, endedAt: string) => Promise<void> | void;
  onUpdateCycleDates?: (
    cycle: ArchiveCycle,
    dates: { startedAt: string; endedAt: string | null },
  ) => Promise<void> | void;
  onRenameCycle?: (cycle: ArchiveCycle, displayName: string) => Promise<void> | void;
  onDeleteCycle?: (cycle: ArchiveCycle) => Promise<boolean> | boolean;
  emptyRecordsText: string;
  renderRecord: (item: RecordItem, index: number) => ReactNode;
  lightbox?: {
    images: LightboxImage[];
    index: number;
    onChange: (index: number) => void;
    metaText: string;
    note: string;
    onClose: () => void;
    onDeleteCurrentImage?: (
      image: LightboxImage,
      currentIndex: number,
    ) => Promise<number>;
    publishHref?: string;
    deleteActionLabel?: string;
    deleteConfirmMessage?: string;
  } | null;
  floatingAddLabel?: string;
  onFloatingAdd?: () => void;
  extra?: ReactNode;
  dialogs?: ReactNode;
}) {
  const followButton = capabilities.canFollow && onToggleFollow ? (
    <button
      type="button"
      onClick={() => void onToggleFollow()}
      style={mobileProjectFollowStyle(isProjectFollowed)}
    >
      {isProjectFollowed ? copy.followed_project : copy.follow_project}
    </button>
  ) : null;

  const titleNode = (
    <span style={archiveProjectDetailHeaderTitleStyle}>
      <span style={archiveProjectDetailHeaderProjectStyle}>{archive.title}</span>
    </span>
  );

  return (
    <>
      {onHeaderBack ? (
        <MobilePageHeaderView
          title={titleNode}
          titleText={archive.title}
          showBack
          ariaLabel={headerBackLabel}
          onBack={onHeaderBack}
          right={headerRight ?? followButton}
        />
      ) : (
        <MobilePageHeader
          title={titleNode}
          titleText={archive.title}
          fallbackHref={headerFallbackHref}
          ariaLabel={headerBackLabel}
          right={headerRight ?? followButton}
        />
      )}
      <main
        data-archive-project-detail-view="true"
        style={archiveProjectDetailMainStyle(isMobileViewport)}
      >
        {!isMobileViewport ? <header style={projectPageHeaderStyle}>
          <InternalLink
            href={headerFallbackHref}
            style={projectPageBackLinkStyle}
            aria-label={headerBackLabel}
          >
            <UiIcon name="arrow-left" size={16} />
            <span>{headerBackLabel}</span>
          </InternalLink>
          <h1 style={projectPageTitleStyle}>{archive.title}</h1>
          {desktopFollow ?? (capabilities.canFollow && onToggleFollow ? (
            <button
              type="button"
              onClick={() => void onToggleFollow()}
              style={projectPageFollowStyle(isProjectFollowed)}
            >
              {isProjectFollowed ? copy.followed_project : copy.follow_project}
            </button>
          ) : (
            <span aria-hidden="true" />
          ))}
        </header> : null}

        <div style={archiveProjectDetailStatsStyle}>
          {reportSlot}
          {archiveDisplayName ? (
            encyclopediaHref ? (
              <InternalLink href={encyclopediaHref} style={archiveProjectDetailGuideLinkStyle}>
                {archiveDisplayName}
              </InternalLink>
            ) : (
              <span style={archiveProjectDetailGuideTextStyle}>{archiveDisplayName}</span>
            )
          ) : null}
          {statusBadge ? (
            <span style={archiveProjectDetailBadgeStyle}>{statusBadge}</span>
          ) : null}
          <ProjectMetaLine
            followerCount={followerCount}
            viewCount={viewCount}
            textViewCount
            recordCount={recordCount}
            durationDays={durationDays}
            ended={archive.status === "ended"}
            order={["view", "follow", "record", "duration"]}
            style={{ minWidth: 0, flex: "1 1 auto", gap: "5px 10px", fontSize: 13 }}
          />
        </div>

        {statusNotice}

        <ArchiveProjectDetailTabs
          ariaLabel={copy.detail_navigation}
          active={activeTab}
          onChange={onTabChange}
          labels={{
            records: copy.details,
            profile: copy.dossier,
            experience: experienceTabLabel,
          }}
        />

        {activeTab === "profile" ? (
          <>
            <div id="archive-profile" style={archiveDetailAnchorStyle}>
              <ArchiveDetailHeader
                mode={mode}
                canWriteCloud={capabilities.canWriteArchive}
                archive={archive}
                username={username}
                archiveDisplayName={archiveDisplayName}
                archiveCategoryLabel={archiveCategoryLabel}
                archiveSubcategoryLabel={archiveSubcategoryLabel}
                archiveGroupLabel={archiveGroupLabel}
                latestUpdate={latestUpdate}
                recordCount={recordCount}
                encyclopediaHref={encyclopediaHref}
                systemNameCandidates={systemNameCandidates}
                systemNameCandidatesLoading={systemNameCandidatesLoading}
                systemNameMode={systemNameMode}
                showPageChrome={false}
                showProfileActions={!isMobileViewport}
                onToggleArchiveVisibility={onToggleArchiveVisibility}
                onToggleArchiveStatus={onToggleArchiveStatus}
                onSaveToLocal={onSaveToLocal}
                saveToLocalLabel={saveToLocalLabel}
                saveToLocalDisabled={saveToLocalDisabled}
                onDeleteArchive={onDeleteArchive}
                onSaveTitle={onSaveTitle}
                onSaveCategory={onSaveCategory}
                onSaveSystemName={onSaveSystemName}
                onSaveSource={onSaveSource}
                onSaveNote={onSaveNote}
                onSaveArchiveSummary={onSaveArchiveSummary}
                onSavePlantingRegion={onSavePlantingRegion}
                storageLabel={storageLabel}
                storageTone={storageTone}
                visibilityLabel={visibilityLabel}
                profileExtra={profileExtra}
              />
            </div>
            {isMobileViewport && mode === "owner" ? mobileOwnerSettings : null}
          </>
        ) : null}

        {activeTab === "experience" ? experienceContent : null}

        {mode === "owner" && capabilities.canAddRecord && activeTab === "records"
          ? recordComposer
          : null}

        {activeTab === "records" ? (
          <ArchiveCycleTimeline
            cycles={cycleEnabled ? cycles : []}
            records={records}
            category={archive.category}
            mobileMode={isMobileViewport}
            canManage={capabilities.canManageCycle && cycleEnabled}
            busy={timelineBusy}
            onStartCycle={cycleEnabled ? onStartCycle : undefined}
            onEndCycle={cycleEnabled ? onEndCycle : undefined}
            onUpdateCycleDates={cycleEnabled ? onUpdateCycleDates : undefined}
            onRenameCycle={cycleEnabled ? onRenameCycle : undefined}
            onDeleteCycle={cycleEnabled ? onDeleteCycle : undefined}
            emptyState={
              <div style={archiveProjectDetailEmptyStateStyle}>{emptyRecordsText}</div>
            }
            renderRecord={renderRecord}
          />
        ) : null}

        {extra}
      </main>

      {lightbox && lightbox.images.length > 0 ? (
        <ArchiveLightbox
          images={lightbox.images}
          index={lightbox.index}
          onChange={lightbox.onChange}
          isMobileViewport={isMobileViewport}
          metaText={lightbox.metaText}
          note={lightbox.note}
          onDeleteCurrentImage={lightbox.onDeleteCurrentImage}
          publishHref={lightbox.publishHref}
          deleteActionLabel={lightbox.deleteActionLabel}
          deleteConfirmMessage={lightbox.deleteConfirmMessage}
          onClose={lightbox.onClose}
        />
      ) : null}

      {capabilities.canAddRecord && onFloatingAdd && activeTab === "records" ? (
        <button type="button" onClick={onFloatingAdd} style={archiveProjectDetailFloatingAddStyle}>
          {floatingAddLabel || copy.add_record_short || "+"}
        </button>
      ) : null}

      {dialogs}
    </>
  );
}

function mobileProjectFollowStyle(followed: boolean): CSSProperties {
  return {
    minWidth: 0,
    maxWidth: 94,
    minHeight: 34,
    overflow: "hidden",
    border: followed ? "1px solid #dce3db" : "1px solid #c9ddc4",
    borderRadius: 999,
    background: followed ? "#f6f7f5" : "#edf7ea",
    color: followed ? "#687267" : "#35693d",
    padding: "0 8px",
    fontSize: 11.5,
    fontWeight: 750,
    lineHeight: 1.15,
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    cursor: "pointer",
  };
}

const projectPageHeaderStyle: CSSProperties = {
  minHeight: 48,
  display: "grid",
  gridTemplateColumns: "auto minmax(0, 1fr) auto",
  alignItems: "center",
  gap: 10,
  marginBottom: 8,
};

const projectPageBackLinkStyle: CSSProperties = {
  minWidth: 0,
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  color: "#52694f",
  fontSize: 14,
  fontWeight: 730,
  textDecoration: "none",
  whiteSpace: "nowrap",
};

const projectPageTitleStyle: CSSProperties = {
  minWidth: 0,
  margin: 0,
  overflow: "hidden",
  color: "#243424",
  fontSize: "clamp(19px, 4.6vw, 28px)",
  lineHeight: 1.25,
  textAlign: "center",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

function projectPageFollowStyle(followed: boolean): CSSProperties {
  return {
    minHeight: 34,
    flexShrink: 0,
    border: followed ? "1px solid #dce3db" : "1px solid #c9ddc4",
    borderRadius: 999,
    background: followed ? "#f6f7f5" : "#edf7ea",
    color: followed ? "#687267" : "#35693d",
    padding: "0 10px",
    fontSize: 12.5,
    fontWeight: 750,
    cursor: "pointer",
  };
}

const archiveDetailAnchorStyle: CSSProperties = {
  scrollMarginTop: 12,
};

export const archiveProjectDetailNoticeLinkStyle: CSSProperties = {
  flexShrink: 0,
  color: "#3f743b",
  fontWeight: 800,
  textDecoration: "none",
};

export { archiveProjectDetailReadOnlyNoticeStyle };
