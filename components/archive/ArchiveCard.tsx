"use client";

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
}: Props) {
  const cover = item.cover_image_url || "";
  const systemName = getArchiveSystemName(item);
  const updateDate = formatArchiveDate(item.last_record_time || item.created_at);
  const statusPills = buildStatusPills(item, ended);
  const availableGroupTags = item.sub_tag_id
    ? groupTags.filter((tag) => String(tag.sub_tag_id) === String(item.sub_tag_id))
    : [];

  return (
    <div
      onClick={(event) => {
        if (shouldIgnoreCardNavigation(event.target)) return;
        onNavigate(item.id);
      }}
      style={{
        display: "flex",
        cursor: "pointer",
        gap: 12,
        border: "1px solid #e4e6df",
        borderRadius: 16,
        padding: 12,
        marginBottom: 12,
        background: ended ? "#fafafa" : "#fff",
        opacity: ended ? 0.84 : 1,
        boxShadow: ended ? "none" : "0 8px 22px rgba(44, 74, 38, 0.04)",
      }}
    >
      <div style={{ width: 100, height: 100, flexShrink: 0 }}>
        {cover ? (
          <img
            src={cover}
            alt={item.title || "项目封面"}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              borderRadius: 12,
            }}
          />
        ) : (
          <div
            style={{
              width: "100%",
              height: "100%",
              background: "linear-gradient(135deg, #f4f7f1, #eef4ed)",
              borderRadius: 12,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#9aaa9a",
              fontSize: 24,
            }}
          >
            {getArchiveCategoryIcon(item.category)}
          </div>
        )}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
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
              padding: "3px 8px",
              lineHeight: 1.3,
              flexShrink: 0,
            }}
          >
            {getArchiveCategoryLabel(item.category)}
          </span>

          {statusPills.length > 0 ? (
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0, flexWrap: "wrap" }}>
              {statusPills.map((pill) => (
                <span
                  key={pill.key}
                  style={{
                    ...pill.style,
                    fontSize: 12,
                    padding: "3px 8px",
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
          style={{
            display: "flex",
            alignItems: "center",
            gap: 7,
            minWidth: 0,
            flex: 1,
          }}
        >
          <div
            style={{
              fontWeight: 600,
              color: ended ? "#777" : "#1f2d1f",
              minWidth: 0,
              overflow:
                editingPlantArchiveId === item.id || editingSystemArchiveId === item.id
                  ? "visible"
                  : "hidden",
              textOverflow: "ellipsis",
              whiteSpace:
                editingPlantArchiveId === item.id || editingSystemArchiveId === item.id
                  ? "normal"
                  : "nowrap",
              flex: 1,
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
              style={{ cursor: "pointer" }}
              title="点击可修改名称"
            >
              {item.title}
            </span>

            <span style={{ color: "#9a9a9a", fontWeight: 400 }}> · </span>

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
                }}
                title="点击可修改系统植物名"
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
                }}
                title="点击可修改系统名"
              >
                {systemName}
              </span>
            )}
          </div>
        </div>

        <div
          data-no-card-nav="true"
          onClick={(e) => e.stopPropagation()}
          style={{
            marginTop: 8,
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            fontSize: 12,
            alignItems: "center",
          }}
        >
          <button
            type="button"
            title={item.is_public ? "点击设为私密" : "点击公开到发现"}
            onClick={(e) => {
              e.stopPropagation();
              onTogglePublic(item);
            }}
            style={{
              fontSize: 12,
              padding: "3px 8px",
              borderRadius: 999,
              border: item.is_public ? "1px solid #b7dfbb" : "1px solid #ddd",
              background: item.is_public ? "#f1fff1" : "#fff",
              color: item.is_public ? "#2f8f2f" : "#888",
              cursor: "pointer",
            }}
          >
            {item.is_public ? "已公开" : "私密"}
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
            fontSize: 12,
            color: "#999",
            marginTop: 8,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          更新 {updateDate || "暂无"} · 共 {item.record_count || 0} 条记录 · 浏览 {item.view_count || 0}
          {typeof item.follower_count !== "undefined" ? ` · 关注 ${item.follower_count || 0}` : ""}
        </div>
      </div>

      <div
  data-no-card-nav="true"
  onClick={(e) => e.stopPropagation()}
  style={{
    minWidth: 58,
    marginLeft: 10,
    paddingLeft: 12,
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
