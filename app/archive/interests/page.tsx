"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import ConfirmDialog from "@/components/ConfirmDialog";
import { showToast } from "@/components/Toast";
import UiIcon from "@/components/ui/UiIcon";
import type { PlantInterestRow } from "@/lib/domain-types";
import { buildLoginHref } from "@/lib/auth-return";
import ArchivePlantEmptyState from "@/components/archive-plant/ArchivePlantEmptyState";
import { categoryLabel, plantDisplayName } from "@/lib/archive-plant-shared";
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
  const [loading, setLoading] = useState(true);
  const [hasCloudAccess, setHasCloudAccess] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<PlantInterestRow | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const loadInterests = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push(buildLoginHref("/archive/interests"));
      return;
    }

    setUserId(user.id);
    const [{ data, error }, membershipResult] = await Promise.all([
      supabase
        .from("user_plant_interests")
        .select(`
          *,
          plant_species:species_id (
            id, common_name, scientific_name, slug, category, sub_category
          )
        `)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
      supabase.rpc("get_my_membership"),
    ]);

    setHasCloudAccess(
      canCreateMembershipContent(
        membershipResult.error
          ? null
          : normalizeMembershipRpcResult(membershipResult.data)
      )
    );
    if (error) {
      showToast(t.plant_lists.read_interests_failed + error.message);
      setInterests([]);
    } else {
      setInterests(data || []);
    }
    setLoading(false);
  }, [router, t]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadInterests(), 0);
    return () => window.clearTimeout(timer);
  }, [loadInterests]);

  async function confirmRemove() {
    if (!userId || !removeTarget || removingId) return;
    setRemovingId(removeTarget.id);
    const { error } = await supabase
      .from("user_plant_interests")
      .delete()
      .eq("id", removeTarget.id)
      .eq("user_id", userId);
    setRemovingId(null);

    if (error) {
      showToast(t.plant_lists.remove_failed_prefix + error.message);
      return;
    }
    setInterests((items) => items.filter((item) => item.id !== removeTarget.id));
    setRemoveTarget(null);
    showToast(t.plant_lists.interest_removed);
  }

  if (loading) return <main style={pageStyle}>{t.loading}</main>;

  return (
    <main style={pageStyle}>
      <header style={headerStyle}>
        <Link href="/plant" style={backLinkStyle} aria-label={t.plant.back_to_guide}>
          <UiIcon name="arrow-left" size={18} />
        </Link>
        <h1 style={titleStyle}>{t.plant.my_saved}</h1>
        <Link href="/plant" style={guideLinkStyle}>{t.plant_lists.guide_browse}</Link>
      </header>

      {interests.length === 0 ? (
        <ArchivePlantEmptyState
          title={t.plant_lists.no_interests}
          description={t.plant_lists.no_interests_description}
          href="/plant"
          label={t.plant_lists.guide_browse}
        />
      ) : (
        <section style={listStyle} aria-label={t.plant.my_saved}>
          {interests.map((item) => {
            const projectHref = hasCloudAccess
              ? `/archive/new?species=${item.species_id}`
              : `/local/archive/new?category=plant&plant_id=${encodeURIComponent(item.species_id)}&system_name=${encodeURIComponent(plantDisplayName(item.plant_species))}`;
            return (
              <article key={item.id} style={cardStyle}>
                <div style={cardHeadingStyle}>
                  <div style={{ minWidth: 0 }}>
                    <Link href={`/plant/${item.species_id}`} style={plantNameStyle}>
                      {plantDisplayName(item.plant_species)}
                    </Link>
                    <div style={categoryStyle}>{categoryLabel(item.plant_species?.category)}</div>
                  </div>
                  <details style={moreStyle}>
                    <summary style={moreSummaryStyle} aria-label={t.nav.more_actions}>
                      <UiIcon name="more" size={18} />
                    </summary>
                    <button type="button" onClick={() => setRemoveTarget(item)} style={removeButtonStyle}>
                      {t.plant_lists.remove}
                    </button>
                  </details>
                </div>
                <div style={actionsStyle}>
                  <Link href={`/plant/${item.species_id}`} style={secondaryActionStyle}>
                    {t.plant_lists.view_guide}
                  </Link>
                  <Link href={projectHref} style={primaryActionStyle}>
                    {hasCloudAccess
                      ? t.plant_lists.create_cloud_project
                      : t.plant_lists.create_local_project}
                  </Link>
                </div>
              </article>
            );
          })}
        </section>
      )}

      <ConfirmDialog
        open={Boolean(removeTarget)}
        title={t.plant_lists.remove_interest_title}
        message={`${t.plant_lists.remove_interest_prefix}${removeTarget ? plantDisplayName(removeTarget.plant_species) : t.plant_lists.fallback_plant}${t.plant_lists.remove_interest_suffix}`}
        confirmText={removingId ? t.plant_lists.removing : t.plant_lists.remove}
        cancelText={t.cancel}
        danger
        onClose={() => { if (!removingId) setRemoveTarget(null); }}
        onConfirm={confirmRemove}
      />
    </main>
  );
}

const pageStyle: CSSProperties = { maxWidth: 720, margin: "0 auto", padding: "12px 12px 90px" };
const headerStyle: CSSProperties = { minHeight: 42, display: "grid", gridTemplateColumns: "38px minmax(0, 1fr) auto", alignItems: "center", gap: 8, marginBottom: 10 };
const backLinkStyle: CSSProperties = { width: 36, height: 36, display: "grid", placeItems: "center", color: "#52634e", textDecoration: "none" };
const titleStyle: CSSProperties = { margin: 0, color: "#253725", fontSize: 22, lineHeight: 1.25 };
const guideLinkStyle: CSSProperties = { color: "#4f744d", fontSize: 13, fontWeight: 750, textDecoration: "none" };
const listStyle: CSSProperties = { display: "grid", gap: 8 };
const cardStyle: CSSProperties = { padding: 12, border: "1px solid #e1e8de", borderRadius: 15, background: "#fff" };
const cardHeadingStyle: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 };
const plantNameStyle: CSSProperties = { display: "block", overflow: "hidden", color: "#263726", fontSize: 18, fontWeight: 750, textDecoration: "none", textOverflow: "ellipsis", whiteSpace: "nowrap" };
const categoryStyle: CSSProperties = { marginTop: 3, color: "#738171", fontSize: 13 };
const moreStyle: CSSProperties = { position: "relative" };
const moreSummaryStyle: CSSProperties = { width: 36, height: 36, display: "grid", placeItems: "center", border: "1px solid #e0e7dd", borderRadius: 999, color: "#667462", cursor: "pointer", listStyle: "none" };
const removeButtonStyle: CSSProperties = { position: "absolute", top: 41, right: 0, zIndex: 5, minWidth: 100, minHeight: 42, border: "1px solid #edd7d4", borderRadius: 11, background: "#fff", color: "#b34f45", fontSize: 14, cursor: "pointer" };
const actionsStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8, marginTop: 10 };
const secondaryActionStyle: CSSProperties = { minHeight: 40, display: "grid", placeItems: "center", border: "1px solid #dce5d9", borderRadius: 11, color: "#4f6550", fontSize: 14, fontWeight: 700, textDecoration: "none" };
const primaryActionStyle: CSSProperties = { ...secondaryActionStyle, borderColor: "#5d8558", background: "#5d8558", color: "#fff" };
