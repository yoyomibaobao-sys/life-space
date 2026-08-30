"use client";

import { Suspense, useCallback, useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import ConfirmDialog from "@/components/ConfirmDialog";
import MobilePageHeader from "@/components/mobile/MobilePageHeader";
import { showToast } from "@/components/Toast";
import UiIcon from "@/components/ui/UiIcon";
import type { PlantInterestRow } from "@/lib/domain-types";
import { buildLoginHref } from "@/lib/auth-return";
import ArchivePlantEmptyState from "@/components/archive-plant/ArchivePlantEmptyState";
import { categoryLabel, plantDisplayName } from "@/lib/archive-plant-shared";
import { useLanguage } from "@/lib/i18n/useLanguage";
import { formatCardDate } from "@/lib/date-time";
import GuideCategoryTabs from "@/components/plant/GuideCategoryTabs";
import { archiveCategoryOptions, getArchiveCategoryLabel, type ArchiveCategory } from "@/lib/archive-categories";
import { getPublicGuideName, getPublicGuideSectionName } from "@/lib/public-guide-library";
import { GUIDE_INTERESTS_CHANGED, setGuideInterest } from "@/lib/guide-interests";

type SavedGuide = {
  id: string;
  targetId: string;
  kind: "plant" | "guide";
  category: ArchiveCategory;
  name: string;
  categoryText: string;
  createdAt: string;
  detailHref: string;
  projectHref: string;
};

type GuideInterestRow = {
  guide_id: string;
  created_at: string;
  guide_entries: {
    id: string;
    category: ArchiveCategory;
    name: string;
    name_en?: string | null;
    guide_sections: { name: string; name_en?: string | null } | null;
  } | null;
};

export default function PlantInterestsPage() {
  return <Suspense><PlantInterestsContent /></Suspense>;
}

function PlantInterestsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { language, t } = useLanguage();
  const [userId, setUserId] = useState("");
  const [interests, setInterests] = useState<PlantInterestRow[]>([]);
  const [guideInterests, setGuideInterests] = useState<GuideInterestRow[]>([]);
  const requestedCategory = searchParams.get("section");
  const activeCategory = archiveCategoryOptions.find((option) => option.value === requestedCategory)?.value || "plant";
  const [loadError, setLoadError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [removeTarget, setRemoveTarget] = useState<SavedGuide | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const loadInterests = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push(buildLoginHref("/archive/interests"));
      return;
    }

    setUserId(user.id);
    const [plantResult, guideResult] = await Promise.all([supabase
      .from("user_plant_interests")
      .select(`
          *,
          plant_species:species_id (
            id, common_name, scientific_name, slug, category, sub_category
          )
        `)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
      supabase.from("user_guide_interests")
        .select("guide_id, created_at, guide_entries:guide_id(id, category, name, name_en, guide_sections:section_id(name, name_en))")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
    ]);
    const { data, error } = plantResult;
    setLoadError(Boolean(error || guideResult.error));
    setGuideInterests((guideResult.data || []) as unknown as GuideInterestRow[]);
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

  function changeCategory(category: ArchiveCategory) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("section", category);
    router.replace(`/archive/interests?${params.toString()}`, { scroll: false });
  }

  const savedItems: SavedGuide[] = [
    ...interests.map((item): SavedGuide => ({
      id: item.id, targetId: item.species_id, kind: "plant", category: "plant",
      name: plantDisplayName(item.plant_species), categoryText: categoryLabel(item.plant_species?.category),
      createdAt: item.created_at || "", detailHref: `/plant/${item.species_id}`, projectHref: `/archive/new?species=${item.species_id}`,
    })),
    ...guideInterests.map((item): SavedGuide => ({
      id: item.guide_id, targetId: item.guide_id, kind: "guide", category: item.guide_entries?.category || "other",
      name: item.guide_entries ? getPublicGuideName(item.guide_entries, language) : (language === "en" ? "Guide unavailable" : "指引暂不可用"),
      categoryText: item.guide_entries?.guide_sections ? getPublicGuideSectionName(item.guide_entries.guide_sections, language) : "",
      createdAt: item.created_at, detailHref: `/plant/guide/${item.guide_id}`,
      projectHref: item.guide_entries ? `/archive/new?category=${item.guide_entries.category}&system_name=${encodeURIComponent(item.guide_entries.name)}` : "",
    })),
  ].filter((item) => item.category === activeCategory);

  async function confirmRemove() {
    if (!userId || !removeTarget || removingId) return;
    setRemovingId(removeTarget.id);
    let error: { message?: string } | null = null;
    if (removeTarget.kind === "guide") {
      try { await setGuideInterest(userId, removeTarget.targetId, false); }
      catch (err) { error = err as { message?: string }; }
    } else {
      const result = await supabase
        .from("user_plant_interests")
        .delete()
        .eq("id", removeTarget.id)
        .eq("user_id", userId);
      error = result.error;
    }
    setRemovingId(null);

    if (error) {
      showToast(t.plant_lists.remove_failed_prefix + error.message);
      return;
    }
    setInterests((items) => items.filter((item) => item.id !== removeTarget.id));
    setGuideInterests((items) => items.filter((item) => item.guide_id !== removeTarget.targetId));
    window.dispatchEvent(new Event(GUIDE_INTERESTS_CHANGED));
    setRemoveTarget(null);
    showToast(t.plant_lists.interest_removed);
  }

  return (
    <>
      <MobilePageHeader
        title={t.plant.my_saved}
        fallbackHref="/plant"
        ariaLabel={t.nav.back}
        right={<Link href="/plant" style={mobileGuideLinkStyle}>{t.plant_lists.guide_browse}</Link>}
      />
      <main style={pageStyle}>
      <header className="mobile-app-desktop-only" style={headerStyle}>
        <Link href="/plant" style={backLinkStyle} aria-label={t.plant.back_to_guide}>
          <UiIcon name="arrow-left" size={18} />
        </Link>
        <h1 style={titleStyle}>{t.plant.my_saved}</h1>
        <Link href="/plant" style={guideLinkStyle}>{t.plant_lists.guide_browse}</Link>
      </header>

      <GuideCategoryTabs value={activeCategory} onChange={changeCategory} />
      {loadError ? <div role="alert" style={{ padding: 10, marginBottom: 10, color: "#a4573f" }}>
        {language === "en" ? "Some saved guides could not be loaded." : "部分收藏暂时无法读取。"}
        <button type="button" onClick={() => void loadInterests()}>{language === "en" ? "Retry" : "重试"}</button>
      </div> : null}
      {loading ? <div style={{ padding: 20 }}>{t.loading}</div> : savedItems.length === 0 ? (
        <ArchivePlantEmptyState
          title={language === "en" ? "No saved guides in this category" : "这一类还没有收藏"}
          description={getArchiveCategoryLabel(activeCategory, language)}
          href={`/plant?section=${activeCategory}`}
          label={t.plant_lists.guide_browse}
        />
      ) : (
        <section style={listStyle} aria-label={t.plant.my_saved}>
          {savedItems.map((item) => {
            return (
              <article key={item.id} style={cardStyle}>
                <div style={cardHeadingStyle}>
                  <div style={{ minWidth: 0 }}>
                    <Link href={item.detailHref} style={plantNameStyle}>
                      {item.name}
                    </Link>
                    <div style={categoryStyle}>{item.categoryText}</div>
                    {item.createdAt ? (
                      <div style={savedDateStyle}>
                        {formatCardDate(item.createdAt)}
                      </div>
                    ) : null}
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
                  <Link href={item.detailHref} style={secondaryActionStyle}>
                    {t.plant_lists.view_guide}
                  </Link>
                  {item.projectHref ? <Link href={item.projectHref} style={primaryActionStyle}>
                    {t.plant.detail.new_project}
                  </Link> : null}
                </div>
              </article>
            );
          })}
        </section>
      )}

      <ConfirmDialog
        open={Boolean(removeTarget)}
        title={t.plant_lists.remove_interest_title}
        message={`${t.plant_lists.remove_interest_prefix}${removeTarget?.name || ""}${t.plant_lists.remove_interest_suffix}`}
        confirmText={removingId ? t.plant_lists.removing : t.plant_lists.remove}
        cancelText={t.cancel}
        danger
        onClose={() => { if (!removingId) setRemoveTarget(null); }}
        onConfirm={confirmRemove}
      />
      </main>
    </>
  );
}

