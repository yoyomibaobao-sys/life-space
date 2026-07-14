"use client";

import { useState, type CSSProperties } from "react";
import {
  getArchiveCategoryIcon,
  getArchiveCategoryLabel,
} from "@/lib/archive-categories";
import type {
  ArchiveItem,
  GroupTagItem,
  PlantSpeciesOption,
  SubTagItem,
} from "@/lib/archive-page-types";
import { formatArchiveDate, getArchiveSystemName } from "@/lib/archive-page-utils";
import ArchiveCategoryDropdown from "@/components/archive/ArchiveCategoryDropdown";
import ArchiveGroupDropdown from "@/components/archive/ArchiveGroupDropdown";
import ArchivePlantNameEditor from "@/components/archive/ArchivePlantNameEditor";
import ArchiveSystemNameEditor from "@/components/archive/ArchiveSystemNameEditor";
import ArchiveProjectCard from "@/components/archive-ui/ArchiveProjectCard";
import type { ArchiveProjectView } from "@/components/archive-ui/types";

type Props = {
  item: ArchiveItem;
  ended?: boolean;
  subTags: SubTagItem[];
  groupTags: GroupTagItem[];
  editingPlantArchiveId: string | null;
  editingSpeciesId: string;
  editingPendingSpeciesName: string;
  editingPlantSearch: string;
  plantSuggestionsOpen: boolean;
  plantSearchResults: PlantSpeciesOption[];
  hasExactPlantMatch: boolean;
  editingSystemArchiveId: string | null;
  editingSystemSearch: string;
  editingSystemName: string;
  systemSuggestionsOpen: boolean;
  systemNameOptions: string[];
  hasExactSystemNameMatch: boolean;
  onNavigate: (id: string) => void;
  shouldIgnoreCardNavigation: (target: EventTarget | null) => boolean;
  onRenameTitle: (item: ArchiveItem) => void;
  onBeginEditPlant: (item: ArchiveItem) => void;
  onPlantSearchChange: (value: string) => void;
  onSelectPlantSpecies: (species: PlantSpeciesOption) => void;
  onSubmitPendingSpecies: () => void;
  onSavePlantSelection: (item: ArchiveItem) => void;
  onCancelPlantEditing: () => void;
  onBeginEditSystem: (item: ArchiveItem) => void;
  onSystemSearchChange: (value: string) => void;
  onSelectSystemName: (name: string) => void;
  onSaveSystemSelection: (item: ArchiveItem) => void;
  onCancelSystemEditing: () => void;
  onUpdateArchiveStatus: (item: ArchiveItem, nextStatus: "active" | "ended") => void;
  onTogglePublic: (item: ArchiveItem) => void;
  onUpdateArchiveCategory: (item: ArchiveItem, value: string) => void;
  onUpdateArchiveGroupTag: (item: ArchiveItem, value: string) => void;
  onDeleteArchive: (item: ArchiveItem) => void;
  mobileMode?: boolean;
};

type StatusPill = {
  key: string;
  label: string;
  style: {
    border: string;
    background: string;
    color: string;
  };
};

function buildStatusPills(item: ArchiveItem, ended: boolean): StatusPill[] {
  const pills: StatusPill[] = [];

  if (item.help_status === "open") {
    pills.push({
      key: "help-open",
      label: "求助中",
      style: {
        border: "1px solid #f3d7a3",
        background: "#fff7e8",
        color: "#b17100",
      },
    });
  }

  if (item.help_status === "resolved") {
    pills.push({
      key: "help-resolved",
      label: "求助已解决",
      style: {
        border: "1px solid #cfdcc6",
        background: "#f5f8f1",
        color: "#607356",
      },
    });
  }

  if (ended) {
    pills.push({
      key: "ended",
      label: "已结束",
      style: {
        border: "1px solid #d8ddd4",
        background: "#f3f3f3",
        color: "#777",
      },
    });
  }

  return pills;
}

