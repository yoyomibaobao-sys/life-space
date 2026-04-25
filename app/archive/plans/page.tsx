"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import ConfirmDialog from "@/components/ConfirmDialog";
import { showToast } from "@/components/Toast";
import type {
  PlantPlanLocationType,
  PlantPlanRow,
  PlantPlanStatus,
} from "@/lib/domain-types";
import ArchivePlantPageHero from "@/components/archive-plant/ArchivePlantPageHero";
import ArchivePlantEmptyState from "@/components/archive-plant/ArchivePlantEmptyState";
import ArchivePlantCardHeader from "@/components/archive-plant/ArchivePlantCardHeader";
import {
  cardStyle,
  plantDisplayName,
  sectionHeaderStyle,
  subtleTextareaStyle,
  neutralActionLinkStyle,
  dangerActionButtonStyle,
} from "@/lib/archive-plant-shared";

const statusLabels: Record<PlantPlanStatus, string> = {
  want: "想种",
  preparing: "准备中",
  started: "已开始",
  abandoned: "已放弃",
};

const statusStyles: Record<
  PlantPlanStatus,
  { background: string; color: string; border: string }
> = {
  want: {
    background: "#fffaf0",
    color: "#9a6a1f",
    border: "1px solid #f1dfbd",
  },
  preparing: {
    background: "#f7fbf7",
    color: "#4b6b4b",
    border: "1px solid #dcefdc",
  },
  started: {
    background: "#f0fff4",
    color: "#2e7d32",
    border: "1px solid #cdeccd",
  },
  abandoned: {
    background: "#f7f7f7",
    color: "#888",
    border: "1px solid #e5e5e5",
  },
};

const locationLabels: Record<PlantPlanLocationType, string> = {
  indoor: "室内",
  balcony: "阳台",
  garden: "花园",
  terrace: "露台",
  greenhouse: "温室",
  field: "田地",
  other: "其他",
};

