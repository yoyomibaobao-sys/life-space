"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

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

export default function PlantInterestsPage() {
  const router = useRouter();

  const [userId, setUserId] = useState("");
  const [interests, setInterests] = useState<any[]>([]);
  const [planSpeciesIds, setPlanSpeciesIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [addingPlanSpeciesId, setAddingPlanSpeciesId] = useState<string | null>(null);

  async function loadInterests() {
    setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.push("/login");
      return;
    }

    setUserId(user.id);

    const [{ data: interestData, error: interestError }, { data: planData }] =
      await Promise.all([
        supabase
          .from("user_plant_interests")
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
          .order("created_at", { ascending: false }),

        supabase
          .from("user_plant_plans")
          .select("species_id")
          .eq("user_id", user.id),
      ]);

    if (interestError) {
      alert("读取感兴趣植物失败：" + interestError.message);
      setInterests([]);
    } else {
      setInterests(interestData || []);
    }

    setPlanSpeciesIds(
      new Set((planData || []).map((item: any) => String(item.species_id)))
    );

    setLoading(false);
  }

  useEffect(() => {
    loadInterests();
  }, []);

  async function updateInterest(id: string, payload: Record<string, any>) {
    if (!userId) return;

    setSavingId(id);

    const { error } = await supabase
      .from("user_plant_interests")
      .update(payload)
      .eq("id", id)
      .eq("user_id", userId);

    setSavingId(null);

    if (error) {
      alert("保存失败：" + error.message);
      return;
    }

    setInterests((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...payload } : item))
    );
  }

  async function removeInterest(id: string) {
    if (!userId) return;
    if (!confirm("确定从感兴趣列表中移除？")) return;

    const { error } = await supabase
      .from("user_plant_interests")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);

    if (error) {
      alert("移除失败：" + error.message);
      return;
    }

    setInterests((prev) => prev.filter((item) => item.id !== id));
  }

  async function addToPlan(speciesId: string) {
    if (!userId) return;

    setAddingPlanSpeciesId(speciesId);

    const { error } = await supabase.from("user_plant_plans").upsert(
      {
        user_id: userId,
        species_id: speciesId,
        status: "want",
      },
      { onConflict: "user_id,species_id" }
    );

    setAddingPlanSpeciesId(null);

    if (error) {
      alert("加入种植计划失败：" + error.message);
      return;
    }

    setPlanSpeciesIds((prev) => {
      const next = new Set(prev);
      next.add(speciesId);
      return next;
    });
  }

  function renderInterestCard(item: any) {
    const plant = item.plant_species;
    const name = plantDisplayName(plant);
    const isInPlan = planSpeciesIds.has(String(item.species_id));

    return (
      <article
        key={item.id}
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
              href={`/plant/${item.species_id}`}
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
          </div>

          <span
            style={{
              whiteSpace: "nowrap",
              borderRadius: 999,
              padding: "5px 10px",
              background: "#f7fbf7",
              color: "#4b6b4b",
              fontSize: 12,
              fontWeight: 650,
            }}
          >
            感兴趣
          </span>
        </div>

        <label
          style={{
            display: "block",
            marginTop: 12,
            fontSize: 13,
            color: "#666",
          }}
        >
          兴趣备注
          <textarea
            value={item.note || ""}
            disabled={savingId === item.id}
            onChange={(event) =>
              setInterests((prev) =>
                prev.map((interest) =>
                  interest.id === item.id
                    ? { ...interest, note: event.target.value }
                    : interest
                )
              )
            }
            onBlur={(event) => updateInterest(item.id, { note: event.target.value })}
            placeholder="比如：喜欢花色、想以后研究、适合阳台吗..."
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
          {isInPlan ? (
            <Link
              href="/archive/plans"
              style={{
                padding: "9px 12px",
                borderRadius: 999,
                background: "#f1f7f1",
                color: "#6a8f6a",
                border: "1px solid #d6ead6",
                fontSize: 13,
                fontWeight: 650,
                textDecoration: "none",
              }}
            >
              已在计划 · 查看
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => addToPlan(item.species_id)}
              disabled={addingPlanSpeciesId === item.species_id}
              style={{
                padding: "9px 12px",
                borderRadius: 999,
                background: "#4CAF50",
                color: "#fff",
                border: "none",
                fontSize: 13,
                fontWeight: 650,
                cursor:
                  addingPlanSpeciesId === item.species_id ? "default" : "pointer",
              }}
            >
              {addingPlanSpeciesId === item.species_id
                ? "加入中..."
                : "加入种植计划"}
            </button>
          )}

          <Link
            href={`/archive/new?species=${item.species_id}`}
            style={{
              padding: "9px 12px",
              borderRadius: 999,
              border: "1px solid #d6ead6",
              color: "#4CAF50",
              fontSize: 13,
              textDecoration: "none",
              background: "#fff",
              fontWeight: 650,
            }}
          >
            创建植物项目
          </Link>

          <Link
            href={`/plant/${item.species_id}`}
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
            onClick={() => removeInterest(item.id)}
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

          {savingId === item.id && (
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
        <h1 style={{ margin: 0, fontSize: 28 }}>我感兴趣的植物</h1>
        <p style={{ margin: "10px 0 0", color: "#666", lineHeight: 1.7 }}>
          这里适合轻量保存喜欢、想了解、以后可能会种的植物。明确想种后，再加入种植计划。
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
            href="/archive/plans"
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
            查看种植计划
          </Link>
        </div>
      </section>

      {interests.length === 0 ? (
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
            还没有感兴趣的植物
          </div>
          <p style={{ margin: "8px 0 14px", lineHeight: 1.7 }}>
            这里可以先轻轻保存喜欢的植物，不必马上决定要不要种。
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
        <section style={{ marginTop: 16 }}>
          <h2 style={{ margin: "0 0 10px", fontSize: 18 }}>
            全部 · {interests.length}
          </h2>

          <div style={{ display: "grid", gap: 12 }}>
            {interests.map((item) => renderInterestCard(item))}
          </div>
        </section>
      )}
    </main>
  );
}