function getLatestRecordPreview(item: ArchiveItem) {
  const note = item.latest_record_note?.trim();
  if (note) return note;
  if (item.latest_record_media_count && item.latest_record_media_count > 0) return "新增了图片记录";
  if (item.latest_record_time || item.last_record_time) return "新增了一条记录";
  return "";
}

function getOngoingDays(createdAt?: string | null) {
  if (!createdAt) return null;

  const startedAt = new Date(createdAt);
  if (Number.isNaN(startedAt.getTime())) return null;

  const startDate = new Date(startedAt.getFullYear(), startedAt.getMonth(), startedAt.getDate()).getTime();
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const dayMs = 24 * 60 * 60 * 1000;

  return Math.max(1, Math.floor((today - startDate) / dayMs) + 1);
}

export default function ArchiveCard({
  item,
  ended = false,
  subTags,
  groupTags,
  editingPlantArchiveId,
  editingSpeciesId,
  editingPendingSpeciesName,
  editingPlantSearch,
  plantSuggestionsOpen,
  plantSearchResults,
  hasExactPlantMatch,
  editingSystemArchiveId,
  editingSystemSearch,
  editingSystemName,
  systemSuggestionsOpen,
  systemNameOptions,
  hasExactSystemNameMatch,
  onNavigate,
  shouldIgnoreCardNavigation,
  onRenameTitle,
  onBeginEditPlant,
  onPlantSearchChange,
  onSelectPlantSpecies,
  onSubmitPendingSpecies,
  onSavePlantSelection,
  onCancelPlantEditing,
  onBeginEditSystem,
  onSystemSearchChange,
  onSelectSystemName,
  onSaveSystemSelection,
  onCancelSystemEditing,
  onUpdateArchiveStatus,
  onTogglePublic,
  onUpdateArchiveCategory,
  onUpdateArchiveGroupTag,
  onDeleteArchive,
  mobileMode = false,
}: Props) {
  const hasLatestRecord = Boolean(
    item.latest_record_time ||
      item.latest_record_note ||
      (item.latest_record_media_count && item.latest_record_media_count > 0)
  );
  const cardImageUrl =
    item.latest_record_primary_thumb_url ||
    item.latest_record_primary_image_url ||
    (!hasLatestRecord ? item.display_cover_image_url || "" : "");
  const cardImageAlt = item.latest_record_primary_image_url || item.latest_record_primary_thumb_url ? "最新记录图片" : item.title || "项目封面";
  const systemName = getArchiveSystemName(item);
  const mobileSystemName = getMobileArchiveSystemName(item);
  const latestRecordPreview = getLatestRecordPreview(item);
  const updateDate = formatArchiveDate(item.latest_record_time || item.last_record_time || item.created_at);
  const ongoingDays = getOngoingDays(item.created_at);
  const statusPills = buildStatusPills(item, ended);
  const availableGroupTags = item.sub_tag_id
    ? groupTags.filter((tag) => String(tag.sub_tag_id) === String(item.sub_tag_id))
    : [];

  if (mobileMode) {
    return (
      <MobileArchiveCard
        item={item}
        ended={ended}
        imageUrl={cardImageUrl}
        imageAlt={cardImageAlt}
        systemName={mobileSystemName}
        subTags={subTags}
        groupTags={groupTags}
        onNavigate={onNavigate}
        shouldIgnoreCardNavigation={shouldIgnoreCardNavigation}
        onTogglePublic={onTogglePublic}
        onUpdateArchiveStatus={onUpdateArchiveStatus}
        onUpdateArchiveCategory={onUpdateArchiveCategory}
        onUpdateArchiveGroupTag={onUpdateArchiveGroupTag}
        onDeleteArchive={onDeleteArchive}
      />
    );
  }

  return (
    <div
      onClick={(event) => {
        if (shouldIgnoreCardNavigation(event.target)) return;
        onNavigate(item.id);
      }}
      style={{
        display: "flex",
        alignItems: "stretch",
        cursor: "pointer",
        gap: 10,
        border: "1px solid #e4e6df",
        borderRadius: 14,
        padding: 10,
        marginBottom: 10,
        background: ended ? "#fafafa" : "#fff",
        opacity: ended ? 0.84 : 1,
        boxShadow: ended ? "none" : "0 8px 22px rgba(44, 74, 38, 0.04)",
      }}
    >
      <div
        style={{
          width: 104,
          height: 104,
          alignSelf: "center",
          flexShrink: 0,
          position: "relative",
        }}
      >
        {cardImageUrl ? (
          <img
            src={cardImageUrl}
            alt={cardImageAlt}
            loading="lazy"
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
              borderRadius: 11,
            }}
          />
        ) : (
          <div
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              background: "linear-gradient(135deg, #f4f7f1, #eef4ed)",
              borderRadius: 11,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 4,
              color: "#9aaa9a",
              fontSize: 24,
            }}
          >
            <span>{getArchiveCategoryIcon(item.category)}</span>
            {hasLatestRecord ? (
              <span style={{ fontSize: 11, color: "#8c9b88" }}>最新无图</span>
            ) : null}
          </div>
        )}
      </div>

      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "nowrap",
            marginBottom: 4,
            minWidth: 0,
          }}
        >
          <span
            style={{
              fontSize: 12,
              color: item.category === "plant" ? "#4b7244" : "#6c6c7a",
              background: item.category === "plant" ? "#edf6e9" : "#f1f1f5",
              borderRadius: 999,
              padding: "2px 7px",
              lineHeight: 1.3,
              flexShrink: 0,
              whiteSpace: "nowrap",
            }}
          >
            {getArchiveCategoryLabel(item.category)}
          </span>

          <div
            data-no-card-nav="true"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              minWidth: 0,
              flex: 1,
              fontWeight: 600,
              color: ended ? "#777" : "#1f2d1f",
              overflow:
                editingPlantArchiveId === item.id || editingSystemArchiveId === item.id
                  ? "visible"
                  : "hidden",
              textOverflow: "ellipsis",
              whiteSpace:
                editingPlantArchiveId === item.id || editingSystemArchiveId === item.id
                  ? "normal"
                  : "nowrap",
              position: "relative",
              zIndex:
                editingPlantArchiveId === item.id || editingSystemArchiveId === item.id
                  ? 50
                  : "auto",
            }}
          >
            <span
              onClick={(e) => {
                e.stopPropagation();
                onRenameTitle(item);
              }}
              style={{ cursor: "pointer", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
              title="点击可修改名称"
            >
              {item.title}
            </span>

            <span style={{ color: "#9a9a9a", fontWeight: 400, flexShrink: 0 }}>·</span>

            {editingPlantArchiveId === item.id && item.category === "plant" ? (
              <ArchivePlantNameEditor
                value={editingPlantSearch}
                pendingName={editingPendingSpeciesName}
                selectedSpeciesId={editingSpeciesId}
                suggestionsOpen={plantSuggestionsOpen}
                results={plantSearchResults}
                hasExactMatch={hasExactPlantMatch}
                onChange={onPlantSearchChange}
                onSelectSpecies={onSelectPlantSpecies}
                onSubmitPending={onSubmitPendingSpecies}
                onSave={() => onSavePlantSelection(item)}
                onCancel={onCancelPlantEditing}
              />
            ) : item.category === "plant" ? (
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  onBeginEditPlant(item);
                }}
                style={{
                  cursor: "pointer",
                  color: ended ? "#888" : "#546b4e",
                  fontWeight: 500,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                title="点击可修改系统名"
              >
                {systemName}
              </span>
            ) : editingSystemArchiveId === item.id ? (
              <ArchiveSystemNameEditor
                value={editingSystemSearch}
                selectedValue={editingSystemName}
                options={systemNameOptions}
                suggestionsOpen={systemSuggestionsOpen}
                hasExactMatch={hasExactSystemNameMatch}
                onChange={onSystemSearchChange}
                onSelect={onSelectSystemName}
                onSave={() => onSaveSystemSelection(item)}
                onCancel={onCancelSystemEditing}
              />
            ) : (
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  onBeginEditSystem(item);
                }}
                style={{
                  cursor: "pointer",
                  color: ended ? "#888" : "#546b4e",
                  fontWeight: 500,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                title="点击可修改具体名称"
              >
                {systemName}
              </span>
            )}
          </div>

          {statusPills.length > 0 ? (
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
              {statusPills.map((pill) => (
                <span
                  key={pill.key}
                  style={{
                    ...pill.style,
                    fontSize: 12,
                    padding: "2px 7px",
                    borderRadius: 999,
                    whiteSpace: "nowrap",
                  }}
                >
                  {pill.label}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        <div
          data-no-card-nav="true"
          onClick={(e) => e.stopPropagation()}
          style={{
            marginTop: 5,
            display: "flex",
            gap: 6,
            flexWrap: "wrap",
            fontSize: 12,
            alignItems: "center",
          }}
        >
          <button
            type="button"
            title={item.is_public ? "设为仅自己可见" : "公开"}
            onClick={(e) => {
              e.stopPropagation();
              onTogglePublic(item);
            }}
            style={{
              fontSize: 12,
              padding: "2px 7px",
              borderRadius: 999,
              border: item.is_public ? "1px solid #b7dfbb" : "1px solid #ddd",
              background: item.is_public ? "#f1fff1" : "#fff",
              color: item.is_public ? "#2f8f2f" : "#888",
              cursor: "pointer",
            }}
          >
            {item.is_public ? "公开发现" : "仅自己可见"}
          </button>

          <ArchiveCategoryDropdown
            value={item.sub_tag_id || item.category}
            subTags={subTags}
            onChange={(nextValue) => onUpdateArchiveCategory(item, nextValue)}
          />

          {item.sub_tag_id && availableGroupTags.length > 0 ? (
            <ArchiveGroupDropdown
              value={item.group_tag_id || ""}
              groupTags={availableGroupTags}
              onChange={(nextValue) => onUpdateArchiveGroupTag(item, nextValue)}
            />
          ) : null}
        </div>

        <div
          style={{
            fontSize: 13,
            color: ended ? "#888" : "#5f6f5b",
            marginTop: 5,
            lineHeight: 1.38,
            overflow: "hidden",
            textOverflow: "ellipsis",
            display: "-webkit-box",
            WebkitLineClamp: 1,
            WebkitBoxOrient: "vertical",
          }}
          title={latestRecordPreview ? `最新：${latestRecordPreview} · 更新 ${updateDate || "暂无"}` : `更新 ${updateDate || "暂无"}`}
        >
          {latestRecordPreview ? `最新：${latestRecordPreview} · 更新 ${updateDate || "暂无"}` : `更新 ${updateDate || "暂无"}`}
        </div>

        <div
          style={{
            fontSize: 12,
            color: "#999",
            marginTop: "auto",
            paddingTop: 5,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          记录 {item.record_count || 0}
          {ongoingDays ? ` · 已持续 ${ongoingDays} 天` : ""} · 浏览 {item.view_count || 0}
          {typeof item.follower_count !== "undefined" ? ` · 关注 ${item.follower_count || 0}` : ""}
        </div>
      </div>

      <div
  data-no-card-nav="true"
  onClick={(e) => e.stopPropagation()}
  style={{
    minWidth: 46,
    marginLeft: 4,
    paddingLeft: 8,
    borderLeft: "1px solid #f0f0ec",
    display: "flex",
    flexDirection: "column",
    justifyContent: "flex-end",
    alignItems: "flex-end",
    gap: 8,
  }}
>
  <button
    type="button"
    onClick={() => onUpdateArchiveStatus(item, ended ? "active" : "ended")}
    style={{
      border: "none",
      background: "transparent",
      color: ended ? "#4f8f46" : "#8a8f84",
      cursor: "pointer",
      fontSize: 12,
      padding: 0,
      whiteSpace: "nowrap",
    }}
  >
    {ended ? "恢复" : "结束"}
  </button>

  <button
    type="button"
    onClick={() => onDeleteArchive(item)}
          style={{
            border: "none",
            background: "transparent",
            color: "#d66",
            cursor: "pointer",
            fontSize: 12,
            padding: 0,
            whiteSpace: "nowrap",
          }}
        >
          删除
        </button>
      </div>
    </div>
  );
}

function MobileArchiveCard({
  item,
  ended,
  imageUrl,
  imageAlt,
  systemName,
  subTags,
  groupTags,
  onNavigate,
  shouldIgnoreCardNavigation,
  onTogglePublic,
  onUpdateArchiveStatus,
  onUpdateArchiveCategory,
  onUpdateArchiveGroupTag,
  onDeleteArchive,
}: {
  item: ArchiveItem;
  ended: boolean;
  imageUrl: string;
  imageAlt: string;
  systemName: string;
  subTags: SubTagItem[];
  groupTags: GroupTagItem[];
  onNavigate: (id: string) => void;
  shouldIgnoreCardNavigation: (target: EventTarget | null) => boolean;
  onTogglePublic: (item: ArchiveItem) => void;
  onUpdateArchiveStatus: (item: ArchiveItem, nextStatus: "active" | "ended") => void;
  onUpdateArchiveCategory: (item: ArchiveItem, value: string) => void;
  onUpdateArchiveGroupTag: (item: ArchiveItem, value: string) => void;
  onDeleteArchive: (item: ArchiveItem) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const ongoingDays = getOngoingDays(item.created_at);
  const mobilePrimaryStatsText = [
    `记录 ${item.record_count || 0}`,
    ongoingDays ? `已持续 ${ongoingDays} 天` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  const visibilityText = item.is_public ? "公开发现" : "仅自己可见";
  const mobileStatusDetailText = [
    `浏览 ${item.view_count || 0}`,
    typeof item.follower_count !== "undefined" ? `关注 ${item.follower_count || 0}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  const mobileEndedText = ended ? "已结束" : "";
  const availableGroupTags = item.sub_tag_id
    ? groupTags.filter((tag) => String(tag.sub_tag_id) === String(item.sub_tag_id))
    : [];
  const projectView: ArchiveProjectView = {
    id: item.id,
    mode: "cloud",
    title: item.title || "未命名项目",
    category: item.category,
    plantId: item.species_id,
    categoryLabel: getArchiveCategoryLabel(item.category),
    categoryIcon: getArchiveCategoryIcon(item.category),
    systemName,
    cover: imageUrl ? { kind: "url", url: imageUrl, alt: imageAlt } : null,
    latestText: null,
    visibilityLabel: visibilityText,
    visibilityTone: item.is_public ? "public" : "private",
    activityText: mobilePrimaryStatsText,
    mobilePrimaryStatsText,
    mobileSecondaryStatsText: mobileStatusDetailText,
    statusLabel: mobileEndedText,
    ended,
  };
  const selectControls = (
    <>
      <ArchiveCategoryDropdown
        value={item.sub_tag_id || item.category}
        subTags={subTags}
        compact
        onChange={(nextValue) => onUpdateArchiveCategory(item, nextValue)}
      />
      {item.sub_tag_id && availableGroupTags.length > 0 ? (
        <ArchiveGroupDropdown
          value={item.group_tag_id || ""}
          groupTags={availableGroupTags}
          compact
          onChange={(nextValue) => onUpdateArchiveGroupTag(item, nextValue)}
        />
      ) : null}
    </>
  );
  const actionSlot = (
    <div data-no-card-nav="true" onClick={(event) => event.stopPropagation()} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          setMenuOpen((open) => !open);
        }}
        aria-label="更多项目操作"
        style={mobileCardMoreButtonStyle}
      >
        ⋯
      </button>

      {menuOpen ? (
        <div style={mobileCardMenuStyle}>
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              onUpdateArchiveStatus(item, ended ? "active" : "ended");
            }}
            style={mobileCardMenuItemStyle}
          >
            {ended ? "恢复" : "结束"}
          </button>
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              onTogglePublic(item);
            }}
            style={mobileCardMenuItemStyle}
          >
            {item.is_public ? "设为私密" : "设为公开发现"}
          </button>
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              onDeleteArchive(item);
            }}
            style={mobileCardDangerMenuItemStyle}
          >
            删除项目
          </button>
        </div>
      ) : null}
    </div>
  );

  return (
    <ArchiveProjectCard
      project={projectView}
      onClick={() => onNavigate(item.id)}
      selectControls={selectControls}
      actionSlot={actionSlot}
      mobileMode
    />
  );
}

function getMobileArchiveSystemName(item: ArchiveItem) {
  if (item.category === "plant") {
    return item.species_display_name || item.species_name_snapshot || "未填写";
  }

  return item.system_name?.trim() || "未填写";
}

const mobileCardImageWrapStyle: CSSProperties = {
  position: "relative",
  width: 94,
  height: 94,
  flexShrink: 0,
  borderRadius: 11,
  overflow: "hidden",
  background: "#f4f7f1",
};

const mobileCardPlaceholderStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "linear-gradient(135deg, #f4f7f1, #eef4ed)",
  color: "#9aaa9a",
  fontSize: 28,
};

const mobileCardBodyStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  display: "flex",
  flexDirection: "column",
  gap: 4,
};

const mobileCardTitleRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  minWidth: 0,
};

const mobileCardMainTitleStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  color: "#1f2d1f",
  fontSize: 15,
  fontWeight: 800,
  lineHeight: 1.3,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const mobileCardTitleDividerStyle: CSSProperties = {
  color: "#9aa493",
  fontWeight: 500,
};

const mobileCardSystemNameStyle: CSSProperties = {
  color: "#53694d",
  fontWeight: 700,
};

const mobileCardStatusBadgeStyle: CSSProperties = {
  flexShrink: 0,
  borderRadius: 999,
  background: "#f4f8ef",
  color: "#5f7a55",
  border: "1px solid #dfe9d7",
  fontSize: 11,
  fontWeight: 800,
  lineHeight: 1,
  padding: "4px 7px",
};

const mobileCardMoreButtonStyle: CSSProperties = {
  flexShrink: 0,
  width: 30,
  height: 30,
  border: "1px solid #edf0e8",
  borderRadius: 999,
  background: "#fff",
  color: "#667066",
  fontSize: 19,
  lineHeight: 1,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
};

const mobileCardMetaStyle: CSSProperties = {
  color: "#60705b",
  fontSize: 12,
  lineHeight: 1.35,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const mobileCardSelectRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  minWidth: 0,
  overflow: "visible",
};

const mobileCardBottomRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  columnGap: 8,
  rowGap: 2,
  flexWrap: "wrap",
  minWidth: 0,
};

const mobileCardFourthLineStyle: CSSProperties = {
  flex: "1 1 150px",
  minWidth: 0,
  color: "#7f887a",
  fontSize: 12,
  fontWeight: 600,
  lineHeight: 1.35,
  whiteSpace: "normal",
};

function mobileVisibilityTextStyle(isPublic?: boolean | null): CSSProperties {
  return {
    color: isPublic ? "#2f8f2f" : "#888",
    fontWeight: 700,
  };
}

const mobileCardEndedStatusStyle: CSSProperties = {
  flex: "0 0 auto",
  marginLeft: "auto",
  color: "#767f73",
  fontSize: 12,
  fontWeight: 800,
  lineHeight: 1.35,
  whiteSpace: "nowrap",
};

const mobileCardMenuStyle: CSSProperties = {
  position: "absolute",
  top: 42,
  right: 8,
  zIndex: 20,
  width: 132,
  border: "1px solid #e6ebdf",
  borderRadius: 12,
  background: "#fff",
  boxShadow: "0 16px 34px rgba(39, 58, 34, 0.16)",
  padding: 5,
};

const mobileCardMenuItemStyle: CSSProperties = {
  width: "100%",
  minHeight: 34,
  border: "none",
  borderRadius: 9,
  background: "transparent",
  color: "#40583a",
  padding: "0 10px",
  textAlign: "left",
  fontSize: 13,
  fontWeight: 700,
  whiteSpace: "nowrap",
  cursor: "pointer",
};

const mobileCardDangerMenuItemStyle: CSSProperties = {
  ...mobileCardMenuItemStyle,
  color: "#c85f5a",
};