export default function PlantPlansPage() {
  const router = useRouter();

  const [userId, setUserId] = useState("");
  const [plans, setPlans] = useState<PlantPlanRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [removePlanTarget, setRemovePlanTarget] = useState<PlantPlanRow | null>(null);
  const [removingPlanId, setRemovingPlanId] = useState<string | null>(null);

  async function loadPlans() {
    setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.push("/login");
      return;
    }

    setUserId(user.id);

    const { data, error } = await supabase
      .from("user_plant_plans")
      .select(
        `
        *,
        plant_species:species_id (
          id,
          common_name,
          scientific_name,
          slug,
          category,
          sub_category
        )
      `
      )
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false });

    if (error) {
      showToast("读取种植计划失败：" + error.message);
      setPlans([]);
    } else {
      setPlans(data || []);
    }

    setLoading(false);
  }

  useEffect(() => {
    loadPlans();
  }, []);

  const groupedPlans = useMemo(() => {
    const groups: Record<PlantPlanStatus, PlantPlanRow[]> = {
      want: [],
      preparing: [],
      started: [],
      abandoned: [],
    };

    plans.forEach((plan) => {
      const status = (plan.status || "want") as PlantPlanStatus;
      if (groups[status]) {
        groups[status].push(plan);
      } else {
        groups.want.push(plan);
      }
    });

    return groups;
  }, [plans]);

  async function updatePlan(
    id: string,
    payload: Partial<
      Pick<
        PlantPlanRow,
        "status" | "planned_start_date" | "location_type" | "note" | "created_archive_id"
      >
    >
  ) {
    if (!userId) return;

    setSavingId(id);

    const { error } = await supabase
      .from("user_plant_plans")
      .update(payload)
      .eq("id", id)
      .eq("user_id", userId);

    setSavingId(null);

    if (error) {
      showToast("保存失败：" + error.message);
      return;
    }

    setPlans((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...payload } : item))
    );
  }

  function removePlan(id: string) {
    if (!userId) return;
    const target = plans.find((item) => item.id === id) || null;
    setRemovePlanTarget(target);
  }

  async function confirmRemovePlan() {
    if (!userId || !removePlanTarget || removingPlanId) return;

    setRemovingPlanId(removePlanTarget.id);

    const { error } = await supabase
      .from("user_plant_plans")
      .delete()
      .eq("id", removePlanTarget.id)
      .eq("user_id", userId);

    setRemovingPlanId(null);

    if (error) {
      showToast("移除失败：" + error.message);
      return;
    }

    setPlans((prev) => prev.filter((item) => item.id !== removePlanTarget.id));
    setRemovePlanTarget(null);
    showToast("已从种植计划中移除");
  }

  function renderPlanCard(plan: PlantPlanRow) {
    const status = (plan.status || "want") as PlantPlanStatus;
    const statusStyle = statusStyles[status] || statusStyles.want;
    const metaItems = [
      plan.planned_start_date ? `计划：${plan.planned_start_date}` : null,
      plan.location_type
        ? `位置：${locationLabels[plan.location_type as PlantPlanLocationType] || plan.location_type}`
        : null,
      plan.created_archive_id ? "已创建项目" : null,
    ].filter(Boolean) as string[];

    return (
      <article key={plan.id} style={cardStyle}>
        <ArchivePlantCardHeader
          speciesId={plan.species_id}
          plant={plan.plant_species}
          badgeText={plan.created_archive_id ? "已开始 · 有项目" : statusLabels[status]}
          badgeStyle={statusStyle}
          metaItems={metaItems}
        />

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: 10,
            marginTop: 14,
          }}
        >
          <label style={{ fontSize: 13, color: "#666" }}>
            状态
            <select
              value={plan.status || "want"}
              disabled={savingId === plan.id}
              onChange={(event) =>
                updatePlan(plan.id, { status: event.target.value as PlantPlanStatus })
              }
              style={{
                width: "100%",
                marginTop: 6,
                padding: "8px 10px",
                borderRadius: 10,
                border: "1px solid #ddd",
                background: "#fff",
              }}
            >
              {Object.entries(statusLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <label style={{ fontSize: 13, color: "#666" }}>
            计划开始时间
            <input
              type="date"
              value={plan.planned_start_date || ""}
              disabled={savingId === plan.id}
              onChange={(event) =>
                updatePlan(plan.id, {
                  planned_start_date: event.target.value || null,
                })
              }
              style={{
                width: "100%",
                boxSizing: "border-box",
                marginTop: 6,
                padding: "8px 10px",
                borderRadius: 10,
                border: "1px solid #ddd",
              }}
            />
          </label>

          <label style={{ fontSize: 13, color: "#666" }}>
            计划位置
            <select
              value={plan.location_type || ""}
              disabled={savingId === plan.id}
              onChange={(event) =>
                updatePlan(plan.id, {
                  location_type: (event.target.value || null) as PlantPlanLocationType | null,
                })
              }
              style={{
                width: "100%",
                marginTop: 6,
                padding: "8px 10px",
                borderRadius: 10,
                border: "1px solid #ddd",
                background: "#fff",
              }}
            >
              <option value="">未设置</option>
              {Object.entries(locationLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label
          style={{
            display: "block",
            marginTop: 12,
            fontSize: 13,
            color: "#666",
          }}
        >
          备注
          <textarea
            value={plan.note || ""}
            disabled={savingId === plan.id}
            onChange={(event) =>
              setPlans((prev) =>
                prev.map((item) =>
                  item.id === plan.id ? { ...item, note: event.target.value } : item
                )
              )
            }
            onBlur={(event) => updatePlan(plan.id, { note: event.target.value })}
            placeholder="比如：等春天播种、先买苗、想试试阳台盆栽..."
            rows={3}
            style={subtleTextareaStyle}
          />
        </label>

        <div
          style={{
            marginTop: 14,
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          {plan.created_archive_id ? (
            <Link
              href={`/archive/${plan.created_archive_id}`}
              style={{
                padding: "9px 12px",
                borderRadius: 999,
                background: "#f0fff4",
                color: "#2e7d32",
                fontSize: 13,
                fontWeight: 650,
                textDecoration: "none",
                border: "1px solid #cdeccd",
              }}
            >
              查看植物项目
            </Link>
          ) : (
            <Link
              href={`/archive/new?species=${plan.species_id}&plan=${plan.id}`}
              style={{
                padding: "9px 12px",
                borderRadius: 999,
                background: "#4CAF50",
                color: "#fff",
                fontSize: 13,
                fontWeight: 650,
                textDecoration: "none",
              }}
            >
              创建植物项目
            </Link>
          )}

          <Link href={`/plant/${plan.species_id}`} style={neutralActionLinkStyle}>
            查看百科
          </Link>

          <button type="button" onClick={() => removePlan(plan.id)} style={dangerActionButtonStyle}>
            移除
          </button>

          {savingId === plan.id && <span style={{ color: "#888", fontSize: 13 }}>保存中...</span>}
        </div>
      </article>
    );
  }

  if (loading) {
    return <main style={{ padding: 20 }}>加载中...</main>;
  }

  return (
    <main style={{ padding: "16px", maxWidth: 980, margin: "0 auto" }}>
      <Link href="/archive" style={{ color: "#666", fontSize: 14 }}>
        ← 返回空间
      </Link>

      <ArchivePlantPageHero
        badge="个人种植路径"
        title="我的种植计划"
        description="这里保存准备种、等待季节、正在筹备的植物。真正开始种植后，再创建正式项目并长期记录。"
        primaryHref="/plant"
        primaryLabel="去植物百科选择植物"
        secondaryHref="/archive/interests"
        secondaryLabel="查看感兴趣植物"
      />

      {plans.length === 0 ? (
        <ArchivePlantEmptyState
          title="还没有种植计划"
          description="看到想尝试的植物，可以先加入计划；等真的开始种，再转成正式项目。"
          href="/plant"
          label="去植物百科看看"
        />
      ) : (
        <div style={{ marginTop: 16, display: "grid", gap: 18 }}>
          {(Object.keys(statusLabels) as PlantPlanStatus[]).map((status) => {
            const items = groupedPlans[status];
            if (!items.length) return null;

            return (
              <section key={status}>
                <h2 style={sectionHeaderStyle}>
                  {statusLabels[status]} · {items.length}
                </h2>

                <div style={{ display: "grid", gap: 12 }}>
                  {items.map((plan) => renderPlanCard(plan))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(removePlanTarget)}
        title="移除种植计划"
        message={`确定将“${removePlanTarget ? plantDisplayName(removePlanTarget.plant_species) : "这株植物"}”从种植计划中移除吗？`}
        confirmText={removingPlanId ? "移除中..." : "移除"}
        cancelText="取消"
        danger
        onClose={() => {
          if (!removingPlanId) setRemovePlanTarget(null);
        }}
        onConfirm={confirmRemovePlan}
      />
    </main>
  );
}
