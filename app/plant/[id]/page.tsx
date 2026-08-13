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
import type { TranslationDictionary } from "@/lib/i18n";
import { useLanguage } from "@/lib/i18n/useLanguage";
import { buildLoginHref, getCurrentInternalPath } from "@/lib/auth-return";
import type {
  ActionMessage,
  PlantAliasRow,
  PlantCareGuideRow,
  PlantParametersRow,
  PlantRelatedArchiveItem,
  PlantSpeciesI18nRow,
  PlantSpeciesRow,
} from "@/lib/plant-detail-types";
import styles from "./page.module.css";

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
type PlantCopy = TranslationDictionary["plant"];
type PlantDetailCopy = PlantCopy["detail"];

const RELATED_ARCHIVE_LIMIT = 24;

function isEmpty(value: unknown) {
  return value === null || value === undefined || value === "";
}

function hasText(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

function formatRange(
  min: unknown,
  max: unknown,
  copy: PlantDetailCopy,
  suffix = ""
) {
  if (isEmpty(min) && isEmpty(max)) return null;

  if (!isEmpty(min) && !isEmpty(max)) {
    if (String(min) === String(max)) return `${min}${suffix}`;
    return `${min}–${max}${suffix}`;
  }

  if (!isEmpty(min)) {
    return `${copy.range_min_prefix}${min}${suffix}${copy.range_min_suffix}`;
  }
  return `${copy.range_max_prefix}${max}${suffix}${copy.range_max_suffix}`;
}

function scoreLabel(value: unknown) {
  if (isEmpty(value)) return null;
  return `${value}/10`;
}

function phRequirementLabel(value: unknown, copy: PlantDetailCopy) {
  if (isEmpty(value)) return null;

  const score = Number(value);
  if (Number.isNaN(score)) return null;

  if (score <= 2) return copy.ph_very_broad;
  if (score <= 4) return copy.ph_broad;
  if (score <= 6) return copy.ph_moderate;
  if (score <= 8) return copy.ph_sensitive;
  return copy.ph_very_sensitive;
}

function phRequirementText(
  parameters: PlantParametersRow | null | undefined,
  copy: PlantDetailCopy
) {
  const sensitivity = phRequirementLabel(parameters?.ph_sensitivity_score, copy);
  const phRange = formatRange(parameters?.ph_min, parameters?.ph_max, copy);

  if (!sensitivity && !phRange) return null;
  if (sensitivity && phRange) return `${sensitivity}（pH ${phRange}）`;
  if (sensitivity) return sensitivity;
  return `${copy.suitable_ph} ${phRange}`;
}

function difficultyMeta(value: unknown, copy: PlantDetailCopy) {
  if (isEmpty(value)) return null;

  const score = Number(value);
  if (Number.isNaN(score)) return null;

  if (score <= 1) return { rating: 0, label: copy.difficulty_wild, detail: `${score}/10` };
  if (score <= 3) return { rating: 1, label: copy.difficulty_very_easy, detail: `${score}/10` };
  if (score <= 5) return { rating: 2, label: copy.difficulty_easy, detail: `${score}/10` };
  if (score <= 7) return { rating: 3, label: copy.difficulty_moderate, detail: `${score}/10` };
  if (score <= 9) return { rating: 4, label: copy.difficulty_hard, detail: `${score}/10` };

  return { rating: 5, label: copy.difficulty_professional, detail: `${score}/10` };
}

function localizedMapValue(labels: object, value: string) {
  return (labels as Record<string, string>)[value] || value;
}

function categoryLabel(
  value: string | null | undefined,
  labels: PlantCopy["categories"],
  uncategorized: string
) {
  if (!value) return uncategorized;
  return localizedMapValue(labels, value);
}

function subCategoryLabel(
  value: string | null | undefined,
  labels: PlantCopy["subcategories"]
) {
  if (!value) return "";
  return localizedMapValue(labels, value);
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
    <div className={styles.textBlock}>
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
    <div className={styles.parameterCard}>
      <div className={styles.parameterLabel}>
        {label}
      </div>
      <div className={styles.parameterValue}>{value}</div>
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
    <div className={styles.subsection}>
      <h3 className={styles.subsectionTitle}>
        {title}
      </h3>
      {children}
    </div>
  );
}