const pageStyle: CSSProperties = { maxWidth: 720, margin: "0 auto", padding: "12px 12px 90px" };
const headerStyle: CSSProperties = { minHeight: 42, display: "grid", gridTemplateColumns: "38px minmax(0, 1fr) auto", alignItems: "center", gap: 8, marginBottom: 10 };
const backLinkStyle: CSSProperties = { width: 36, height: 36, display: "grid", placeItems: "center", color: "#52634e", textDecoration: "none" };
const titleStyle: CSSProperties = { margin: 0, color: "#253725", fontSize: 22, lineHeight: 1.25 };
const guideLinkStyle: CSSProperties = { color: "#4f744d", fontSize: 13, fontWeight: 750, textDecoration: "none" };
const mobileGuideLinkStyle: CSSProperties = { ...guideLinkStyle, maxWidth: 92, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };
const listStyle: CSSProperties = { display: "grid", gap: 8 };
const cardStyle: CSSProperties = { padding: 12, border: "1px solid #e1e8de", borderRadius: 15, background: "#fff" };
const cardHeadingStyle: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 };
const plantNameStyle: CSSProperties = { display: "block", overflow: "hidden", color: "#263726", fontSize: 18, fontWeight: 750, textDecoration: "none", textOverflow: "ellipsis", whiteSpace: "nowrap" };
const categoryStyle: CSSProperties = { marginTop: 3, color: "#738171", fontSize: 13 };
const savedDateStyle: CSSProperties = { marginTop: 3, color: "#879184", fontSize: 12.5 };
const moreStyle: CSSProperties = { position: "relative" };
const moreSummaryStyle: CSSProperties = { width: 36, height: 36, display: "grid", placeItems: "center", border: "1px solid #e0e7dd", borderRadius: 999, color: "#667462", cursor: "pointer", listStyle: "none" };
const removeButtonStyle: CSSProperties = { position: "absolute", top: 41, right: 0, zIndex: 5, minWidth: 100, minHeight: 42, border: "1px solid #edd7d4", borderRadius: 11, background: "#fff", color: "#b34f45", fontSize: 14, cursor: "pointer" };
const actionsStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8, marginTop: 10 };
const secondaryActionStyle: CSSProperties = { minHeight: 40, display: "grid", placeItems: "center", border: "1px solid #dce5d9", borderRadius: 11, color: "#4f6550", fontSize: 14, fontWeight: 700, textDecoration: "none" };
const primaryActionStyle: CSSProperties = { ...secondaryActionStyle, borderColor: "#5d8558", background: "#5d8558", color: "#fff" };
