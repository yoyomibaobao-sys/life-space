"use client";

import Link from "next/link";
import type { ActionMessage, PlantI18nItem, PlantSpeciesDetail } from "@/lib/plant-detail-types";
import { categoryLabel } from "@/lib/plant-detail-utils";
import { useLanguage } from "@/lib/i18n/useLanguage";

export default function PlantDetailHero({
  plant,
  zh,
  en,
  aliasNames,
  displayName,
  summary,
  environmentTags,
  interestAdded,
  planAdded,
  actionLoading,
  actionMessage,
  onAddPlan,
  onAddInterest,
}: {
  plant: PlantSpeciesDetail;
  zh?: PlantI18nItem | null;
  en?: PlantI18nItem | null;
  aliasNames: string[];
  displayName: string;
  summary?: string | null;
  environmentTags: string[];
  interestAdded: boolean;
  planAdded: boolean;
  actionLoading: "interest" | "plan" | null;
  actionMessage: ActionMessage | null;
  onAddPlan: () => void;
  onAddInterest: () => void;
}) {
  const { language, t } = useLanguage();
  const copy = t.plant.detail;
  const localizedFamily = (language === "en" ? en?.family : zh?.family) || plant.family;

  return (
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
          {copy.plant_archive}
        </span>
      </div>

      <h1 style={{ margin: 0, fontSize: 30 }}>{displayName}</h1>

      <div style={{ marginTop: 10, color: "#666", lineHeight: 1.85 }}>
        {plant.scientific_name && <div>{t.plant.scientific_name}{plant.scientific_name}</div>}
        {aliasNames.length > 0 && <div>{t.plant.aliases}{aliasNames.join(t.plant.alias_separator)}</div>}
        {localizedFamily && <div>{copy.family}{localizedFamily}</div>}
        <div>{copy.classification}{categoryLabel(plant.category, language)}</div>
        {en?.common_name && <div>{copy.english_name}{en.common_name}</div>}
      </div>

      {summary && (
        <div style={{ marginTop: 4, paddingTop: 2 }}>
          <div
            style={{
              fontSize: 18,
              fontWeight: 700,
              color: "#666",
              marginBottom: 8,
            }}
          >
            {copy.summary}
          </div>
          <div
            style={{
              lineHeight: 1,
              color: "#303030",
              fontSize: 18,
            }}
          >
            {summary}
          </div>
        </div>
      )}

      {environmentTags.length > 0 && (
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
          href={`/archive/new?species=${plant.id}`}
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
          {copy.new_project}
        </Link>

        <button
          type="button"
          onClick={onAddPlan}
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
            ? copy.plan_already_added
            : actionLoading === "plan"
              ? copy.adding
              : copy.add_to_plan}
        </button>

        <button
          type="button"
          onClick={onAddInterest}
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
            ? copy.saved
            : actionLoading === "interest"
              ? copy.adding
              : copy.add_to_saved}
        </button>
      </div>

      {actionMessage && (
        <div
          style={{
            marginTop: 12,
            padding: "9px 12px",
            borderRadius: 12,
            border: actionMessage.type === "success" ? "1px solid #d6ead6" : "1px solid #ffe0e0",
            background: actionMessage.type === "success" ? "#f8fff8" : "#fff7f7",
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
  );
}