function GuideList({ items }: { items: string[] }) {
  if (items.length === 0) return null;

  return (
    <div className={styles.guideList}>
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
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>
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

function GrowthCycleBlock({
  cycle,
  copy,
}: {
  cycle: PlantGrowthCycleRow | null;
  copy: PlantDetailCopy;
}) {
  const rawStages = [
    {
      label: copy.growth_stages.germination,
      days: toPositiveDay(cycle?.germination_days),
    },
    {
      label: copy.growth_stages.seedling,
      days: toPositiveDay(cycle?.seedling_days),
    },
    {
      label: copy.growth_stages.vegetative,
      days: toPositiveDay(cycle?.vegetative_days),
    },
    {
      label: copy.growth_stages.flowering,
      days: toPositiveDay(cycle?.flowering_days),
    },
    {
      label: copy.growth_stages.harvest,
      days: toPositiveDay(cycle?.harvest_days),
    },
  ].filter((stage) => stage.days !== null);

  if (rawStages.length === 0) {
    return (
      <div style={{ color: "#888", fontSize: 15 }}>{copy.no_growth_cycle}</div>
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
      <div style={{ color: "#888", fontSize: 15 }}>{copy.no_growth_cycle}</div>
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
        <span>{copy.total_cycle}</span>
        <strong style={{ color: "#315a2f", fontSize: 18 }}>
          {copy.approx_prefix}{totalDays}{copy.day_unit}
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
                    {copy.duration_prefix}{stage.duration}{copy.duration_suffix}
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
                  {copy.day_range_prefix}
                  {stage.start === 0 ? 0 : stage.start + 1}–{stage.end}
                  {copy.day_range_suffix}
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
  copy,
}: {
  parameters: PlantParametersRow | null;
  careGuide: PlantCareGuideRow | null;
  copy: PlantDetailCopy;
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
    <Section title={copy.planting_guide}>
      {startItems.length > 0 && (
        <Subsection title={copy.start_growing}>
          <GuideList items={startItems} />
        </Subsection>
      )}
      {careItems.length > 0 && (
        <Subsection title={copy.daily_care}>
          <GuideList items={careItems} />
        </Subsection>
      )}
      {harvestItems.length > 0 && (
        <Subsection title={copy.harvest_signs}>
          <GuideList items={harvestItems} />
        </Subsection>
      )}
      {problemItems.length > 0 && (
        <Subsection title={copy.common_problems}>
          <GuideList items={problemItems} />
        </Subsection>
      )}
      {rotationItems.length > 0 && (
        <Subsection title={copy.rotation_companions}>
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
  copy,
}: {
  archives: PlantRelatedArchiveItem[];
  emptyText: string;
  entryLabel: string;
  hrefForArchive: (archive: PlantRelatedArchiveItem) => string;
  countLabel: string;
  showOwner?: boolean;
  showVisibility?: boolean;
  copy: PlantDetailCopy;
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
          showVisibility
            ? archive.archive_is_public
              ? copy.public_discovery
              : copy.private_only
            : null,
          `${countLabel} ${Number(archive.public_record_count || 0)}`,
          latestDate ? `${copy.latest_prefix}${latestDate}` : copy.no_records,
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
                  {archive.archive_title || copy.planting_project}
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
                {archive.last_public_record_note || copy.no_record_summary}
              </div>
              {showOwner && archive.username ? (
                <div style={{ marginTop: 8, color: "#8a9584", fontSize: 12 }}>
                  {copy.from_prefix}{archive.username}
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
  copy,
}: {
  parameters: PlantParametersRow | null;
  ownArchives: PlantRelatedArchiveItem[];
  publicArchives: PlantRelatedArchiveItem[];
  isLoggedIn: boolean;
  copy: PlantDetailCopy;
}) {
  const recordFocus = textValue(parameters?.record_focus);
  const uniqueOwnArchives = Array.from(
    new Map(ownArchives.map((archive) => [archive.archive_id, archive])).values()
  );
  const uniquePublicArchives = Array.from(
    new Map(publicArchives.map((archive) => [archive.archive_id, archive])).values()
  );

  return (
    <Section title={copy.growing_records}>
      {recordFocus && (
        <Subsection title={copy.record_focus}>
          <div style={{ color: "#555", fontSize: 15, lineHeight: 1.85 }}>
            {copy.record_focus_prefix}{recordFocus}
          </div>
        </Subsection>
      )}

      <Subsection title={copy.my_related_projects}>
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
            {copy.login_to_view_projects}
          </div>
        ) : (
          <PlantArchiveList
            archives={uniqueOwnArchives}
            emptyText={copy.own_projects_empty}
            entryLabel={copy.view_project}
            hrefForArchive={(archive) => `/archive/${archive.archive_id}`}
            countLabel={copy.record_count_label}
            showVisibility
            copy={copy}
          />
        )}
      </Subsection>

      <Subsection title={copy.public_growing_records}>
        <PlantArchiveList
          archives={uniquePublicArchives}
          emptyText={copy.public_records_empty}
          entryLabel={copy.view_public_project}
          hrefForArchive={(archive) => `/archive/${archive.archive_id}?mode=viewer`}
          countLabel={copy.public_record_count_label}
          showOwner
          copy={copy}
        />
      </Subsection>
    </Section>
  );
}

function PlantExperienceCardsSection({
  cards,
  currentUserId,
  copy,
}: {
  cards: PlantExperienceCardItem[];
  currentUserId: string | null;
  copy: PlantDetailCopy;
}) {
  const myCards = currentUserId
    ? cards.filter((card) => card.user_id === currentUserId)
    : [];
  const otherCards = cards.filter((card) => card.user_id !== currentUserId);

  function renderCards(items: PlantExperienceCardItem[], showAuthor: boolean) {
    if (items.length === 0) {
      return (
        <div style={{ padding: 14, color: "#7f8a7b", fontSize: 13 }}>
          {copy.no_experience_cards}
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
    <Section title={copy.experience_cards}>
      {currentUserId ? (
        <Subsection title={copy.my_experience_cards}>{renderCards(myCards, false)}</Subsection>
      ) : null}
      <Subsection title={copy.others_experience_cards}>
        {renderCards(otherCards, true)}
      </Subsection>
    </Section>
  );
}

function PlantTabAccessNotice({
  label,
  copy,
}: {
  label: string;
  copy: PlantDetailCopy;
}) {
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
      {label}{copy.complete_content_suffix}
      <Link
        href="/membership"
        style={{ marginLeft: 7, color: "#3f6f37", fontWeight: 700 }}
      >
        {copy.learn_membership}
      </Link>
    </section>
  );
}

export default function PlantDetailPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const { language, t } = useLanguage();
  const copy = t.plant.detail;
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
            await hydrateExperienceCardListItems(cardRows, language)
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
  }, [id, language]);

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

  const localizedPlant = language === "en" ? en : zh;
  const displayName =
    localizedPlant?.common_name ||
    (language === "en" ? plant?.scientific_name : plant?.common_name) ||
    plant?.common_name ||
    plant?.scientific_name ||
    copy.default_title;
  const displayFamily = localizedPlant?.family || plant?.family;
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

  const difficulty = difficultyMeta(parameters?.management_difficulty_score, copy);
  const environmentTags = getEnvironmentTags(
    parameters,
    { includeIndoor: true },
    language
  );
  const environmentCards = getEnvironmentDetailItems(parameters, language);
  const localCoreParameterCards = [
    ...environmentCards.filter((item) =>
      ["light", "scene", "indoor"].includes(item.key)
    ),
    {
      key: "trellis",
      label: copy.trellis,
      value:
        typeof parameters?.need_trellis === "boolean"
          ? parameters.need_trellis
            ? copy.trellis_needed
            : copy.trellis_not_usually_needed
          : null,
    },
  ].filter((item) => item.value);

  const parameterCards = [
    { label: copy.parameter_labels.sunlight, value: scoreLabel(parameters?.sun_score) },
    { label: copy.parameter_labels.air_humidity, value: scoreLabel(parameters?.air_humidity_score) },
    { label: copy.parameter_labels.airflow, value: scoreLabel(parameters?.air_flow_score) },
    { label: copy.parameter_labels.soil_moisture, value: scoreLabel(parameters?.soil_moisture_score) },
    { label: copy.parameter_labels.soil_aeration, value: scoreLabel(parameters?.soil_aeration_score) },
    { label: copy.parameter_labels.soil_fertility, value: scoreLabel(parameters?.soil_fertility_score) },
    { label: copy.parameter_labels.soil_ph, value: phRequirementText(parameters, copy) },
    { label: copy.parameter_labels.drought, value: scoreLabel(parameters?.drought_score) },
    { label: copy.parameter_labels.growth_speed, value: scoreLabel(parameters?.growth_speed_score) },
    { label: copy.parameter_labels.disease_risk, value: scoreLabel(parameters?.disease_risk_score) },
    { label: copy.parameter_labels.container_fit, value: scoreLabel(parameters?.container_friendly_score) },
    { label: copy.parameter_labels.indoor_fit, value: scoreLabel(parameters?.indoor_friendly_score) },
    { label: copy.parameter_labels.balcony_fit, value: scoreLabel(parameters?.balcony_friendly_score) },
    {
      label: copy.parameter_labels.management_difficulty,
      value: difficulty
        ? <span><StarRating rating={difficulty.rating} />（{difficulty.detail}，{difficulty.label}）</span>
        : null,
    },
  ].filter((item) => item.value);

  const temperatureCards = [
    {
      label: copy.temperature_labels.germination,
      value: formatRange(
        parameters?.best_germ_temp_min,
        parameters?.best_germ_temp_max,
        copy,
        "℃"
      ),
    },
    {
      label: copy.temperature_labels.optimal_growth,
      value: formatRange(
        parameters?.optimal_growth_temp_min,
        parameters?.optimal_growth_temp_max,
        copy,
        "℃"
      ),
    },
    {
      label: copy.temperature_labels.vigorous_growth,
      value: isEmpty(parameters?.vigorous_growth_temp)
        ? null
        : `${parameters?.vigorous_growth_temp}℃`,
    },
    {
      label: copy.temperature_labels.growth_slow,
      value: isEmpty(parameters?.growth_slow_temp)
        ? null
        : `${parameters?.growth_slow_temp}℃`,
    },
    {
      label: copy.temperature_labels.frost_damage,
      value: isEmpty(parameters?.frost_damage_temp)
        ? null
        : `${parameters?.frost_damage_temp}℃`,
    },
    {
      label: copy.temperature_labels.lethal_low,
      value: isEmpty(parameters?.lethal_low_temp)
        ? null
        : `${parameters?.lethal_low_temp}℃`,
    },
    {
      label: copy.temperature_labels.stop_low,
      value: isEmpty(parameters?.stop_low_temp)
        ? null
        : `${parameters?.stop_low_temp}℃`,
    },
    {
      label: copy.temperature_labels.stop_high,
      value: isEmpty(parameters?.stop_high_temp)
        ? null
        : `${parameters?.stop_high_temp}℃`,
    },
    {
      label: copy.temperature_labels.heat_scorch,
      value: isEmpty(parameters?.heat_scorch_temp)
        ? null
        : `${parameters?.heat_scorch_temp}℃`,
    },
    {
      label: copy.temperature_labels.lethal_high,
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
      ? localizedMapValue(copy.photoperiod_types, parameters.photoperiod_type)
      : null;

  const photoperiodStages =
    Array.isArray(parameters?.photoperiod_trigger_stage) &&
    parameters.photoperiod_trigger_stage.length > 0
      ? parameters.photoperiod_trigger_stage
          .map((stage: string) => localizedMapValue(copy.photoperiod_stages, stage))
          .join(t.plant.alias_separator)
      : null;

  const photoperiodCards = [
    { label: copy.photoperiod_labels.type, value: photoperiodType },
    {
      label: copy.photoperiod_labels.sensitivity,
      value: scoreLabel(parameters?.photoperiod_sensitivity_score),
    },
    {
      label: copy.photoperiod_labels.critical_day_length,
      value: isEmpty(parameters?.critical_day_length_hours)
        ? null
        : `${parameters?.critical_day_length_hours}${copy.hour_unit}`,
    },
    {
      label: copy.photoperiod_labels.trigger_stage,
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
        text: copy.login_before_interest,
        href: buildLoginHref(getCurrentInternalPath()),
        hrefText: copy.go_login,
      });
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setActionMessage({
        type: "error",
        text: copy.login_before_interest,
        href: buildLoginHref(getCurrentInternalPath()),
        hrefText: copy.go_login,
      });
      return;
    }

    if (!interestAdded && !hasCloudAccess) {
      setActionMessage({
        type: "error",
        text: copy.save_cloud_only,
        href: "/membership",
        hrefText: copy.learn_membership,
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
        text: `${interestAdded ? copy.cancel_action : copy.add_action}${copy.action_failed_separator}${error.message}`,
      });
      return;
    }

    const nextInterestAdded = !interestAdded;
    setInterestAdded(nextInterestAdded);
    setActionMessage({
      type: "success",
      text: nextInterestAdded ? copy.saved_added : copy.saved_removed,
      href: nextInterestAdded ? "/archive/interests" : undefined,
      hrefText: nextInterestAdded ? copy.view_saved : undefined,
    });
  }

  async function handleAddPlan() {
    if (!plant || actionLoading) return;

    if (!isSignedIn) {
      setActionMessage({
        type: "error",
        text: copy.login_before_plan,
        href: buildLoginHref(getCurrentInternalPath()),
        hrefText: copy.go_login,
      });
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setActionMessage({
        type: "error",
        text: copy.login_before_plan,
        href: buildLoginHref(getCurrentInternalPath()),
        hrefText: copy.go_login,
      });
      return;
    }

    if (!planAdded && !hasCloudAccess) {
      setActionMessage({
        type: "error",
        text: copy.cloud_plan_only,
        href: "/membership",
        hrefText: copy.learn_membership,
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
        text: `${planAdded ? copy.cancel_action : copy.add_action}${copy.action_failed_separator}${error.message}`,
      });
      return;
    }

    const nextPlanAdded = !planAdded;
    setPlanAdded(nextPlanAdded);
    setActionMessage({
      type: "success",
      text: nextPlanAdded ? copy.plan_added : copy.plan_removed,
      href: nextPlanAdded ? "/archive/plans" : undefined,
      hrefText: nextPlanAdded ? copy.view_plan : undefined,
    });
  }

  const experienceCardTabCount = relatedExperienceCards.length;
  const plantingRecordTabCount = Array.from(
    new Map(
      [...ownArchives, ...relatedArchives].map((archive) => [
        archive.archive_id,
        archive,
      ])
    ).values()
  ).reduce(
    (count, archive) => count + Number(archive.public_record_count || 0),
    0
  );

  if (loading) {
    return <main style={{ padding: 20 }}>{t.plant.loading}</main>;
  }

  if (!plant) {
    return (
      <main style={{ padding: "16px", maxWidth: 760, margin: "0 auto" }}>
        <Link href="/plant" style={{ color: "#666", fontSize: 14 }}>
          <UiIcon name="arrow-left" size={15} /> {t.plant.back_to_guide}
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
          {copy.not_found}
        </div>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <div className={styles.backRow}>
        {isMobileViewport && returnRecordHref ? (
          <Link href={returnRecordHref} style={{ color: "#4d7044", fontSize: 14, fontWeight: 700 }}>
            {copy.back_to_record}
          </Link>
        ) : null}
        <Link href="/plant" style={{ color: "#666", fontSize: 14 }}>
          <UiIcon name="arrow-left" size={15} /> {t.plant.back_to_guide}
        </Link>
        {!isMobileViewport ? (
          <Link href="/archive" style={{ color: "#666", fontSize: 14 }}>
            {copy.back_to_space}
          </Link>
        ) : null}
      </div>

      <section className={styles.hero}>
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
            {copy.plant_archive}
          </span>
        </div>

        <h1 className={styles.heroTitle}>{displayName}</h1>

        <div className={styles.heroMeta}>
          {plant.scientific_name && <div>{t.plant.scientific_name}{plant.scientific_name}</div>}
          {aliasNames.length > 0 && <div>{t.plant.aliases}{aliasNames.join(t.plant.alias_separator)}</div>}
          {displayFamily && <div>{copy.family}{displayFamily}</div>}
          <div>
            {copy.classification}{categoryLabel(
              plant.category,
              t.plant.categories,
              t.plant.uncategorized
            )}
            {plant.sub_category
              ? ` · ${subCategoryLabel(plant.sub_category, t.plant.subcategories)}`
              : ""}
          </div>
          {plant.growth_type && <div>{copy.growth_type}{plant.growth_type}</div>}
          {en?.common_name && <div>{copy.english_name}{en.common_name}</div>}
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
            {copy.visitor_detail_notice}
            <Link href="/register" style={{ marginLeft: 6, color: "#3f6f37", fontWeight: 700 }}>
              {copy.register_basic_summary}
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
            {copy.local_detail_notice}
            <Link href="/membership" style={{ marginLeft: 6, color: "#3f6f37", fontWeight: 700 }}>
              {copy.learn_membership}
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


        <div className={styles.heroActions}>
          <Link
            href={newProjectHref}
            className={styles.heroAction}
          >
            {hasCloudAccess ? copy.new_cloud_project : copy.new_local_project}
          </Link>

          {hasCloudAccess || planAdded ? (
              <button
                type="button"
                onClick={handleAddPlan}
                disabled={actionLoading !== null}
                className={styles.heroAction}
                style={{
                  background: planAdded ? "#f5faf5" : "#fff",
                  color: planAdded ? "#5f7f5f" : "#2f6f35",
                  cursor: actionLoading !== null ? "default" : "pointer",
                }}
              >
                {planAdded
                  ? copy.plan_already_added
                  : actionLoading === "plan"
                    ? copy.adding
                    : copy.add_to_plan}
              </button>
          ) : null}

          {hasCloudAccess || interestAdded ? (
              <button
                type="button"
                onClick={handleAddInterest}
                disabled={actionLoading !== null}
                className={styles.heroAction}
                style={{
                  background: interestAdded ? "#f5faf5" : "#fff",
                  color: interestAdded ? "#5f7f5f" : "#2f6f35",
                  cursor: actionLoading !== null ? "default" : "pointer",
                }}
              >
                {interestAdded
                  ? copy.saved
                  : actionLoading === "interest"
                    ? copy.adding
                    : copy.add_to_saved}
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
                {actionMessage.hrefText || copy.view}
              </Link>
            )}
          </div>
        )}
      </section>

      <nav aria-label={copy.content_aria} className={styles.contentTabs}>
        {([
          ["guide", copy.guide_tab],
          [
            "experience",
            experienceCardTabCount > 0
              ? `${copy.experience_cards} (${experienceCardTabCount})`
              : copy.experience_cards,
          ],
          [
            "records",
            plantingRecordTabCount > 0
              ? `${copy.growing_records} (${plantingRecordTabCount})`
              : copy.growing_records,
          ],
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
        <Section title={copy.summary}>
          <TextBlock text={basicOverview} />
        </Section>
      ) : null}

      {isSignedIn && !hasCloudAccess && localCoreParameterCards.length > 0 ? (
        <Section title={copy.basic_parameters}>
          <div className={styles.parameterGrid}>
            {localCoreParameterCards.map((item) => (
              <Card key={item.label} label={item.label} value={item.value} />
            ))}
          </div>
          <div style={{ marginTop: 12, color: "#6a7566", fontSize: 13, lineHeight: 1.7 }}>
            {copy.local_parameter_notice}
          </div>
        </Section>
      ) : null}

      {hasCloudAccess && (environmentCards.length > 0 ||
        hasText(climateTimingNote) ||
        hasTemperatureSection) && (
        <Section title={copy.climate_environment}>
          {environmentCards.length > 0 && (
            <Subsection title={copy.environment_setting}>
              <div className={styles.parameterGrid}>
                {environmentCards.map((item) => (
                  <Card key={item.label} label={item.label} value={item.value} />
                ))}
              </div>
            </Subsection>
          )}

          {hasText(climateTimingNote) && (
            <Subsection title={copy.climate_timing}>
              <TextBlock text={climateTimingNote} />
            </Subsection>
          )}

          {hasTemperatureSection && (
            <Subsection title={copy.temperature_nodes}>
              {temperatureCards.length > 0 && (
                <div className={styles.parameterGrid}>
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
        <Section title={copy.growth_parameters}>
          <Subsection title={copy.growth_cycle}>
            <GrowthCycleBlock cycle={growthCycle} copy={copy} />
          </Subsection>

          {parameterCards.length > 0 && (
            <Subsection title={copy.parameter_details}>
              <div className={styles.parameterGrid}>
                {parameterCards.map((item) => (
                  <Card key={item.label} label={item.label} value={item.value} />
                ))}
              </div>
            </Subsection>
          )}

          {hasPhotoperiodSection && (
            <Subsection title={copy.photoperiod}>
              {photoperiodCards.length > 0 && (
                <div className={styles.parameterGrid}>
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
          copy={copy}
        />
      ) : null}
        </>
      ) : null}

      {activeTab === "experience" ? (
        hasCloudAccess ? (
          <PlantExperienceCardsSection
            cards={relatedExperienceCards}
            currentUserId={currentUserId}
            copy={copy}
          />
        ) : (
          <PlantTabAccessNotice label={copy.related_experience_cards} copy={copy} />
        )
      ) : null}

      {activeTab === "records" ? (
        hasCloudAccess ? (
          <PlantRecordsSection
            parameters={parameters}
            ownArchives={ownArchives}
            publicArchives={relatedArchives}
            isLoggedIn={isSignedIn}
            copy={copy}
          />
        ) : (
          <PlantTabAccessNotice label={copy.related_growing_records} copy={copy} />
        )
      ) : null}
    </main>
  );
}
