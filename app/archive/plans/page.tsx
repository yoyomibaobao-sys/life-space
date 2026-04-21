"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type PlanStatus = "want" | "preparing" | "started" | "abandoned";
type LocationType =
  | "indoor"
  | "balcony"
  | "garden"
  | "terrace"
  | "greenhouse"
  | "field"
  | "other";

const statusLabels: Record<PlanStatus, string> = {
  want: "想种",
  preparing: "准备中",
  started: "已开始",
  abandoned: "已放弃",
};

const statusStyles: Record<
  PlanStatus,
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

const locationLabels: Record<LocationType, string> = {
  indoor: "室内",
  balcony: "阳台",
  garden: "花园",
  terrace: "露台",
  greenhouse: "温室",
  field: "田地",
  other: "其他",
};

function plantDisplayName(plant: any) {
  return plant?.common_name || plant?.scientific_name || "未命名植物";
}

function categoryLabel(value?: string | null) {
  const labels: Record<string, string> = {
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

  if (!value) return "未分类";
  return labels[value] || value;
}

export default function PlantPlansPage() {
  const router = useRouter();

  const [userId, setUserId] = useState("");
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

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
      alert("读取种植计划失败：" + error.message);
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
    const groups: Record<PlanStatus, any[]> = {
      want: [],
      preparing: [],
      started: [],
      abandoned: [],
    };

    plans.forEach((plan) => {
      const status = (plan.status || "want") as PlanStatus;
      if (groups[status]) {
        groups[status].push(plan);
      } else {
        groups.want.push(plan);
      }
    });

    return groups;
  }, [plans]);

  async function updatePlan(id: string, payload: Record<string, any>) {
    if (!userId) return;

    setSavingId(id);

    const { error } = await supabase
      .from("user_plant_plans")
      .update(payload)
      .eq("id", id)
      .eq("user_id", userId);

    setSavingId(null);

    if (error) {
      alert("保存失败：" + error.message);
      return;
    }

    setPlans((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...payload } : item))
    );
  }

  async function removePlan(id: string) {
    if (!userId) return;
    if (!confirm("确定从种植计划中移除？")) return;

    const { error } = await supabase
      .from("user_plant_plans")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);

    if (error) {
      alert("移除失败：" + error.message);
      return;
    }

    setPlans((prev) => prev.filter((item) => item.id !== id));
  }

  function renderPlanCard(plan: any) {
    const plant = plan.plant_species;
    const name = plantDisplayName(plant);
    const status = ((plan.status || "want") as PlanStatus);
    const statusStyle = statusStyles[status] || statusStyles.want;
    const metaItems = [
      plan.planned_start_date ? `计划：${plan.planned_start_date}` : null,
      plan.location_type ? `位置：${locationLabels[plan.location_type as LocationType] || plan.location_type}` : null,
      plan.created_archive_id ? "已创建项目" : null,
    ].filter(Boolean);

    return (
      <article
        key={plan.id}
        style={{
          padding: 16,
          border: "1px solid #eee",
          borderRadius: 18,
          background: "#fff",
          boxShadow: "0 6px 18px rgba(0,0,0,0.03)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            alignItems: "flex-start",
          }}
        >
          <div>
            <Link
              href={`/plant/${plan.species_id}`}
              style={{
                color: "#111",
                fontWeight: 700,
                fontSize: 18,
                textDecoration: "none",
              }}
            >
              {name}
            </Link>

            {plant?.scientific_name && (
              <div
                style={{
                  marginTop: 4,
                  color: "#777",
                  fontSize: 13,
                  fontStyle: "italic",
                }}
              >
                {plant.scientific_name}
              </div>
            )}

            <div style={{ marginTop: 8, color: "#888", fontSize: 13 }}>
              {categoryLabel(plant?.category)}
            </div>

            {metaItems.length > 0 && (
              <div style={{ marginTop: 6, color: "#777", fontSize: 13 }}>
                {metaItems.join(" · ")}
              </div>
            )}
          </div>

          <span
            style={{
              whiteSpace: "nowrap",
              borderRadius: 999,
              padding: "5px 10px",
              background: statusStyle.background,
              color: statusStyle.color,
              border: statusStyle.border,
              fontSize: 12,
              fontWeight: 650,
            }}
          >
            {plan.created_archive_id ? "已开始 · 有项目" : statusLabels[status]}
          </span>
        </div>

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
                updatePlan(plan.id, { status: event.target.value })
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
                  location_type: event.target.value || null,
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
            style={{
              width: "100%",
              boxSizing: "border-box",
              marginTop: 6,
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid #ddd",
              resize: "vertical",
              lineHeight: 1.6,
            }}
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

          <Link
            href={`/plant/${plan.species_id}`}
            style={{
              padding: "9px 12px",
              borderRadius: 999,
              border: "1px solid #ddd",
              color: "#444",
              fontSize: 13,
              textDecoration: "none",
              background: "#fff",
            }}
          >
            查看百科
          </Link>

          <button
            type="button"
            onClick={() => removePlan(plan.id)}
            style={{
              padding: "9px 12px",
              borderRadius: 999,
              border: "1px solid #ffe0e0",
              color: "#d44",
              fontSize: 13,
              background: "#fff",
              cursor: "pointer",
            }}
          >
            移除
          </button>

          {savingId === plan.id && (
            <span style={{ color: "#888", fontSize: 13 }}>保存中...</span>
          )}
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

      <section
        style={{
          marginTop: 14,
          padding: 22,
          border: "1px solid #eee",
          borderRadius: 20,
          background: "#fff",
        }}
      >
        <div style={{ color: "#4CAF50", fontSize: 13, marginBottom: 8 }}>
          个人种植路径
        </div>
        <h1 style={{ margin: 0, fontSize: 28 }}>我的种植计划</h1>
        <p style={{ margin: "10px 0 0", color: "#666", lineHeight: 1.7 }}>
          这里保存准备种、等待季节、正在筹备的植物。真正开始种植后，再创建正式项目并长期记录。
        </p>

        <div
          style={{
            marginTop: 14,
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <Link
            href="/plant"
            style={{
              padding: "8px 12px",
              borderRadius: 999,
              background: "#4CAF50",
              color: "#fff",
              fontSize: 13,
              fontWeight: 650,
              textDecoration: "none",
            }}
          >
            去植物百科选择植物
          </Link>
          <Link
            href="/archive/interests"
            style={{
              padding: "8px 12px",
              borderRadius: 999,
              border: "1px solid #d6ead6",
              color: "#4CAF50",
              fontSize: 13,
              fontWeight: 650,
              textDecoration: "none",
              background: "#fff",
            }}
          >
            查看感兴趣植物
          </Link>
        </div>
      </section>

      {plans.length === 0 ? (
        <section
          style={{
            marginTop: 16,
            padding: 24,
            border: "1px dashed #dcefdc",
            borderRadius: 18,
            background: "#f8fff8",
            color: "#4b6b4b",
          }}
        >
          <div style={{ fontSize: 18, fontWeight: 700, color: "#2f4f2f" }}>
            还没有种植计划
          </div>
          <p style={{ margin: "8px 0 14px", lineHeight: 1.7 }}>
            看到想尝试的植物，可以先加入计划；等真的开始种，再转成正式项目。
          </p>
          <Link
            href="/plant"
            style={{
              display: "inline-flex",
              padding: "9px 13px",
              borderRadius: 999,
              background: "#4CAF50",
              color: "#fff",
              fontSize: 13,
              fontWeight: 650,
              textDecoration: "none",
            }}
          >
            去植物百科看看
          </Link>
        </section>
      ) : (
        <div style={{ marginTop: 16, display: "grid", gap: 18 }}>
          {(Object.keys(statusLabels) as PlanStatus[]).map((status) => {
            const items = groupedPlans[status];
            if (!items.length) return null;

            return (
              <section key={status}>
                <h2 style={{ margin: "0 0 10px", fontSize: 18 }}>
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
    </main>
  );
}
