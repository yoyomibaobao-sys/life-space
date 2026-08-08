"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import ExperienceCardListCard from "@/components/experience-card/ExperienceCardListCard";
import UiIcon from "@/components/ui/UiIcon";
import { useParams, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { formatCardDate } from "@/lib/date-time";
import { hydrateExperienceCardListItems } from "@/lib/experience-cards";
import type { ExperienceCardListItem, ExperienceCardRow } from "@/lib/experience-card-types";
import { getEnvironmentDetailItems, getEnvironmentTags } from "@/lib/plant-env";
import { resolveMediaDisplayPairs } from "@/lib/media-urls";
import {
  canAccessMembershipGuidance,
  normalizeMembershipRpcResult,
} from "@/lib/membership";
import {
  loadPlantBasicOverviewsCompat,
  loadPlantCoreParametersCompat,
  type PlantBasicOverviewCompatRow,
} from "@/lib/plant-guide-compat";
import { isStrongSystemNameAliasRelationType } from "@/lib/system-name-candidates";
import type {
  ActionMessage,
  PlantAliasRow,
  PlantCareGuideRow,
  PlantParametersRow,
  PlantRelatedArchiveItem,
  PlantSpeciesI18nRow,
  PlantSpeciesRow,
} from "@/lib/plant-detail-types";

type PlantGrowthCycleRow = {
  species_id: string;
  germination_days?: number | null;
  seedling_days?: number | null;
  vegetative_days?: number | null;
  flowering_days?: number | null;
  harvest_days?: number | null;
};

type PlantBasicOverviewRow = PlantBasicOverviewCompatRow;

type RelatedArchiveSourceRow = {
  id: string;
  user_id?: string | null;
  title?: string | null;
  system_name?: string | null;
  species_id?: string | null;
  species_name_snapshot?: string | null;
  is_public?: boolean | null;
  status?: string | null;
  ended_at?: string | null;
  help_status?: string | null;
  cover_image_url?: string | null;
  cover_image_path?: string | null;
  cover_thumb_path?: string | null;
  created_at?: string | null;
};

type RelatedArchiveRecordRow = {
  id?: string | null;
  archive_id?: string | null;
  note?: string | null;
  record_time?: string | null;
  primary_image_url?: string | null;
};

type RelatedArchiveMediaRow = {
  record_id?: string | null;
  url?: string | null;
  thumb_url?: string | null;
  storage_path?: string | null;
  thumb_path?: string | null;
};

type PlantAliasSearchRow = PlantAliasRow & {
  relation_type?: string | null;
};

type PlantDetailTab = "guide" | "experience" | "records";

type PlantExperienceCardItem = ExperienceCardListItem;

const RELATED_ARCHIVE_LIMIT = 24;

const categoryLabels: Record<string, string> = {
  vegetable: "蔬菜 / 蔬果",
  fruit: "果树 / 果类",
  herb: "香草 / 药草",
  flower: "花卉",
  houseplant: "观叶植物",
  succulent: "多肉 / 仙人掌",
  grain: "谷物 / 作物",
  field_crop: "谷物 / 作物",
  tree: "乔木 / 灌木",
};

const subCategoryLabels: Record<string, string> = {
  leafy_vegetable: "叶菜类",
  leafy: "叶菜类",
  fruiting_vegetable: "茄果 / 瓜果类",
  root_vegetable: "根茎 / 块茎类",
  root: "根茎类",
  legume: "豆类",
  allium: "葱蒜类",
  cucurbit: "瓜类",
  citrus: "柑橘类",
  berry: "浆果类",
  berry_vine_fruit: "浆果 / 藤本果类",
  pome_stone_fruit: "仁果 / 核果类",
  tropical_subtropical_fruit: "热带 / 亚热带果类",
  tree_fruit: "果树类",
  herb: "香草类",
  flowering_shrub: "花灌木",
  flowering_tree: "观花树木",
  annual_flower: "一年生花卉",
  perennial_flower: "多年生花卉",
  flower: "花卉类",
  houseplant: "观叶类",
  foliage: "观叶",
  succulent: "多肉类",
  cactus: "仙人掌",
  field_crop: "田园作物",
  grain: "谷物类",
};

const photoperiodLabels: Record<string, string> = {
  long_day: "长日照",
  short_day: "短日照",
  day_neutral: "日中性",
  intermediate_day: "中日照",
  cultivar_dependent: "品种相关",
};

const stageLabels: Record<string, string> = {
  flowering: "开花",
  fruiting: "结果",
  bolting: "抽薹",
  tuberization: "块茎形成",
  bulb_formation: "鳞茎膨大",
  dormancy: "休眠",
  flower_bud_init: "花芽分化",
};

function isEmpty(value: unknown) {
  return value === null || value === undefined || value === "";
}

function hasText(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

function formatRange(min: unknown, max: unknown, suffix = "") {
  if (isEmpty(min) && isEmpty(max)) return null;

  if (!isEmpty(min) && !isEmpty(max)) {
    if (String(min) === String(max)) return `${min}${suffix}`;
    return `${min}–${max}${suffix}`;
  }

  if (!isEmpty(min)) return `${min}${suffix}以上`;
  return `${max}${suffix}以下`;
}

function scoreLabel(value: unknown) {
  if (isEmpty(value)) return null;
  return `${value}/10`;
}

function phRequirementLabel(value: unknown) {
  if (isEmpty(value)) return null;

  const score = Number(value);
  if (Number.isNaN(score)) return null;

  if (score <= 2) return "适应范围很宽";
  if (score <= 4) return "适应范围较宽";
  if (score <= 6) return "中等敏感";
  if (score <= 8) return "较敏感";
  return "很敏感";
}

function phRequirementText(parameters: PlantParametersRow | null | undefined) {
  const sensitivity = phRequirementLabel(parameters?.ph_sensitivity_score);
  const phRange = formatRange(parameters?.ph_min, parameters?.ph_max);

  if (!sensitivity && !phRange) return null;
  if (sensitivity && phRange) return `${sensitivity}（pH ${phRange}）`;
  if (sensitivity) return sensitivity;
  return `适宜 pH ${phRange}`;
}

function difficultyMeta(value: unknown) {
  if (isEmpty(value)) return null;

  const score = Number(value);
  if (Number.isNaN(score)) return null;

  if (score <= 1) return { rating: 0, label: "野生级", detail: `${score}/10` };
  if (score <= 3) return { rating: 1, label: "非常容易", detail: `${score}/10` };
  if (score <= 5) return { rating: 2, label: "容易", detail: `${score}/10` };
  if (score <= 7) return { rating: 3, label: "中等", detail: `${score}/10` };
  if (score <= 9) return { rating: 4, label: "较难", detail: `${score}/10` };

  return { rating: 5, label: "专业种植", detail: `${score}/10` };
}

function categoryLabel(value?: string | null) {
  if (!value) return "未分类";
  return categoryLabels[value] || value;
}

function subCategoryLabel(value?: string | null) {
  if (!value) return "";
  return subCategoryLabels[value] || value;
}

function uniqueTextList(items: unknown[]) {
  const seen = new Set<string>();

  return items
    .map((item) => String(item ?? "").trim())
    .filter((item) => {
      if (!item) return false;

      const key = item.toLowerCase();
      if (seen.has(key)) return false;

      seen.add(key);
      return true;
    });
}

function buildPlantNameTerms(
  plant: PlantSpeciesRow | null,
  i18nRows: PlantSpeciesI18nRow[],
  aliasRows: PlantAliasSearchRow[]
) {
  return uniqueTextList([
    plant?.common_name,
    plant?.scientific_name,
    ...i18nRows.map((item) => item.common_name),
    ...aliasRows
      .filter((item) => isStrongSystemNameAliasRelationType(item.relation_type))
      .map((item) => item.alias_name),
  ]).slice(0, 8);
}

function sanitizeArchiveMatchTerm(value: string) {
  return value.replace(/[,%()]/g, " ").replace(/\s+/g, " ").trim();
}

function buildArchiveMatchFilter(plantId: string, terms: string[]) {
  const filters = [`species_id.eq.${plantId}`];

  terms
    .map(sanitizeArchiveMatchTerm)
    .filter((term) => term.length >= 2)
    .slice(0, 6)
    .forEach((term) => {
      filters.push(`species_name_snapshot.ilike.%${term}%`);
      filters.push(`system_name.ilike.%${term}%`);
    });

  return filters.join(",");
}

async function buildArchiveItemsFromRows(
  rows: RelatedArchiveSourceRow[],
  currentUserId?: string | null,
  options: { recordScope?: "public" | "all" } = {}
) {
  const archiveIds = uniqueTextList(rows.map((row) => row.id));
  const publicRecordCountMap = new Map<string, number>();
  const latestPublicRecordMap = new Map<string, RelatedArchiveRecordRow>();
  const latestPublicMediaMap = new Map<string, RelatedArchiveMediaRow>();

  if (archiveIds.length > 0) {
    const baseRecordQuery = supabase
      .from("records")
      .select("id, archive_id, note, record_time, primary_image_url")
      .in("archive_id", archiveIds);
    const recordQuery =
      options.recordScope === "all"
        ? baseRecordQuery
        : baseRecordQuery.eq("visibility", "public");
    const { data: recordRows, error } = await recordQuery
      .order("record_time", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false, nullsFirst: false });

    if (error) {
      console.error("load related archive records error:", error);
    } else {
      const relatedRecords = (recordRows || []) as RelatedArchiveRecordRow[];
      relatedRecords.forEach((record) => {
        if (!record.archive_id) return;

        publicRecordCountMap.set(
          record.archive_id,
          (publicRecordCountMap.get(record.archive_id) || 0) + 1
        );

        if (!latestPublicRecordMap.has(record.archive_id)) {
          latestPublicRecordMap.set(record.archive_id, record);
        }
      });

      const latestRecordIds = Array.from(latestPublicRecordMap.values())
        .map((record) => record.id)
        .filter((recordId): recordId is string => Boolean(recordId));

      if (latestRecordIds.length > 0) {
        const { data: mediaRows, error: mediaError } = await supabase
          .from("media")
          .select("record_id, url, thumb_url, storage_path, thumb_path, sort_order, created_at")
          .in("record_id", latestRecordIds)
          .eq("type", "image")
          .order("sort_order", { ascending: true })
          .order("created_at", { ascending: true });

        if (mediaError) {
          console.error("load related archive media error:", mediaError);
        } else {
          ((mediaRows || []) as RelatedArchiveMediaRow[]).forEach((media) => {
            if (!media.record_id || latestPublicMediaMap.has(media.record_id)) return;
            latestPublicMediaMap.set(media.record_id, media);
          });
        }
      }
    }
  }

  return rows.map((row) => {
    const latestRecord = latestPublicRecordMap.get(row.id);
    const latestMedia = latestRecord?.id
      ? latestPublicMediaMap.get(latestRecord.id)
      : null;

    return {
      archive_id: row.id,
      user_id: row.user_id,
      archive_title: row.title,
      system_name: row.system_name,
      species_id: row.species_id,
      species_name_snapshot: row.species_name_snapshot,
      archive_is_public: row.is_public,
      is_own_archive: Boolean(currentUserId && row.user_id === currentUserId),
      archive_status: row.status,
      ended_at: row.ended_at,
      archive_help_status: row.help_status,
      cover_image_url: row.cover_image_url,
      cover_image_path: row.cover_image_path,
      cover_thumb_path: row.cover_thumb_path,
      public_record_count: publicRecordCountMap.get(row.id) || 0,
      last_public_record_time: latestRecord?.record_time || null,
      last_public_record_note: latestRecord?.note || null,
      last_public_record_image_url:
        latestRecord?.primary_image_url || latestMedia?.url || null,
      last_public_record_image_path: latestMedia?.storage_path || null,
      last_public_record_thumb_path: latestMedia?.thumb_path || null,
    } satisfies PlantRelatedArchiveItem;
  });
}

function mergeRelatedArchiveItems(items: PlantRelatedArchiveItem[]) {
  const itemMap = new Map<string, PlantRelatedArchiveItem>();

  items.forEach((item) => {
    const previous = itemMap.get(item.archive_id);

    if (!previous) {
      itemMap.set(item.archive_id, item);
      return;
    }

    itemMap.set(item.archive_id, {
      ...item,
      ...previous,
      archive_is_public: previous.archive_is_public ?? item.archive_is_public ?? null,
      is_own_archive: Boolean(previous.is_own_archive || item.is_own_archive),
    });
  });

  return Array.from(itemMap.values()).slice(0, RELATED_ARCHIVE_LIMIT);
}

async function hydrateRelatedArchiveImages(archives: PlantRelatedArchiveItem[]) {
  const archiveCount = archives.length;
  const displayPairs = await resolveMediaDisplayPairs(supabase, [
    ...archives.map((archive) => ({
      url: archive.cover_image_url,
      path: archive.cover_image_path,
      thumb_path: archive.cover_thumb_path,
    })),
    ...archives.map((archive) => ({
      url: archive.last_public_record_image_url,
      path: archive.last_public_record_image_path,
      thumb_path: archive.last_public_record_thumb_path,
    })),
  ]);
  const coverImagePairs = displayPairs.slice(0, archiveCount);
  const lastRecordImagePairs = displayPairs.slice(archiveCount);

  return archives.map((archive, index) => ({
    ...archive,
    display_cover_image_url:
      coverImagePairs[index]?.display_thumb_url ||
      coverImagePairs[index]?.display_url ||
      null,
    display_last_public_record_image_url:
      lastRecordImagePairs[index]?.display_thumb_url ||
      lastRecordImagePairs[index]?.display_url ||
      null,
  }));
}

function TextBlock({ text }: { text?: string | null }) {
  if (!hasText(text)) return null;

  return (
    <div
      style={{
        color: "#555",
        fontSize: 15,
        lineHeight: 1.95,
        whiteSpace: "pre-line",
      }}
    >
      {text}
    </div>
  );
}

function splitTextSentences(text: string) {
  const sentences: string[] = [];
  let current = "";

  for (const char of text.replace(/\r\n/g, "\n")) {
    if (char === "\n") {
      if (current.trim()) sentences.push(current.trim());
      current = "";
      continue;
    }

    current += char;

    if ("。！？!?；;".includes(char)) {
      if (current.trim()) sentences.push(current.trim());
      current = "";
    }
  }

  if (current.trim()) sentences.push(current.trim());
  return sentences;
}

function withoutTemperatureValueSentences(
  text: string | null | undefined,
  shouldFilter: boolean
) {
  if (!hasText(text)) return null;

  const value = String(text).trim();
  if (!shouldFilter) return value;

  const sentences = splitTextSentences(value).filter(
    (sentence) => !/[℃°]/.test(sentence)
  );

  return sentences.length > 0 ? sentences.join("\n") : null;
}

function textValue(value: unknown) {
  if (!hasText(value)) return null;
  return String(value).trim();
}

function splitGuideItems(...values: Array<unknown>) {
  return uniqueTextList(
    values
      .map((value) => textValue(value))
      .filter(Boolean)
      .flatMap((value) => String(value).split(/\n+|。|；|;|^[\s]*[•·-]/gm))
      .map((value) =>
        value
          .trim()
          .replace(/^[-—–－•·\s]+/, "")
          .replace(/\s+/g, " ")
          .trim()
      )
      .filter(Boolean)
  );
}

function formatShortDate(value?: string | null) {
  return formatCardDate(value) || null;
}

function Card({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: string | null;
}) {
  if (
    value === null ||
    value === undefined ||
    value === "" ||
    value === false
  ) {
    return null;
  }

  return (
    <div
      style={{
        padding: 12,
        border: "1px solid #eee",
        borderRadius: 14,
        background: "#fafafa",
      }}
    >
      <div
        style={{
          fontSize: 14,
          fontWeight: 700,
          color: "#555",
          marginBottom: 8,
          lineHeight: 1.5,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 17, fontWeight: 700, color: "#2f2f2f" }}>{value}</div>
      {hint && <div style={{ marginTop: 4, color: "#999", fontSize: 12 }}>{hint}</div>}
    </div>
  );
}

function StarRating({ rating }: { rating: number }) {
  return (
    <span
      aria-label={`${rating} / 5`}
      style={{ display: "inline-flex", alignItems: "center", gap: 1 }}
    >
      {Array.from({ length: 5 }, (_, index) => (
        <UiIcon
          key={index}
          name={index < rating ? "star-filled" : "star"}
          size={13}
          strokeWidth={1.6}
        />
      ))}
    </span>
  );
}

function Subsection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  if (!children) return null;

  return (
    <div style={{ marginTop: 16 }}>
      <h3
        style={{
          margin: "0 0 10px",
          fontSize: 16,
          fontWeight: 750,
          color: "#315a2f",
        }}
      >
        {title}
      </h3>
      {children}
    </div>
  );
}

