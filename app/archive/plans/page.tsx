"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import ConfirmDialog from "@/components/ConfirmDialog";
import { showToast } from "@/components/Toast";
import UiIcon from "@/components/ui/UiIcon";
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
import {
  canCreateMembershipContent,
  normalizeMembershipRpcResult,
} from "@/lib/membership";
import { formatCardDate } from "@/lib/date-time";
import { useLanguage } from "@/lib/i18n/useLanguage";

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

export default function PlantPlansPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const statusLabels = useMemo<Record<PlantPlanStatus, string>>(
    () => ({
      want: t.plant_lists.status_want,
      preparing: t.plant_lists.status_preparing,
      started: t.plant_lists.status_started,
      abandoned: t.plant_lists.status_abandoned,
    }),
    [t]
  );
  const locationLabels = useMemo<Record<PlantPlanLocationType, string>>(
    () => ({
      indoor: t.plant_lists.location_indoor,
      balcony: t.plant_lists.location_balcony,
      garden: t.plant_lists.location_garden,
      terrace: t.plant_lists.location_terrace,
      greenhouse: t.plant_lists.location_greenhouse,
      field: t.plant_lists.location_field,
      other: t.plant_lists.location_other,
    }),
    [t]
  );

  const [userId, setUserId] = useState("");
  const [plans, setPlans] = useState<PlantPlanRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [hasCloudAccess, setHasCloudAccess] = useState(false);
  const [removePlanTarget, setRemovePlanTarget] = useState<PlantPlanRow | null>(null);
  const [removingPlanId, setRemovingPlanId] = useState<string | null>(null);

  const loadPlans = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.push("/login");
      return;
    }

    setUserId(user.id);

    const [{ data, error }, membershipResult] = await Promise.all([
      supabase
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
        .order("updated_at", { ascending: false }),
      supabase.rpc("get_my_membership"),
    ]);

    const membership = membershipResult.error
      ? null
      : normalizeMembershipRpcResult(membershipResult.data);
    setHasCloudAccess(canCreateMembershipContent(membership));

    if (error) {
      showToast(t.plant_lists.read_plans_failed + error.message);
      setPlans([]);
    } else {
      setPlans(data || []);
    }

    setLoading(false);
  }, [router, t]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadPlans();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [loadPlans]);

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
    if (!hasCloudAccess) {
      showToast(t.plant_lists.plans_edit_membership);
      return;
    }

    setSavingId(id);

    const { error } = await supabase
      .from("user_plant_plans")
      .update(payload)
      .eq("id", id)
      .eq("user_id", userId);

    setSavingId(null);

    if (error) {
      showToast(t.plant_lists.save_failed_prefix + error.message);
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
      showToast(t.plant_lists.remove_failed_prefix + error.message);
      return;
    }

    setPlans((prev) => prev.filter((item) => item.id !== removePlanTarget.id));
    setRemovePlanTarget(null);
    showToast(t.plant_lists.plan_removed);
  }

  function renderPlanCard(plan: PlantPlanRow) {
    const status = (plan.status || "want") as PlantPlanStatus;
    const statusStyle = statusStyles[status] || statusStyles.want;
    const metaItems = [
      plan.planned_start_date
        ? `${t.plant_lists.planned_prefix}${formatCardDate(plan.planned_start_date)}`
        : null,
      plan.location_type
        ? `${t.plant_lists.location_prefix}${
            locationLabels[plan.location_type as PlantPlanLocationType] || plan.location_type
          }`
        : null,
      plan.created_archive_id ? t.plant_lists.project_created : null,
    ].filter(Boolean) as string[];

    return (
      <article key={plan.id} style={cardStyle}>
        <ArchivePlantCardHeader
          speciesId={plan.species_id}
          plant={plan.plant_species}
          badgeText={plan.created_archive_id ? t.plant_lists.started_with_project : statusLabels[status]}
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
            {t.plant_lists.status}
            <select
              value={plan.status || "want"}
              disabled={!hasCloudAccess || savingId === plan.id}
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
            {t.plant_lists.planned_start}
            <input
              type="date"
              value={plan.planned_start_date || ""}
              disabled={!hasCloudAccess || savingId === plan.id}
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
            {t.plant_lists.planned_location}
            <select
              value={plan.location_type || ""}
              disabled={!hasCloudAccess || savingId === plan.id}
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
              <option value="">{t.plant_lists.not_set}</option>
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
          {t.plant_lists.note}
          <textarea
            value={plan.note || ""}
            disabled={!hasCloudAccess || savingId === plan.id}
            onChange={(event) =>
              setPlans((prev) =>
                prev.map((item) =>
                  item.id === plan.id ? { ...item, note: event.target.value } : item
                )
              )
            }
            onBlur={(event) => updatePlan(plan.id, { note: event.target.value })}
            placeholder={t.plant_lists.plan_note_placeholder}
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
              {t.plant_lists.view_project}
            </Link>
          ) : (
            <Link
              href={
                hasCloudAccess
                  ? `/archive/new?species=${plan.species_id}&plan=${plan.id}`
                  : `/local/archive/new?category=plant&plant_id=${encodeURIComponent(
                      plan.species_id
                    )}&system_name=${encodeURIComponent(
                      plantDisplayName(plan.plant_species)
                    )}`
              }
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
              {hasCloudAccess
                ? t.plant_lists.create_cloud_project
                : t.plant_lists.create_local_project}
            </Link>
          )}

          <Link href={`/plant/${plan.species_id}`} style={neutralActionLinkStyle}>
            {t.plant_lists.view_guide}
          </Link>

          <button type="button" onClick={() => removePlan(plan.id)} style={dangerActionButtonStyle}>
            {t.plant_lists.remove}
          </button>

          {savingId === plan.id && (
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
        title={t.plant_lists.plans_title}
        description={t.plant_lists.plans_description}
        primaryHref="/plant"
        primaryLabel={t.plant_lists.guide_choose}
        secondaryHref="/archive/interests"
        secondaryLabel={t.plant_lists.view_interests}
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
          {t.plant_lists.plans_membership_notice}
          <Link href="/membership" style={{ marginLeft: 6, color: "#3f6f37", fontWeight: 700 }}>
            {t.plant_lists.learn_membership}
          </Link>
        </div>
      ) : null}

      {plans.length === 0 ? (
        <ArchivePlantEmptyState
          title={t.plant_lists.no_plans}
          description={t.plant_lists.no_plans_description}
          href="/plant"
          label={t.plant_lists.guide_browse}
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
        title={t.plant_lists.remove_plan_title}
        message={`${t.plant_lists.remove_plan_prefix}${
          removePlanTarget
            ? plantDisplayName(removePlanTarget.plant_species)
            : t.plant_lists.fallback_plant
        }${t.plant_lists.remove_plan_suffix}`}
        confirmText={removingPlanId ? t.plant_lists.removing : t.plant_lists.remove}
        cancelText={t.cancel}
        danger
        onClose={() => {
          if (!removingPlanId) setRemovePlanTarget(null);
        }}
        onConfirm={confirmRemovePlan}
      />
    </main>
  );
}
