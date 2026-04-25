"use client";

import type { PlantInterestItem, PlantPlanItem } from "@/lib/archive-page-types";

type Props = {
  plantPlans: PlantPlanItem[];
  plantInterests: PlantInterestItem[];
  onOpenPlans: () => void;
  onOpenInterests: () => void;
};

export default function ArchiveOverviewCards({
  plantPlans,
  plantInterests,
  onOpenPlans,
  onOpenInterests,
}: Props) {
  const activePlanCount = plantPlans.filter((item) => item.status !== "abandoned").length;
  const startedPlanCount = plantPlans.filter(
    (item) => item.status === "started" || item.created_archive_id
  ).length;

  return (
    <section
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        gap: 12,
        marginBottom: 18,
      }}
    >
      <button
        type="button"
        onClick={onOpenPlans}
        style={{
          textAlign: "left",
          padding: 16,
          borderRadius: 16,
          border: "1px solid #e6ecdf",
          background: "#f8fff8",
          cursor: "pointer",
          color: "#1f2d1f",
        }}
      >
        <div style={{ fontSize: 17, marginBottom: 6, color: "#1f2d1f" }}>
          我的种植计划
        </div>
        <div style={{ fontSize: 13, color: "#5f7f5f", lineHeight: 1.6 }}>
          {activePlanCount} 个计划 · {startedPlanCount} 个已开始
        </div>
      </button>

      <button
        type="button"
        onClick={onOpenInterests}
        style={{
          textAlign: "left",
          padding: 16,
          borderRadius: 16,
          border: "1px solid #e6ecdf",
          background: "#fff",
          cursor: "pointer",
          color: "#1f2d1f",
        }}
      >
        <div style={{ fontSize: 17, marginBottom: 6, color: "#1f2d1f" }}>
          我感兴趣的植物
        </div>
        <div style={{ fontSize: 13, color: "#777", lineHeight: 1.6 }}>
          {plantInterests.length} 个植物
        </div>
      </button>
    </section>
  );
}