function GuideList({ items }: { items: string[] }) {
  if (items.length === 0) return null;

  return (
    <div
      style={{
        display: "grid",
        gap: 8,
        color: "#555",
        fontSize: 15,
        lineHeight: 1.68,
      }}
    >
      {items.slice(0, 5).map((item) => (
        <div
          key={item}
          style={{
            display: "grid",
            gridTemplateColumns: "10px minmax(0, 1fr)",
            gap: 8,
            alignItems: "start",
          }}
        >
          <span
            aria-hidden="true"
            style={{
              width: 5,
              height: 5,
              marginTop: 10,
              borderRadius: 999,
              background: "#7b9474",
            }}
          />
          <span style={{ minWidth: 0, overflowWrap: "break-word" }}>
            {item}
          </span>
        </div>
      ))}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  if (!children) return null;

  return (
    <section
      style={{
        marginTop: 16,
        padding: 20,
        border: "1px solid #eee",
        borderRadius: 18,
        background: "#fff",
      }}
    >
      <h2
        style={{
          margin: "0 0 14px",
          fontSize: 21,
          fontWeight: 700,
          color: "#222",
        }}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

function TempCard({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  if (!value) return null;
  return <Card label={label} value={value} />;
}
function toPositiveDay(value: unknown) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue <= 0) return null;
  return Math.round(numberValue);
}

function GrowthCycleBlock({ cycle }: { cycle: PlantGrowthCycleRow | null }) {
  const rawStages = [
    {
      label: "发芽期",
      days: toPositiveDay(cycle?.germination_days),
    },
    {
      label: "幼苗期",
      days: toPositiveDay(cycle?.seedling_days),
    },
    {
      label: "营养生长期",
      days: toPositiveDay(cycle?.vegetative_days),
    },
    {
      label: "开花期",
      days: toPositiveDay(cycle?.flowering_days),
    },
    {
      label: "采收期",
      days: toPositiveDay(cycle?.harvest_days),
    },
  ].filter((stage) => stage.days !== null);

  if (rawStages.length === 0) {
    return (
      <div style={{ color: "#888", fontSize: 15 }}>暂无完整生长周期数据</div>
    );
  }

  let cursor = 0;

  const stages = rawStages.map((stage) => {
    const start = cursor;
    const end = cursor + (stage.days || 0);
    cursor = end;

    return {
      ...stage,
      start,
      end,
      duration: stage.days || 0,
    };
  });

  const totalDays = stages[stages.length - 1]?.end || 0;
  if (totalDays <= 0) {
    return (
      <div style={{ color: "#888", fontSize: 15 }}>暂无完整生长周期数据</div>
    );
  }

  const columnWidths = stages.map((stage) => Math.max(96, stage.duration * 4));
  const tableWidth = columnWidths.reduce((sum, width) => sum + width, 0);

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 8,
          color: "#555",
          fontSize: 15,
        }}
      >
        <span>总周期：</span>
        <strong style={{ color: "#315a2f", fontSize: 18 }}>
          约 {totalDays} 天
        </strong>
      </div>

      <div
        style={{
          overflowX: "auto",
          paddingBottom: 4,
        }}
      >
        <table
          style={{
            width: tableWidth,
            minWidth: "100%",
            borderCollapse: "separate",
            borderSpacing: 0,
            tableLayout: "fixed",
            border: "1px solid #dce8d5",
            borderRadius: 16,
            overflow: "hidden",
            background: "#fbfdf9",
          }}
        >
          <colgroup>
            {stages.map((stage, index) => (
              <col
                key={`${stage.label}-block-col`}
                style={{
                  width: columnWidths[index],
                }}
              />
            ))}
          </colgroup>

          <tbody>
            <tr>
              {stages.map((stage, index) => (
                <td
                  key={`${stage.label}-block-name`}
                  style={{
                    padding: "14px 10px 12px",
                    textAlign: "center",
                    background: index % 2 === 0 ? "#eef6e9" : "#f8fbf5",
                    borderRight:
                      index === stages.length - 1 ? "none" : "1px solid #dce8d5",
                    whiteSpace: "nowrap",
                  }}
                >
                  <div
                    style={{
                      fontSize: 15,
                      fontWeight: 700,
                      color: "#315a2f",
                      lineHeight: 1.5,
                    }}
                  >
                    {stage.label}
                  </div>

                  <div
                    style={{
                      marginTop: 2,
                      fontSize: 13,
                      fontWeight: 600,
                      color: "#5f7f55",
                      lineHeight: 1.5,
                    }}
                  >
                    （{stage.duration}天）
                  </div>
                </td>
              ))}
            </tr>

            <tr>
              {stages.map((stage, index) => (
                <td
                  key={`${stage.label}-block-range`}
                  style={{
                    padding: "9px 10px",
                    textAlign: "center",
                    fontSize: 12,
                    color: "#777",
                    background: "#fff",
                    borderTop: "1px solid #dce8d5",
                    borderRight:
                      index === stages.length - 1 ? "none" : "1px solid #edf0e9",
                    whiteSpace: "nowrap",
                  }}
                >
                  {stage.start === 0
                    ? `第0–${stage.end}天`
                    : `第${stage.start + 1}–${stage.end}天`}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PlantingGuideSection({
  parameters,
  careGuide,
}: {
  parameters: PlantParametersRow | null;
  careGuide: PlantCareGuideRow | null;
}) {
  const startItems = splitGuideItems(
    careGuide?.summary,
    careGuide?.planting_guide,
    parameters?.care_note
  ).slice(0, 5);
  const careItems = splitGuideItems(careGuide?.care_guide).slice(0, 5);
  const harvestItems = splitGuideItems(careGuide?.harvest_guide).slice(0, 5);
  const problemItems = splitGuideItems(careGuide?.common_problem_guide).slice(0, 5);
  const rotationItems = splitGuideItems(
    careGuide?.rotation_intercrop_guide,
    parameters?.good_companions,
    parameters?.avoid_rotation_with
  ).slice(0, 5);
  const hasGuide =
    startItems.length > 0 ||
    careItems.length > 0 ||
    harvestItems.length > 0 ||
    problemItems.length > 0 ||
    rotationItems.length > 0;

  if (!hasGuide) return null;

  return (
    <Section title="种植要点">
      {startItems.length > 0 && (
        <Subsection title="开始种">
          <GuideList items={startItems} />
        </Subsection>
      )}
      {careItems.length > 0 && (
        <Subsection title="日常养">
          <GuideList items={careItems} />
        </Subsection>
      )}
      {harvestItems.length > 0 && (
        <Subsection title="采收判断">
          <GuideList items={harvestItems} />
        </Subsection>
      )}
      {problemItems.length > 0 && (
        <Subsection title="常见问题">
          <GuideList items={problemItems} />
        </Subsection>
      )}
      {rotationItems.length > 0 && (
        <Subsection title="轮作与伴生">
          <GuideList items={rotationItems} />
        </Subsection>
      )}
    </Section>
  );
}

function PlantArchiveList({
  archives,
  emptyText,
  entryLabel,
  hrefForArchive,
  countLabel,
  showOwner,
  showVisibility,
}: {
  archives: PlantRelatedArchiveItem[];
  emptyText: string;
  entryLabel: string;
  hrefForArchive: (archive: PlantRelatedArchiveItem) => string;
  countLabel: string;
  showOwner?: boolean;
  showVisibility?: boolean;
}) {
  if (archives.length === 0) {
    return (
      <div
        style={{
          padding: 18,
          border: "1px solid #eee",
          borderRadius: 14,
          color: "#888",
          background: "#fff",
        }}
      >
        {emptyText}
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 10 }}>
      {archives.map((archive) => {
        const imageUrl =
          archive.display_cover_image_url ||
          archive.display_last_public_record_image_url;
        const latestDate = formatShortDate(archive.last_public_record_time);
        const metaParts = [
          showVisibility ? (archive.archive_is_public ? "公开发现" : "仅自己可见") : null,
          `${countLabel} ${Number(archive.public_record_count || 0)}`,
          latestDate ? `最近 ${latestDate}` : "暂无记录",
        ].filter(Boolean);

        return (
          <Link
            key={archive.archive_id}
            href={hrefForArchive(archive)}
            style={{
              display: "grid",
              gridTemplateColumns: imageUrl ? "96px minmax(0, 1fr)" : "1fr",
              gap: 12,
              padding: 14,
              border: "1px solid #eee",
              borderRadius: 14,
              background: "#fff",
              color: "inherit",
              textDecoration: "none",
            }}
          >
            {imageUrl ? (
              <img
                src={imageUrl}
                alt=""
                style={{
                  width: 96,
                  height: 96,
                  objectFit: "cover",
                  borderRadius: 10,
                  background: "#f4f6f1",
                }}
              />
            ) : null}

            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  alignItems: "flex-start",
                }}
              >
                <div style={{ fontWeight: 700, color: "#263326" }}>
                  {archive.archive_title || "种植项目"}
                </div>
                <span
                  style={{
                    flex: "0 0 auto",
                    color: "#2f6f35",
                    fontSize: 13,
                    fontWeight: 700,
                  }}
                >
                  {entryLabel}
                </span>
              </div>
              <div style={{ marginTop: 8, color: "#6a7564", fontSize: 13 }}>
                {metaParts.join(" · ")}
              </div>
              <div
                style={{
                  marginTop: 6,
                  color: "#555",
                  fontSize: 14,
                  lineHeight: 1.6,
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
              >
                {archive.last_public_record_note || "还没有记录摘要"}
              </div>
              {showOwner && archive.username ? (
                <div style={{ marginTop: 8, color: "#8a9584", fontSize: 12 }}>
                  来自 {archive.username}
                </div>
              ) : null}
            </div>
          </Link>
        );
      })}
    </div>
  );
}

function PlantRecordsSection({
  parameters,
  ownArchives,
  publicArchives,
  isLoggedIn,
}: {
  parameters: PlantParametersRow | null;
  ownArchives: PlantRelatedArchiveItem[];
  publicArchives: PlantRelatedArchiveItem[];
  isLoggedIn: boolean;
}) {
  const recordFocus = textValue(parameters?.record_focus);
  const uniqueOwnArchives = Array.from(
    new Map(ownArchives.map((archive) => [archive.archive_id, archive])).values()
  );
  const uniquePublicArchives = Array.from(
    new Map(publicArchives.map((archive) => [archive.archive_id, archive])).values()
  );

  return (
    <Section title="种植记录">
      {recordFocus && (
        <Subsection title="记录重点">
          <div style={{ color: "#555", fontSize: 15, lineHeight: 1.85 }}>
            种植时可以重点记录：{recordFocus}
          </div>
        </Subsection>
      )}

      <Subsection title="我的相关项目">
        {!isLoggedIn ? (
          <div
            style={{
              padding: 18,
              border: "1px solid #eee",
              borderRadius: 14,
              color: "#888",
              background: "#fff",
            }}
          >
            登录后可查看自己的种植项目。
          </div>
        ) : (
          <PlantArchiveList
            archives={uniqueOwnArchives}
            emptyText="你还没有种过它。可以新建一个项目开始记录。"
            entryLabel="查看项目"
            hrefForArchive={(archive) => `/archive/${archive.archive_id}`}
            countLabel="记录"
            showVisibility
          />
        )}
      </Subsection>

      <Subsection title="大家的公开种植记录">
        <PlantArchiveList
          archives={uniquePublicArchives}
          emptyText="还没有公开种植记录。你可以从自己的项目开始沉淀经验。"
          entryLabel="查看公开项目"
          hrefForArchive={(archive) => `/archive/${archive.archive_id}?mode=viewer`}
          countLabel="公开记录"
          showOwner
        />
      </Subsection>
    </Section>
  );
}

function PlantExperienceCardsSection({
  cards,
  currentUserId,
}: {
  cards: PlantExperienceCardItem[];
  currentUserId: string | null;
}) {
  const myCards = currentUserId
    ? cards.filter((card) => card.user_id === currentUserId)
    : [];
  const otherCards = cards.filter((card) => card.user_id !== currentUserId);

  function renderCards(items: PlantExperienceCardItem[], showAuthor: boolean) {
    if (items.length === 0) {
      return (
        <div style={{ padding: 14, color: "#7f8a7b", fontSize: 13 }}>
          暂无经验卡。
        </div>
      );
    }
    return (
      <div style={{ display: "grid", gap: 10 }}>
        {items.map((card) => (
          <ExperienceCardListCard
            key={card.id}
            item={card}
            dateValue={card.published_at}
            showAuthor={showAuthor}
          />
        ))}
      </div>
    );
  }

  return (
    <Section title="经验卡">
      {currentUserId ? (
        <Subsection title="我的经验卡">{renderCards(myCards, false)}</Subsection>
      ) : null}
      <Subsection title="其他人的经验卡">
        {renderCards(otherCards, true)}
      </Subsection>
    </Section>
  );
}

function PlantTabAccessNotice({ label }: { label: string }) {
  return (
    <section
      style={{
        marginTop: 16,
        padding: 18,
        border: "1px solid #e1e8dd",
        borderRadius: 16,
        background: "#fff",
        color: "#687565",
        fontSize: 14,
        lineHeight: 1.7,
      }}
    >
      {label}属于云空间中的完整指引内容。
      <Link
        href="/membership"
        style={{ marginLeft: 7, color: "#3f6f37", fontWeight: 700 }}
      >
        查看会员权益
      </Link>
    </section>
  );
}

export default function PlantDetailPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const id = params?.id;

  const [plant, setPlant] = useState<PlantSpeciesRow | null>(null);
  const [i18n, setI18n] = useState<PlantSpeciesI18nRow[]>([]);
  const [aliases, setAliases] = useState<PlantAliasRow[]>([]);
  const [basicOverview, setBasicOverview] = useState<string | null>(null);
  const [parameters, setParameters] = useState<PlantParametersRow | null>(null);
  const [growthCycle, setGrowthCycle] = useState<PlantGrowthCycleRow | null>(null);
  const [careGuide, setCareGuide] = useState<PlantCareGuideRow | null>(null);
  const [relatedArchives, setRelatedArchives] = useState<PlantRelatedArchiveItem[]>([]);
  const [ownArchives, setOwnArchives] = useState<PlantRelatedArchiveItem[]>([]);
  const [relatedExperienceCards, setRelatedExperienceCards] = useState<
    PlantExperienceCardItem[]
  >([]);
  const [activeTab, setActiveTab] = useState<PlantDetailTab>("guide");
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [hasCloudAccess, setHasCloudAccess] = useState(false);
  const [interestAdded, setInterestAdded] = useState(false);
  const [planAdded, setPlanAdded] = useState(false);
  const [actionLoading, setActionLoading] = useState<"interest" | "plan" | null>(null);
  const [actionMessage, setActionMessage] = useState<ActionMessage | null>(null);
  const [loading, setLoading] = useState(true);
  const [isMobileViewport, setIsMobileViewport] = useState(false);

  useEffect(() => {
    function updateViewportMode() {
      setIsMobileViewport(window.innerWidth < 760);
    }

    updateViewportMode();
    window.addEventListener("resize", updateViewportMode);

    return () => window.removeEventListener("resize", updateViewportMode);
  }, []);

  useEffect(() => {
    async function load() {
      if (!id) return;

      setLoading(true);
      setActionMessage(null);

      const {
        data: { user },
      } = await supabase.auth.getUser();
      setIsSignedIn(Boolean(user));
      setCurrentUserId(user?.id || null);

      const membershipResult = user
        ? await supabase.rpc("get_my_membership")
        : { data: null, error: null };
      const membership = membershipResult.error
        ? null
        : normalizeMembershipRpcResult(membershipResult.data);
      const canReadFullGuide = canAccessMembershipGuidance(membership);
      setHasCloudAccess(canReadFullGuide);

      const [
        { data: plantData },
        { data: i18nData },
        { data: aliasData },
        { data: overviewData },
        { data: parameterData },
        { data: growthCycleData },
        { data: careGuideData },
      ] = await Promise.all([
        supabase
          .from("plant_species")
          .select(
            "id, common_name, scientific_name, family, slug, category, sub_category, growth_type, entry_type, is_active, sort_order"
          )
          .eq("id", id)
          .maybeSingle(),
        supabase
          .from("plant_species_i18n")
          .select("plant_id, language_code, common_name, family")
          .eq("plant_id", id)
          .order("language_code", { ascending: true }),
        supabase
          .from("plant_species_aliases")
          .select("species_id, alias_name, relation_type")
          .eq("species_id", id)
          .order("alias_name", { ascending: true }),
        user
          ? loadPlantBasicOverviewsCompat(id).then((data) => ({ data }))
          : Promise.resolve({ data: [] as PlantBasicOverviewRow[] }),
        canReadFullGuide
          ? supabase.from("plant_parameters").select("*").eq("species_id", id).maybeSingle()
          : user
            ? loadPlantCoreParametersCompat(id).then((data) => ({ data }))
            : Promise.resolve({ data: [] as PlantParametersRow[] }),
        canReadFullGuide
          ? supabase.from("plant_growth_cycle").select("*").eq("species_id", id).maybeSingle()
          : Promise.resolve({ data: null }),
        canReadFullGuide
          ? supabase
              .from("plant_care_guides")
              .select("*")
              .eq("plant_id", id)
              .eq("language_code", "zh")
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ]);

      const plantRow = (plantData || null) as PlantSpeciesRow | null;
      const i18nRows = (i18nData || []) as PlantSpeciesI18nRow[];
      const aliasRows = (aliasData || []) as PlantAliasSearchRow[];
      const overviewRows = (overviewData || []) as PlantBasicOverviewRow[];

      setPlant(plantRow);
      setI18n(i18nRows);
      setAliases(aliasRows);
      setBasicOverview(overviewRows[0]?.summary || null);
      setParameters(
        (Array.isArray(parameterData) ? parameterData[0] : parameterData || null) as
          | PlantParametersRow
          | null
      );
      setGrowthCycle((growthCycleData || null) as PlantGrowthCycleRow | null);
      setCareGuide((careGuideData || null) as PlantCareGuideRow | null);

      const plantNameTerms = buildPlantNameTerms(plantRow, i18nRows, aliasRows);
      const archiveMatchFilter = buildArchiveMatchFilter(id, plantNameTerms);
      const archiveSelect =
        "id, user_id, title, system_name, species_id, species_name_snapshot, is_public, status, ended_at, help_status, cover_image_url, cover_image_path, cover_thumb_path, created_at";

      if (canReadFullGuide) {
        const [{ data: publicArchiveRows }, { data: ownArchiveRows }] =
          await Promise.all([
            supabase
              .from("archives")
              .select(archiveSelect)
              .eq("is_public", true)
              .or(archiveMatchFilter)
              .order("last_record_time", { ascending: false, nullsFirst: false })
              .order("created_at", { ascending: false, nullsFirst: false })
              .limit(RELATED_ARCHIVE_LIMIT),
            user
              ? supabase
                  .from("archives")
                  .select(archiveSelect)
                  .eq("user_id", user.id)
                  .or(archiveMatchFilter)
                  .order("last_record_time", { ascending: false, nullsFirst: false })
                  .order("created_at", { ascending: false, nullsFirst: false })
                  .limit(RELATED_ARCHIVE_LIMIT)
              : Promise.resolve({ data: [] as RelatedArchiveSourceRow[] }),
          ]);

        const publicRelatedRows = (
          await buildArchiveItemsFromRows(
            (publicArchiveRows || []) as RelatedArchiveSourceRow[],
            user?.id || null
          )
        ).filter((archive) => !user?.id || archive.user_id !== user.id);
        const ownRelatedRows = user
          ? mergeRelatedArchiveItems(
              await buildArchiveItemsFromRows(
                (ownArchiveRows || []) as RelatedArchiveSourceRow[],
                user.id,
                { recordScope: "all" }
              )
            )
          : [];

        const hydratedRelatedRows = await hydrateRelatedArchiveImages([
          ...publicRelatedRows,
          ...ownRelatedRows,
        ]);
        setRelatedArchives(
          hydratedRelatedRows.slice(0, publicRelatedRows.length)
        );
        setOwnArchives(hydratedRelatedRows.slice(publicRelatedRows.length));

        const matchingArchiveRows = Array.from(
          new Map(
            [
              ...((publicArchiveRows || []) as RelatedArchiveSourceRow[]),
              ...((ownArchiveRows || []) as RelatedArchiveSourceRow[]),
            ].map((archive) => [archive.id, archive])
          ).values()
        );
        const matchingArchiveIds = matchingArchiveRows.map((archive) => archive.id);
        if (matchingArchiveIds.length > 0) {
          const { data: experienceCardRows } = await supabase
            .from("experience_cards")
            .select("*")
            .in("archive_id", matchingArchiveIds)
            .eq("status", "published")
            .order("published_at", { ascending: false, nullsFirst: false })
            .limit(RELATED_ARCHIVE_LIMIT);
          const allCardRows = (experienceCardRows || []) as ExperienceCardRow[];
          const publicStates = await Promise.all(
            allCardRows.map(async (card) => {
              const { data } = await supabase.rpc("is_experience_card_public", {
                p_card_id: card.id,
              });
              return Boolean(Array.isArray(data) ? data[0] : data);
            })
          );
          const cardRows = allCardRows.filter(
            (_card, index) => publicStates[index]
          );

          setRelatedExperienceCards(
            await hydrateExperienceCardListItems(cardRows)
          );
        } else {
          setRelatedExperienceCards([]);
        }
      } else {
        setRelatedArchives([]);
        setOwnArchives([]);
        setRelatedExperienceCards([]);
      }

      if (user) {
        const [{ data: interestData }, { data: planData }] = await Promise.all([
          supabase
            .from("user_plant_interests")
            .select("id")
            .eq("user_id", user.id)
            .eq("species_id", id)
            .maybeSingle(),
          supabase
            .from("user_plant_plans")
            .select("id")
            .eq("user_id", user.id)
            .eq("species_id", id)
            .maybeSingle(),
        ]);

        setInterestAdded(Boolean(interestData));
        setPlanAdded(Boolean(planData));
      } else {
        setInterestAdded(false);
        setPlanAdded(false);
      }

      setLoading(false);
    }

    load();
  }, [id]);

  const zh = useMemo(
    () => i18n.find((item: PlantSpeciesI18nRow) => item.language_code === "zh"),
    [i18n]
  );

  const en = useMemo(
    () => i18n.find((item: PlantSpeciesI18nRow) => item.language_code === "en"),
    [i18n]
  );

  const aliasNames = useMemo(
    () => uniqueTextList(aliases.map((alias: PlantAliasRow) => alias.alias_name)),
    [aliases]
  );

  const displayName =
    zh?.common_name || plant?.common_name || plant?.scientific_name || "植物指引";
  const fromArchive = searchParams.get("fromArchive");
  const fromRecord = searchParams.get("fromRecord");
  const returnRecordHref = fromArchive
    ? `/archive/${encodeURIComponent(fromArchive)}${
        fromRecord ? `?record=${encodeURIComponent(fromRecord)}` : ""
      }`
    : null;
  const newProjectHref = hasCloudAccess
    ? `/archive/new?species=${encodeURIComponent(plant?.id || id || "")}`
    : `/local/archive/new?category=plant&plant_id=${encodeURIComponent(
        plant?.id || id || ""
      )}&system_name=${encodeURIComponent(displayName)}`;

  const difficulty = difficultyMeta(parameters?.management_difficulty_score);
  const environmentTags = getEnvironmentTags(parameters, { includeIndoor: true });
  const environmentCards = getEnvironmentDetailItems(parameters);
  const localCoreParameterCards = [
    ...environmentCards.filter((item) =>
      ["光照", "栽培场景", "室内"].includes(item.label)
    ),
    {
      label: "搭架",
      value:
        typeof parameters?.need_trellis === "boolean"
          ? parameters.need_trellis
            ? "需要"
            : "通常不需要"
          : null,
    },
  ].filter((item) => item.value);

  const parameterCards = [
    { label: "日照强度", value: scoreLabel(parameters?.sun_score) },
    { label: "空气湿度", value: scoreLabel(parameters?.air_humidity_score) },
    { label: "空气通风", value: scoreLabel(parameters?.air_flow_score) },
    { label: "土壤湿度", value: scoreLabel(parameters?.soil_moisture_score) },
    { label: "土壤通气", value: scoreLabel(parameters?.soil_aeration_score) },
    { label: "土壤肥沃度", value: scoreLabel(parameters?.soil_fertility_score) },
    { label: "土壤酸碱要求", value: phRequirementText(parameters) },
    { label: "耐旱能力", value: scoreLabel(parameters?.drought_score) },
    { label: "生长速度", value: scoreLabel(parameters?.growth_speed_score) },
    { label: "病虫害风险", value: scoreLabel(parameters?.disease_risk_score) },
    { label: "盆栽适配", value: scoreLabel(parameters?.container_friendly_score) },
    { label: "室内适配", value: scoreLabel(parameters?.indoor_friendly_score) },
    { label: "阳台适配", value: scoreLabel(parameters?.balcony_friendly_score) },
    {
      label: "管理难度",
      value: difficulty
        ? <span><StarRating rating={difficulty.rating} />（{difficulty.detail}，{difficulty.label}）</span>
        : null,
    },
  ].filter((item) => item.value);

  const temperatureCards = [
    {
      label: "最佳发芽温度",
      value: formatRange(
        parameters?.best_germ_temp_min,
        parameters?.best_germ_temp_max,
        "℃"
      ),
    },
    {
      label: "适宜生长温度",
      value: formatRange(
        parameters?.optimal_growth_temp_min,
        parameters?.optimal_growth_temp_max,
        "℃"
      ),
    },
    {
      label: "旺盛生长点",
      value: isEmpty(parameters?.vigorous_growth_temp)
        ? null
        : `${parameters?.vigorous_growth_temp}℃`,
    },
    {
      label: "生长减缓点",
      value: isEmpty(parameters?.growth_slow_temp)
        ? null
        : `${parameters?.growth_slow_temp}℃`,
    },
    {
      label: "冻害触发",
      value: isEmpty(parameters?.frost_damage_temp)
        ? null
        : `${parameters?.frost_damage_temp}℃`,
    },
    {
      label: "致死低温",
      value: isEmpty(parameters?.lethal_low_temp)
        ? null
        : `${parameters?.lethal_low_temp}℃`,
    },
    {
      label: "低温停长",
      value: isEmpty(parameters?.stop_low_temp)
        ? null
        : `${parameters?.stop_low_temp}℃`,
    },
    {
      label: "高温停长",
      value: isEmpty(parameters?.stop_high_temp)
        ? null
        : `${parameters?.stop_high_temp}℃`,
    },
    {
      label: "高温灼伤风险",
      value: isEmpty(parameters?.heat_scorch_temp)
        ? null
        : `${parameters?.heat_scorch_temp}℃`,
    },
    {
      label: "致死高温",
      value: isEmpty(parameters?.lethal_high_temp)
        ? null
        : `${parameters?.lethal_high_temp}℃`,
    },
  ].filter((item) => item.value);

  const climateTimingNote = withoutTemperatureValueSentences(
    careGuide?.climate_timing_note,
    temperatureCards.length > 0
  );
  const temperatureNote = withoutTemperatureValueSentences(
    parameters?.temperature_note,
    temperatureCards.length > 0
  );
  const hasTemperatureSection =
    temperatureCards.length > 0 || hasText(temperatureNote);

  const photoperiodType =
    parameters?.photoperiod_type &&
    parameters.photoperiod_type !== "unknown"
      ? photoperiodLabels[parameters.photoperiod_type] || parameters.photoperiod_type
      : null;

  const photoperiodStages =
    Array.isArray(parameters?.photoperiod_trigger_stage) &&
    parameters.photoperiod_trigger_stage.length > 0
      ? parameters.photoperiod_trigger_stage
          .map((stage: string) => stageLabels[stage] || stage)
          .join("、")
      : null;

  const photoperiodCards = [
    { label: "类型", value: photoperiodType },
    {
      label: "敏感度",
      value: scoreLabel(parameters?.photoperiod_sensitivity_score),
    },
    {
      label: "临界日长",
      value: isEmpty(parameters?.critical_day_length_hours)
        ? null
        : `${parameters?.critical_day_length_hours} 小时`,
    },
    {
      label: "触发阶段",
      value: photoperiodStages,
    },
  ].filter((item) => item.value);

  const hasPhotoperiodSection =
    photoperiodCards.length > 0 || hasText(parameters?.photoperiod_note);

  async function handleAddInterest() {
    if (!plant || actionLoading) return;

    if (!isSignedIn) {
      setActionMessage({
        type: "error",
        text: "请先登录，再加入感兴趣的植物。",
        href: "/login",
        hrefText: "去登录",
      });
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setActionMessage({
        type: "error",
        text: "请先登录，再加入感兴趣的植物。",
        href: "/login",
        hrefText: "去登录",
      });
      return;
    }

    if (!interestAdded && !hasCloudAccess) {
      setActionMessage({
        type: "error",
        text: "加入收藏属于云会员权益。",
        href: "/membership",
        hrefText: "查看会员权益",
      });
      return;
    }

    setActionLoading("interest");
    setActionMessage(null);

    const { error } = interestAdded
      ? await supabase
          .from("user_plant_interests")
          .delete()
          .eq("user_id", user.id)
          .eq("species_id", plant.id)
      : await supabase.from("user_plant_interests").upsert(
          {
            user_id: user.id,
            species_id: plant.id,
          },
          { onConflict: "user_id,species_id" }
        );

    setActionLoading(null);

    if (error) {
      setActionMessage({
        type: "error",
        text: `${interestAdded ? "取消" : "加入"}失败：${error.message}`,
      });
      return;
    }

    const nextInterestAdded = !interestAdded;
    setInterestAdded(nextInterestAdded);
    setActionMessage({
      type: "success",
      text: nextInterestAdded ? "已加入我的收藏。" : "已取消收藏。",
      href: nextInterestAdded ? "/archive/interests" : undefined,
      hrefText: nextInterestAdded ? "查看收藏" : undefined,
    });
  }

  async function handleAddPlan() {
    if (!plant || actionLoading) return;

    if (!isSignedIn) {
      setActionMessage({
        type: "error",
        text: "请先登录，再加入种植计划。",
        href: "/login",
        hrefText: "去登录",
      });
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setActionMessage({
        type: "error",
        text: "请先登录，再加入种植计划。",
        href: "/login",
        hrefText: "去登录",
      });
      return;
    }

    if (!planAdded && !hasCloudAccess) {
      setActionMessage({
        type: "error",
        text: "云端种植计划属于云会员权益；你仍可新建本地项目。",
        href: "/membership",
        hrefText: "查看会员权益",
      });
      return;
    }

    setActionLoading("plan");
    setActionMessage(null);

    const { error } = planAdded
      ? await supabase
          .from("user_plant_plans")
          .delete()
          .eq("user_id", user.id)
          .eq("species_id", plant.id)
      : await supabase.from("user_plant_plans").upsert(
          {
            user_id: user.id,
            species_id: plant.id,
            status: "want",
          },
          { onConflict: "user_id,species_id" }
        );

    setActionLoading(null);

    if (error) {
      setActionMessage({
        type: "error",
        text: `${planAdded ? "取消" : "加入"}失败：${error.message}`,
      });
      return;
    }

    const nextPlanAdded = !planAdded;
    setPlanAdded(nextPlanAdded);
    setActionMessage({
      type: "success",
      text: nextPlanAdded ? "已添加种植计划。" : "已取消种植计划。",
      href: nextPlanAdded ? "/archive/plans" : undefined,
      hrefText: nextPlanAdded ? "查看计划" : undefined,
    });
  }

  if (loading) {
    return <main style={{ padding: 20 }}>加载中...</main>;
  }

  if (!plant) {
    return (
      <main style={{ padding: "16px", maxWidth: 760, margin: "0 auto" }}>
        <Link href="/plant" style={{ color: "#666", fontSize: 14 }}>
          <UiIcon name="arrow-left" size={15} /> 返回指引
        </Link>
        <div
          style={{
            marginTop: 24,
            padding: 20,
            border: "1px solid #eee",
            borderRadius: 16,
            background: "#fff",
          }}
        >
          没有找到这个植物条目。
        </div>
      </main>
    );
  }

  return (
    <main style={{ padding: "16px", maxWidth: 860, margin: "0 auto" }}>
      <div style={{ marginBottom: 16, display: "flex", gap: 12, flexWrap: "wrap" }}>
        {isMobileViewport && returnRecordHref ? (
          <Link href={returnRecordHref} style={{ color: "#4d7044", fontSize: 14, fontWeight: 700 }}>
            返回原记录
          </Link>
        ) : null}
        <Link href="/plant" style={{ color: "#666", fontSize: 14 }}>
          <UiIcon name="arrow-left" size={15} /> 返回指引
        </Link>
        {!isMobileViewport ? (
          <Link href="/archive" style={{ color: "#666", fontSize: 14 }}>
            返回我的空间
          </Link>
        ) : null}
      </div>

      <section
        style={{
          padding: 22,
          border: "1px solid #eee",
          borderRadius: 20,
          background: "#fff",
          boxShadow: "0 8px 24px rgba(0,0,0,0.04)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 8,
            flexWrap: "wrap",
          }}
        >
          <span
            style={{
              padding: "2px 8px",
              border: "1px solid #dcebd5",
              borderRadius: 999,
              color: "#4d7044",
              background: "#f7fbf4",
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            植物档案
          </span>
        </div>

        <h1 style={{ margin: 0, fontSize: 30 }}>{displayName}</h1>

        <div style={{ marginTop: 10, color: "#666", lineHeight: 1.85 }}>
          {plant.scientific_name && <div>学名：{plant.scientific_name}</div>}
          {aliasNames.length > 0 && <div>别名：{aliasNames.join("、")}</div>}
          {(zh?.family || plant.family) && <div>科属：{zh?.family || plant.family}</div>}
          <div>
            分类：{categoryLabel(plant.category)}
            {plant.sub_category ? ` · ${subCategoryLabel(plant.sub_category)}` : ""}
          </div>
          {plant.growth_type && <div>生长型：{plant.growth_type}</div>}
          {en?.common_name && <div>英文名：{en.common_name}</div>}
        </div>

        {!isSignedIn ? (
          <div
            style={{
              marginTop: 14,
              padding: "11px 13px",
              borderRadius: 12,
              border: "1px solid #e4eadf",
              background: "#fafcf8",
              color: "#667260",
              fontSize: 14,
              lineHeight: 1.7,
            }}
          >
            游客可以查看目录、名称和分类。
            <Link href="/register" style={{ marginLeft: 6, color: "#3f6f37", fontWeight: 700 }}>
              注册后查看基础概要
            </Link>
          </div>
        ) : !hasCloudAccess ? (
          <div
            style={{
              marginTop: 14,
              padding: "11px 13px",
              borderRadius: 12,
              border: "1px solid #dce9d5",
              background: "#f7fbf4",
              color: "#587052",
              fontSize: 14,
              lineHeight: 1.7,
            }}
          >
            当前是本地用户，可以查看基础概要和少量核心适种参数。完整参数、生长周期、完整养护指引、经验卡库和聚合比较仅对云会员开放。
            <Link href="/membership" style={{ marginLeft: 6, color: "#3f6f37", fontWeight: 700 }}>
              查看会员权益
            </Link>
          </div>
        ) : null}

        {isSignedIn && environmentTags.length > 0 && (
          <div
            style={{
              marginTop: 14,
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            {environmentTags.map((tag) => (
              <span
                key={`${plant.id}-hero-env-${tag}`}
                style={{
                  fontSize: 16,
                  fontWeight: 600,
                  padding: "6px 10px",
                  borderRadius: 999,
                  background: "#f6fbf6",
                  border: "1px solid #dfeedd",
                  color: "#2e7d32",
                }}
              >
                {tag}
              </span>
            ))}
          </div>
        )}


        <div
          style={{
            marginTop: 22,
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <Link
            href={newProjectHref}
            style={{
              padding: "12px 20px",
              borderRadius: 14,
              border: "1.5px solid #cfe1d0",
              background: "#fff",
              color: "#2f6f35",
              fontSize: 15,
              fontWeight: 700,
              lineHeight: 1.2,
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 1px 0 rgba(0,0,0,0.04)",
            }}
          >
            {hasCloudAccess ? "新建云端种植项目" : "新建本地种植项目"}
          </Link>

          {hasCloudAccess || planAdded ? (
              <button
                type="button"
                onClick={handleAddPlan}
                disabled={actionLoading !== null}
                style={{
                  padding: "12px 20px",
                  borderRadius: 14,
                  border: "1.5px solid #cfe1d0",
                  background: planAdded ? "#f5faf5" : "#fff",
                  color: planAdded ? "#5f7f5f" : "#2f6f35",
                  fontSize: 15,
                  fontWeight: 700,
                  lineHeight: 1.2,
                  cursor: actionLoading !== null ? "default" : "pointer",
                  boxShadow: "0 1px 0 rgba(0,0,0,0.04)",
                }}
              >
                {planAdded
                  ? "已添加计划"
                  : actionLoading === "plan"
                    ? "加入中..."
                    : "加入种植计划"}
              </button>
          ) : null}

          {hasCloudAccess || interestAdded ? (
              <button
                type="button"
                onClick={handleAddInterest}
                disabled={actionLoading !== null}
                style={{
                  padding: "12px 20px",
                  borderRadius: 14,
                  border: "1.5px solid #cfe1d0",
                  background: interestAdded ? "#f5faf5" : "#fff",
                  color: interestAdded ? "#5f7f5f" : "#2f6f35",
                  fontSize: 15,
                  fontWeight: 700,
                  lineHeight: 1.2,
                  cursor: actionLoading !== null ? "default" : "pointer",
                  boxShadow: "0 1px 0 rgba(0,0,0,0.04)",
                }}
              >
                {interestAdded
                  ? "已收藏"
                  : actionLoading === "interest"
                    ? "加入中..."
                    : "加入收藏"}
              </button>
          ) : null}
        </div>

        {actionMessage && (
          <div
            style={{
              marginTop: 12,
              padding: "9px 12px",
              borderRadius: 12,
              border:
                actionMessage.type === "success"
                  ? "1px solid #d6ead6"
                  : "1px solid #ffe0e0",
              background:
                actionMessage.type === "success" ? "#f8fff8" : "#fff7f7",
              color: actionMessage.type === "success" ? "#4b6b4b" : "#c44",
              fontSize: 13,
              lineHeight: 1.6,
            }}
          >
            {actionMessage.text}
            {actionMessage.href && (
              <Link
                href={actionMessage.href}
                style={{
                  marginLeft: 8,
                  color: actionMessage.type === "success" ? "#4CAF50" : "#c44",
                  fontWeight: 650,
                  textDecoration: "none",
                }}
              >
                {actionMessage.hrefText || "查看"}
              </Link>
            )}
          </div>
        )}
      </section>

      <nav
        aria-label="指引详情内容"
        style={{
          marginTop: 16,
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: 8,
        }}
      >
        {([
          ["guide", "概要与种植办法"],
          ["experience", "经验卡"],
          ["records", "种植记录"],
        ] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setActiveTab(value)}
            aria-pressed={activeTab === value}
            style={{
              minHeight: 42,
              padding: "8px 9px",
              border:
                activeTab === value
                  ? "1px solid #8eb083"
                  : "1px solid #dde6d9",
              borderRadius: 12,
              background: activeTab === value ? "#edf5e9" : "#fff",
              color: activeTab === value ? "#315f30" : "#657061",
              fontSize: 13,
              fontWeight: 750,
              cursor: "pointer",
            }}
          >
            {label}
          </button>
        ))}
      </nav>

      {activeTab === "guide" ? (
        <>
      {isSignedIn && basicOverview ? (
        <Section title="概要">
          <TextBlock text={basicOverview} />
        </Section>
      ) : null}

      {isSignedIn && !hasCloudAccess && localCoreParameterCards.length > 0 ? (
        <Section title="基础适种参数">
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
              gap: 12,
            }}
          >
            {localCoreParameterCards.map((item) => (
              <Card key={item.label} label={item.label} value={item.value} />
            ))}
          </div>
          <div style={{ marginTop: 12, color: "#6a7566", fontSize: 13, lineHeight: 1.7 }}>
            地区与季节适配、精确阈值、完整养护方法和多案例比较属于云会员权益。
          </div>
        </Section>
      ) : null}

      {hasCloudAccess && (environmentCards.length > 0 ||
        hasText(climateTimingNote) ||
        hasTemperatureSection) && (
        <Section title="气候环境">
          {environmentCards.length > 0 && (
            <Subsection title="环境与场景">
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
                  gap: 12,
                  marginTop: 0,
                }}
              >
                {environmentCards.map((item) => (
                  <Card key={item.label} label={item.label} value={item.value} />
                ))}
              </div>
            </Subsection>
          )}

          {hasText(climateTimingNote) && (
            <Subsection title="气候与时机">
              <TextBlock text={climateTimingNote} />
            </Subsection>
          )}

          {hasTemperatureSection && (
            <Subsection title="温度节点">
              {temperatureCards.length > 0 && (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                    gap: 12,
                  }}
                >
                  {temperatureCards.map((item) => (
                    <TempCard key={item.label} label={item.label} value={item.value} />
                  ))}
                </div>
              )}

              {hasText(temperatureNote) && (
                <div style={{ marginTop: 12, color: "#555", fontSize: 15, lineHeight: 1.9 }}>
                  {temperatureNote}
                </div>
              )}
            </Subsection>
          )}
        </Section>
      )}

      {hasCloudAccess && (growthCycle || parameterCards.length > 0 || hasPhotoperiodSection) && (
        <Section title="生长与参数">
          <Subsection title="生长周期">
            <GrowthCycleBlock cycle={growthCycle} />
          </Subsection>

          {parameterCards.length > 0 && (
            <Subsection title="参数细项">
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
                  gap: 12,
                }}
              >
                {parameterCards.map((item) => (
                  <Card key={item.label} label={item.label} value={item.value} />
                ))}
              </div>
            </Subsection>
          )}

          {hasPhotoperiodSection && (
            <Subsection title="光周期">
              {photoperiodCards.length > 0 && (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                    gap: 12,
                  }}
                >
                  {photoperiodCards.map((item) => (
                    <Card key={item.label} label={item.label} value={item.value} />
                  ))}
                </div>
              )}

              {hasText(parameters?.photoperiod_note) && (
                <div style={{ marginTop: 12, color: "#555", fontSize: 15, lineHeight: 1.9 }}>
                  {parameters?.photoperiod_note}
                </div>
              )}
            </Subsection>
          )}
        </Section>
      )}

      {hasCloudAccess ? (
        <PlantingGuideSection
          parameters={parameters}
          careGuide={careGuide}
        />
      ) : null}
        </>
      ) : null}

      {activeTab === "experience" ? (
        hasCloudAccess ? (
          <PlantExperienceCardsSection
            cards={relatedExperienceCards}
            currentUserId={currentUserId}
          />
        ) : (
          <PlantTabAccessNotice label="相关经验卡" />
        )
      ) : null}

      {activeTab === "records" ? (
        hasCloudAccess ? (
          <PlantRecordsSection
            parameters={parameters}
            ownArchives={ownArchives}
            publicArchives={relatedArchives}
            isLoggedIn={isSignedIn}
          />
        ) : (
          <PlantTabAccessNotice label="相关种植记录" />
        )
      ) : null}
    </main>
  );
}
