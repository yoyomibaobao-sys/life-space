"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import ConfirmDialog from "@/components/ConfirmDialog";
import { showToast } from "@/components/Toast";
import UiIcon from "@/components/ui/UiIcon";
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
import {
  canCreateMembershipContent,
  normalizeMembershipRpcResult,
} from "@/lib/membership";
import { useLanguage } from "@/lib/i18n/useLanguage";

export default function PlantInterestsPage() {
  const router = useRouter();
  const { t } = useLanguage();

  const [userId, setUserId] = useState("");
  const [interests, setInterests] = useState<PlantInterestRow[]>([]);
  const [planSpeciesIds, setPlanSpeciesIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [addingPlanSpeciesId, setAddingPlanSpeciesId] = useState<string | null>(null);
  const [hasCloudAccess, setHasCloudAccess] = useState(false);
  const [removeInterestTarget, setRemoveInterestTarget] = useState<PlantInterestRow | null>(null);
  const [removingInterestId, setRemovingInterestId] = useState<string | null>(null);

  const loadInterests = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.push("/login");
      return;
    }

    setUserId(user.id);

    const [
      { data: interestData, error: interestError },
      { data: planData },
      membershipResult,
    ] = await Promise.all([
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
      supabase.rpc("get_my_membership"),
    ]);

    const membership = membershipResult.error
      ? null
      : normalizeMembershipRpcResult(membershipResult.data);
    setHasCloudAccess(canCreateMembershipContent(membership));

    if (interestError) {
      showToast(t.plant_lists.read_interests_failed + interestError.message);
      setInterests([]);
    } else {
      setInterests(interestData || []);
    }

    setPlanSpeciesIds(new Set((planData || []).map((item: SpeciesRefRow) => String(item.species_id))));

    setLoading(false);
  }, [router, t]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadInterests();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [loadInterests]);

  async function updateInterest(id: string, payload: Partial<Pick<PlantInterestRow, "note">>) {
    if (!userId) return;
    if (!hasCloudAccess) {
      showToast(t.plant_lists.interests_edit_membership);
      return;
    }

    setSavingId(id);

    const { error } = await supabase
      .from("user_plant_interests")
      .update(payload)
      .eq("id", id)
      .eq("user_id", userId);

    setSavingId(null);

    if (error) {
      showToast(t.plant_lists.save_failed_prefix + error.message);
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
      showToast(t.plant_lists.remove_failed_prefix + error.message);
      return;
    }

    setInterests((prev) => prev.filter((item) => item.id !== removeInterestTarget.id));
    setRemoveInterestTarget(null);
    showToast(t.plant_lists.interest_removed);
  }

  async function addToPlan(speciesId: string) {
    if (!userId) return;
    if (!hasCloudAccess) {
      showToast(t.plant_lists.plan_membership_required);
      return;
    }

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
      showToast(t.plant_lists.plan_add_failed_prefix + error.message);
      return;
    }

    showToast(t.plant_lists.plan_added);

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
          badgeText={t.plant_lists.interested_badge}
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
          {t.plant_lists.interest_note}
          <textarea
            value={item.note || ""}
            disabled={!hasCloudAccess || savingId === item.id}
            onChange={(event) =>
              setInterests((prev) =>
                prev.map((interest) =>
                  interest.id === item.id ? { ...interest, note: event.target.value } : interest
                )
              )
            }
            onBlur={(event) => updateInterest(item.id, { note: event.target.value })}
            placeholder={t.plant_lists.interest_note_placeholder}
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
              {t.plant_lists.in_plan_view}
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => addToPlan(item.species_id)}
              disabled={!hasCloudAccess || addingPlanSpeciesId === item.species_id}
              style={{
                padding: "9px 12px",
                borderRadius: 999,
                background: "#4CAF50",
                color: "#fff",
                border: "none",
                fontSize: 13,
                fontWeight: 650,
                cursor:
                  !hasCloudAccess || addingPlanSpeciesId === item.species_id
                    ? "default"
                    : "pointer",
                opacity: hasCloudAccess ? 1 : 0.55,
              }}
            >
              {addingPlanSpeciesId === item.species_id
                ? t.plant_lists.adding_to_plan
                : t.plant_lists.add_to_plan}
            </button>
          )}

          <Link
            href={
              hasCloudAccess
                ? `/archive/new?species=${item.species_id}`
                : `/local/archive/new?category=plant&plant_id=${encodeURIComponent(
                    item.species_id
                  )}&system_name=${encodeURIComponent(
                    plantDisplayName(item.plant_species)
                  )}`
            }
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
            {hasCloudAccess
              ? t.plant_lists.create_cloud_project
              : t.plant_lists.create_local_project}
          </Link>

          <Link href={`/plant/${item.species_id}`} style={neutralActionLinkStyle}>
            {t.plant_lists.view_guide}
          </Link>

          <button type="button" onClick={() => removeInterest(item.id)} style={dangerActionButtonStyle}>
            {t.plant_lists.remove}
          </button>

          {savingId === item.id && (
            <span style={{ color: "#888", fontSize: 13 }}>{t.plant_lists.saving}</span>
          )}
        </div>
      </article>
    );
  }

  if (loading) {
    return <main style={{ padding: 20 }}>{t.loading}</main>;
  }

  return (
    <main style={{ padding: "16px", maxWidth: 980, margin: "0 auto" }}>
      <Link href="/archive" style={{ color: "#666", fontSize: 14 }}>
        <UiIcon name="arrow-left" size={15} /> {t.plant_lists.back_to_space}
      </Link>

      <ArchivePlantPageHero
        badge={t.plant_lists.personal_path}
        title={t.plant_lists.interests_title}
        description={t.plant_lists.interests_description}
        primaryHref="/plant"
        primaryLabel={t.plant_lists.guide_choose}
        secondaryHref="/archive/plans"
        secondaryLabel={t.plant_lists.view_plans}
      />

      {!hasCloudAccess ? (
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
          {t.plant_lists.interests_membership_notice}
          <Link href="/membership" style={{ marginLeft: 6, color: "#3f6f37", fontWeight: 700 }}>
            {t.plant_lists.learn_membership}
          </Link>
        </div>
      ) : null}

      {interests.length === 0 ? (
        <ArchivePlantEmptyState
          title={t.plant_lists.no_interests}
          description={t.plant_lists.no_interests_description}
          href="/plant"
          label={t.plant_lists.guide_browse}
        />
      ) : (
        <section style={{ marginTop: 16 }}>
          <h2 style={sectionHeaderStyle}>{t.plant_lists.all} · {interests.length}</h2>

          <div style={{ display: "grid", gap: 12 }}>{interests.map((item) => renderInterestCard(item))}</div>
        </section>
      )}

      <ConfirmDialog
        open={Boolean(removeInterestTarget)}
        title={t.plant_lists.remove_interest_title}
        message={`${t.plant_lists.remove_interest_prefix}${
          removeInterestTarget
            ? plantDisplayName(removeInterestTarget.plant_species)
            : t.plant_lists.fallback_plant
        }${t.plant_lists.remove_interest_suffix}`}
        confirmText={removingInterestId ? t.plant_lists.removing : t.plant_lists.remove}
        cancelText={t.cancel}
        danger
        onClose={() => {
          if (!removingInterestId) setRemoveInterestTarget(null);
        }}
        onConfirm={confirmRemoveInterest}
      />
    </main>
  );
}
