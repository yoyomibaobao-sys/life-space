"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import ConfirmDialog from "@/components/ConfirmDialog";
import { showToast } from "@/components/Toast";
import type { PlantInterestRow, SpeciesRefRow } from "@/lib/domain-types";
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

export default function PlantInterestsPage() {
  const router = useRouter();

  const [userId, setUserId] = useState("");
  const [interests, setInterests] = useState<PlantInterestRow[]>([]);
  const [planSpeciesIds, setPlanSpeciesIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [addingPlanSpeciesId, setAddingPlanSpeciesId] = useState<string | null>(null);
  const [removeInterestTarget, setRemoveInterestTarget] = useState<PlantInterestRow | null>(null);
  const [removingInterestId, setRemovingInterestId] = useState<string | null>(null);

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

    const [{ data: interestData, error: interestError }, { data: planData }] = await Promise.all([
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

      supabase.from("user_plant_plans").select("species_id").eq("user_id", user.id),
    ]);

    if (interestError) {
      showToast("读取感兴趣植物失败：" + interestError.message);
      setInterests([]);
    } else {
      setInterests(interestData || []);
    }

    setPlanSpeciesIds(new Set((planData || []).map((item: SpeciesRefRow) => String(item.species_id))));

    setLoading(false);
  }

  useEffect(() => {
    loadInterests();
  }, []);

  async function updateInterest(id: string, payload: Partial<Pick<PlantInterestRow, "note">>) {
    if (!userId) return;

    setSavingId(id);

    const { error } = await supabase
      .from("user_plant_interests")
      .update(payload)
      .eq("id", id)
      .eq("user_id", userId);

    setSavingId(null);

    if (error) {
      showToast("保存失败：" + error.message);
      return;
    }

    setInterests((prev) => prev.map((item) => (item.id === id ? { ...item, ...payload } : item)));
  }

  function removeInterest(id: string) {
    if (!userId) return;
    const target = interests.find((item) => item.id === id) || null;
    setRemoveInterestTarget(target);
  }

  async function confirmRemoveInterest() {
    if (!userId || !removeInterestTarget || removingInterestId) return;

    setRemovingInterestId(removeInterestTarget.id);

    const { error } = await supabase
      .from("user_plant_interests")
      .delete()
      .eq("id", removeInterestTarget.id)
      .eq("user_id", userId);

    setRemovingInterestId(null);

    if (error) {
      showToast("移除失败：" + error.message);
      return;
    }

    setInterests((prev) => prev.filter((item) => item.id !== removeInterestTarget.id));
    setRemoveInterestTarget(null);
    showToast("已从感兴趣列表中移除");
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
      showToast("加入种植计划失败：" + error.message);
      return;
    }

    showToast("已加入种植计划");

    setPlanSpeciesIds((prev) => {
      const next = new Set(prev);
      next.add(speciesId);
      return next;
    });
  }

  function renderInterestCard(item: PlantInterestRow) {
    const isInPlan = planSpeciesIds.has(String(item.species_id));

    return (
      <article key={item.id} style={cardStyle}>
        <ArchivePlantCardHeader
          speciesId={item.species_id}
          plant={item.plant_species}
          badgeText="感兴趣"
          badgeStyle={{ background: "#f7fbf7", color: "#4b6b4b" }}
        />

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
                  interest.id === item.id ? { ...interest, note: event.target.value } : interest
                )
              )
            }
            onBlur={(event) => updateInterest(item.id, { note: event.target.value })}
            placeholder="比如：喜欢花色、想以后研究、适合阳台吗..."
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
                cursor: addingPlanSpeciesId === item.species_id ? "default" : "pointer",
              }}
            >
              {addingPlanSpeciesId === item.species_id ? "加入中..." : "加入种植计划"}
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

          <Link href={`/plant/${item.species_id}`} style={neutralActionLinkStyle}>
            查看百科
          </Link>

          <button type="button" onClick={() => removeInterest(item.id)} style={dangerActionButtonStyle}>
            移除
          </button>

          {savingId === item.id && <span style={{ color: "#888", fontSize: 13 }}>保存中...</span>}
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
        title="我感兴趣的植物"
        description="这里适合轻量保存喜欢、想了解、以后可能会种的植物。明确想种后，再加入种植计划。"
        primaryHref="/plant"
        primaryLabel="去植物百科选择植物"
        secondaryHref="/archive/plans"
        secondaryLabel="查看种植计划"
      />

      {interests.length === 0 ? (
        <ArchivePlantEmptyState
          title="还没有感兴趣的植物"
          description="这里可以先轻轻保存喜欢的植物，不必马上决定要不要种。"
          href="/plant"
          label="去植物百科看看"
        />
      ) : (
        <section style={{ marginTop: 16 }}>
          <h2 style={sectionHeaderStyle}>全部 · {interests.length}</h2>

          <div style={{ display: "grid", gap: 12 }}>{interests.map((item) => renderInterestCard(item))}</div>
        </section>
      )}

      <ConfirmDialog
        open={Boolean(removeInterestTarget)}
        title="移除感兴趣植物"
        message={`确定将“${removeInterestTarget ? plantDisplayName(removeInterestTarget.plant_species) : "这株植物"}”从感兴趣列表中移除吗？`}
        confirmText={removingInterestId ? "移除中..." : "移除"}
        cancelText="取消"
        danger
        onClose={() => {
          if (!removingInterestId) setRemoveInterestTarget(null);
        }}
        onConfirm={confirmRemoveInterest}
      />
    </main>
  );
}
