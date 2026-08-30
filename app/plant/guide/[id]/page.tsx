"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import ExperienceCardListCard from "@/components/experience-card/ExperienceCardListCard";
import MobilePageHeader from "@/components/mobile/MobilePageHeader";
import PlantRelatedArchives from "@/components/plant-detail/PlantRelatedArchives";
import UiIcon from "@/components/ui/UiIcon";
import {
  getArchiveCategoryIcon,
  getArchiveCategoryLabel,
} from "@/lib/archive-categories";
import { buildLoginHref } from "@/lib/auth-return";
import type {
  ExperienceCardListItem,
  ExperienceCardRow,
} from "@/lib/experience-card-types";
import { hydrateExperienceCardListItems } from "@/lib/experience-cards";
import { useLanguage } from "@/lib/i18n/useLanguage";
import { resolveMediaDisplayPairs } from "@/lib/media-urls";
import {
  canAccessMembershipGuidance,
  normalizeMembershipRpcResult,
} from "@/lib/membership";
import type { PlantRelatedArchiveItem } from "@/lib/plant-detail-types";
import {
  buildPublicGuideContent,
  getPublicGuideName,
  getPublicGuideSectionName,
  getPublicGuideSummary,
  publicGuideCopy,
  type PublicGuideEntry,
  type PublicGuideLanguage,
  type PublicGuideSection,
} from "@/lib/public-guide-library";
import { supabase } from "@/lib/supabase";
import styles from "./page.module.css";

type GuideTab = "guide" | "experience" | "projects";

type GuideArchiveRow = {
  id: string;
  user_id?: string | null;
  title?: string | null;
  category?: string | null;
  system_name?: string | null;
  species_id?: string | null;
  species_name_snapshot?: string | null;
  is_public?: boolean | null;
  status?: string | null;
  ended_at?: string | null;
  help_status?: string | null;
  cover_image_url?: string | null;
  cover_image_path?: string | null;
  cover_thumb_path?: string | null;
  created_at?: string | null;
};

type GuideRecordRow = {
  id: string;
  archive_id: string;
  note?: string | null;
  record_time?: string | null;
  primary_image_url?: string | null;
  visibility?: string | null;
  created_at?: string | null;
};

type GuideMediaRow = {
  record_id?: string | null;
  url?: string | null;
  storage_path?: string | null;
  thumb_path?: string | null;
};

type GuideProfileRow = {
  id: string;
  username?: string | null;
};

const RELATED_LIMIT = 24;

function uniqueRows<T extends { id: string }>(rows: T[]) {
  return Array.from(new Map(rows.map((row) => [row.id, row])).values());
}

async function hydrateGuideArchives(
  rows: GuideArchiveRow[],
  currentUserId: string | null,
): Promise<PlantRelatedArchiveItem[]> {
  if (rows.length === 0) return [];

  const archiveIds = rows.map((row) => row.id);
  const ownerIds = Array.from(
    new Set(rows.map((row) => row.user_id).filter((id): id is string => Boolean(id))),
  );
  const [{ data: recordData }, { data: profileData }] = await Promise.all([
    supabase
      .from("records")
      .select(
        "id, archive_id, note, record_time, primary_image_url, visibility, created_at",
      )
      .in("archive_id", archiveIds)
      .order("record_time", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false, nullsFirst: false }),
    ownerIds.length > 0
      ? supabase.from("public_profiles").select("id, username").in("id", ownerIds)
      : Promise.resolve({ data: [] as GuideProfileRow[] }),
  ]);

  const archiveById = new Map(rows.map((row) => [row.id, row]));
  const records = ((recordData || []) as GuideRecordRow[]).filter((record) => {
    const archive = archiveById.get(record.archive_id);
    return archive?.user_id === currentUserId || record.visibility === "public";
  });
  const recordCountByArchive = new Map<string, number>();
  const latestRecordByArchive = new Map<string, GuideRecordRow>();

  records.forEach((record) => {
    recordCountByArchive.set(
      record.archive_id,
      (recordCountByArchive.get(record.archive_id) || 0) + 1,
    );
    if (!latestRecordByArchive.has(record.archive_id)) {
      latestRecordByArchive.set(record.archive_id, record);
    }
  });

  const latestRecordIds = Array.from(latestRecordByArchive.values()).map(
    (record) => record.id,
  );
  const { data: mediaData } = latestRecordIds.length
    ? await supabase
        .from("media")
        .select("record_id, url, storage_path, thumb_path, sort_order, created_at")
        .in("record_id", latestRecordIds)
        .eq("type", "image")
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true })
    : { data: [] as GuideMediaRow[] };
  const firstMediaByRecord = new Map<string, GuideMediaRow>();
  ((mediaData || []) as GuideMediaRow[]).forEach((media) => {
    if (media.record_id && !firstMediaByRecord.has(media.record_id)) {
      firstMediaByRecord.set(media.record_id, media);
    }
  });

  const profiles = (profileData || []) as GuideProfileRow[];
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
  const baseItems = rows.map((row) => {
    const latestRecord = latestRecordByArchive.get(row.id);
    const latestMedia = latestRecord
      ? firstMediaByRecord.get(latestRecord.id)
      : null;

    return {
      archive_id: row.id,
      user_id: row.user_id,
      archive_title: row.title,
      system_name: row.system_name,
      species_id: row.species_id,
      species_name_snapshot: row.species_name_snapshot,
      archive_is_public: row.is_public,
      is_own_archive: Boolean(currentUserId && row.user_id === currentUserId),
      archive_status: row.status,
      ended_at: row.ended_at,
      archive_help_status: row.help_status,
      cover_image_url: row.cover_image_url,
      cover_image_path: row.cover_image_path,
      cover_thumb_path: row.cover_thumb_path,
      username: row.user_id ? profileById.get(row.user_id)?.username || null : null,
      public_record_count: recordCountByArchive.get(row.id) || 0,
      last_public_record_time: latestRecord?.record_time || null,
      last_public_record_note: latestRecord?.note || null,
      last_public_record_image_url:
        latestRecord?.primary_image_url || latestMedia?.url || null,
      last_public_record_image_path: latestMedia?.storage_path || null,
      last_public_record_thumb_path: latestMedia?.thumb_path || null,
    } satisfies PlantRelatedArchiveItem;
  });

  const displayPairs = await resolveMediaDisplayPairs(supabase, [
    ...baseItems.map((item) => ({
      url: item.cover_image_url,
      path: item.cover_image_path,
      thumb_path: item.cover_thumb_path,
    })),
    ...baseItems.map((item) => ({
      url: item.last_public_record_image_url,
      path: item.last_public_record_image_path,
      thumb_path: item.last_public_record_thumb_path,
    })),
  ]);
  const itemCount = baseItems.length;

  return baseItems.map((item, index) => ({
    ...item,
    display_cover_image_url:
      displayPairs[index]?.display_thumb_url ||
      displayPairs[index]?.display_url ||
      null,
    display_last_public_record_image_url:
      displayPairs[itemCount + index]?.display_thumb_url ||
      displayPairs[itemCount + index]?.display_url ||
      null,
  }));
}

async function loadRelatedGuideContent(
  entry: PublicGuideEntry,
  currentUserId: string | null,
  language: PublicGuideLanguage,
) {
  const archiveSelect = [
    "id",
    "user_id",
    "title",
    "category",
    "system_name",
    "species_id",
    "species_name_snapshot",
    "is_public",
    "status",
    "ended_at",
    "help_status",
    "cover_image_url",
    "cover_image_path",
    "cover_thumb_path",
    "created_at",
  ].join(", ");
  const [{ data: publicArchiveData }, ownArchiveResult] = await Promise.all([
    supabase
      .from("archives")
      .select(archiveSelect)
      .eq("category", entry.category)
      .eq("system_name", entry.name)
      .eq("is_public", true)
      .order("last_record_time", { ascending: false, nullsFirst: false })
      .limit(RELATED_LIMIT),
    currentUserId
      ? supabase
          .from("archives")
          .select(archiveSelect)
          .eq("user_id", currentUserId)
          .eq("category", entry.category)
          .eq("system_name", entry.name)
          .order("last_record_time", { ascending: false, nullsFirst: false })
          .limit(RELATED_LIMIT)
      : Promise.resolve({ data: [] as GuideArchiveRow[] }),
  ]);
  const archiveRows = uniqueRows([
    ...((ownArchiveResult.data || []) as unknown as GuideArchiveRow[]),
    ...((publicArchiveData || []) as unknown as GuideArchiveRow[]),
  ]).slice(0, RELATED_LIMIT);
  const relatedArchives = await hydrateGuideArchives(archiveRows, currentUserId);

  if (archiveRows.length === 0) {
    return { relatedArchives, experienceCards: [] as ExperienceCardListItem[] };
  }

  const { data: cardData } = await supabase
    .from("experience_cards")
    .select("*")
    .in(
      "archive_id",
      archiveRows.map((archive) => archive.id),
    )
    .eq("status", "published")
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(RELATED_LIMIT);
  const cardRows = (cardData || []) as ExperienceCardRow[];
  const publicStates = await Promise.all(
    cardRows.map(async (card) => {
      const { data } = await supabase.rpc("is_experience_card_public", {
        p_card_id: card.id,
      });
      return Boolean(Array.isArray(data) ? data[0] : data);
    }),
  );
  const publicCards = cardRows.filter((_card, index) => publicStates[index]);

  return {
    relatedArchives,
    experienceCards: await hydrateExperienceCardListItems(publicCards, language),
  };
}

export default function PublicGuideDetailPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const { language, t } = useLanguage();
  const copy = publicGuideCopy[language];
  const [entry, setEntry] = useState<PublicGuideEntry | null>(null);
  const [section, setSection] = useState<PublicGuideSection | null>(null);
  const [activeTab, setActiveTab] = useState<GuideTab>("guide");
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [hasCloudAccess, setHasCloudAccess] = useState(false);
  const [relatedArchives, setRelatedArchives] = useState<
    PlantRelatedArchiveItem[]
  >([]);
  const [experienceCards, setExperienceCards] = useState<
    ExperienceCardListItem[]
  >([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const membershipResult = user
        ? await supabase.rpc("get_my_membership")
        : { data: null, error: null };
      const membership = membershipResult.error
        ? null
        : normalizeMembershipRpcResult(membershipResult.data);
      const canReadFullGuide = canAccessMembershipGuidance(membership);

      const extended = await supabase
        .from("guide_entries")
        .select(
          "id, category, name, name_en, source, section_id, summary, summary_en, content_template, content, content_en, sort_order, is_active",
        )
        .eq("id", params.id)
        .eq("is_active", true)
        .maybeSingle();

      let row = extended.data as PublicGuideEntry | null;
      let error = extended.error;

      if (error) {
        const fallback = await supabase
          .from("guide_entries")
          .select("id, category, name, source")
          .eq("id", params.id)
          .maybeSingle();
        row = fallback.data as PublicGuideEntry | null;
        error = fallback.error;
      }

      let sectionRow: PublicGuideSection | null = null;
      if (!error && row?.section_id) {
        const sectionResult = await supabase
          .from("guide_sections")
          .select(
            "id, category, slug, name, name_en, summary, summary_en, sort_order",
          )
          .eq("id", row.section_id)
          .maybeSingle();
        if (!sectionResult.error) {
          sectionRow = sectionResult.data as PublicGuideSection | null;
        }
      }

      let related: Awaited<ReturnType<typeof loadRelatedGuideContent>> = {
        relatedArchives: [],
        experienceCards: [],
      };
      if (!error && row && canReadFullGuide) {
        related = await loadRelatedGuideContent(row, user?.id || null, language);
      }

      if (!cancelled) {
        if (error) console.warn("load public guide detail failed:", error);
        setEntry(error ? null : row);
        setSection(sectionRow);
        setIsSignedIn(Boolean(user));
        setHasCloudAccess(canReadFullGuide);
        setRelatedArchives(related.relatedArchives);
        setExperienceCards(related.experienceCards);
        setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [language, params.id]);

  const name = entry ? getPublicGuideName(entry, language) : copy.publicLibrary;
  const summary = entry ? getPublicGuideSummary(entry, language) : "";
  const content = useMemo(
    () => (entry ? buildPublicGuideContent(entry, language) : null),
    [entry, language],
  );
  const fallbackCategory = entry?.category || searchParams.get("from") || "plant";
  const fallbackHref = `/plant?section=${encodeURIComponent(fallbackCategory)}`;
  const returnHref = `/plant/guide/${encodeURIComponent(params.id)}`;
  const rawNewProjectHref = entry
    ? `/archive/new?category=${encodeURIComponent(entry.category)}&system_name=${encodeURIComponent(entry.name)}`
    : "/archive/new";
  const newProjectHref = isSignedIn
    ? rawNewProjectHref
    : buildLoginHref(rawNewProjectHref);

  if (loading) {
    return (
      <>
        <MobilePageHeader
          title={copy.publicLibrary}
          fallbackHref={fallbackHref}
          ariaLabel={t.nav.back}
        />
        <main className={styles.page}>
          <div className={styles.stateCard}>{copy.loading}</div>
        </main>
      </>
    );
  }

  if (!entry || !content) {
    return (
      <>
        <MobilePageHeader
          title={copy.publicLibrary}
          fallbackHref={fallbackHref}
          ariaLabel={t.nav.back}
        />
        <main className={styles.page}>
          <Link
            href={fallbackHref}
            className={`${styles.desktopBack} mobile-app-desktop-only`}
          >
            <UiIcon name="arrow-left" size={15} /> {copy.back}
          </Link>
          <div className={styles.stateCard}>{copy.notFound}</div>
        </main>
      </>
    );
  }

  const tabs: Array<{ key: GuideTab; label: string; count?: number }> = [
    { key: "guide", label: copy.overviewPractice },
    {
      key: "experience",
      label: copy.experienceCards,
      count: hasCloudAccess ? experienceCards.length : undefined,
    },
    {
      key: "projects",
      label: copy.relatedProjects,
      count: hasCloudAccess ? relatedArchives.length : undefined,
    },
  ];

  return (
    <>
      <MobilePageHeader
        title={name}
        titleText={name}
        fallbackHref={fallbackHref}
        ariaLabel={t.nav.back}
        right={
          <Link href={newProjectHref} className={styles.mobileNewProject}>
            {copy.newProject}
          </Link>
        }
      />

      <main className={styles.page}>
        <div className={`${styles.desktopTopRow} mobile-app-desktop-only`}>
          <Link href={fallbackHref} className={styles.desktopBack}>
            <UiIcon name="arrow-left" size={15} /> {copy.back}
          </Link>
          <Link href={newProjectHref} className={styles.desktopNewProject}>
            {copy.newProject}
          </Link>
        </div>

        <article className={styles.hero}>
          <div className={styles.breadcrumbs}>
            <span className={styles.categoryBadge}>
              <UiIcon name={getArchiveCategoryIcon(entry.category)} size={15} />
              {getArchiveCategoryLabel(entry.category, language)}
            </span>
            {section ? (
              <>
                <UiIcon name="arrow-right" size={13} />
                <span>{getPublicGuideSectionName(section, language)}</span>
              </>
            ) : null}
          </div>

          <div className={styles.heroTitleRow}>
            <div>
              <h1>{name}</h1>
              <div className={styles.sourceLabel}>
                {entry.source === "preset" ? copy.preset : copy.approved}
              </div>
            </div>
          </div>

          {isSignedIn ? (
            <p className={styles.summary}>{summary || copy.contentPending}</p>
          ) : (
            <p className={styles.summary}>
              <Link href={buildLoginHref(returnHref)}>
                {copy.registerForOverview}
              </Link>
            </p>
          )}
          {hasCloudAccess ? (
            <p className={styles.frameworkNote}>{copy.frameworkNote}</p>
          ) : null}
        </article>

        <nav className={styles.detailTabs} aria-label={copy.publicLibrary}>
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              aria-current={activeTab === tab.key ? "page" : undefined}
              className={activeTab === tab.key ? styles.activeDetailTab : undefined}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
              {tab.count ? ` (${tab.count})` : ""}
            </button>
          ))}
        </nav>

        {activeTab === "guide" ? (
          <>
            {isSignedIn && content.parameters.length > 0 ? (
              <section className={styles.sectionCard}>
                <h2>{copy.keyParameters}</h2>
                <div className={styles.parameterGrid}>
                  {content.parameters
                    .slice(0, hasCloudAccess ? undefined : 3)
                    .map((item) => (
                      <div
                        key={`${item.label}-${item.value}`}
                        className={styles.parameterCard}
                      >
                        <span>{item.label}</span>
                        <strong>{item.value}</strong>
                      </div>
                    ))}
                </div>
              </section>
            ) : null}

            {!hasCloudAccess ? (
              <AccessNotice signedIn={isSignedIn} returnHref={returnHref} />
            ) : (
              <>
                {content.cycle ? (
                  <section className={styles.sectionCard}>
                    <div className={styles.sectionTitleRow}>
                      <h2>{copy.referenceCycle}</h2>
                      <strong>{content.cycle.total}</strong>
                    </div>
                    <div className={styles.cycleTrack}>
                      {content.cycle.stages.map((stage, index) => (
                        <div
                          key={`${stage.label}-${stage.duration}`}
                          className={styles.cycleStage}
                        >
                          <span className={styles.cycleIndex}>{index + 1}</span>
                          <strong>{stage.label}</strong>
                          <span>{stage.duration}</span>
                          {stage.note ? <small>{stage.note}</small> : null}
                        </div>
                      ))}
                    </div>
                    {content.cycle.note ? (
                      <p className={styles.cycleNote}>{content.cycle.note}</p>
                    ) : null}
                  </section>
                ) : null}

                <div className={styles.contentSections}>
                  {content.sections.map((contentSection) => (
                    <section
                      key={contentSection.title}
                      className={styles.sectionCard}
                    >
                      <h2>{contentSection.title}</h2>
                      {contentSection.intro ? (
                        <p className={styles.sectionIntro}>
                          {contentSection.intro}
                        </p>
                      ) : null}
                      <ol className={styles.guideList}>
                        {contentSection.items.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ol>
                    </section>
                  ))}
                </div>

                {content.cautions.length > 0 ? (
                  <section
                    className={`${styles.sectionCard} ${styles.cautionCard}`}
                  >
                    <h2>{copy.cautions}</h2>
                    <ul className={styles.cautionList}>
                      {content.cautions.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </section>
                ) : null}
              </>
            )}
          </>
        ) : activeTab === "experience" ? (
          hasCloudAccess ? (
            experienceCards.length > 0 ? (
              <section className={styles.relatedList}>
                {experienceCards.map((card) => (
                  <ExperienceCardListCard
                    key={card.id}
                    item={card}
                    dateValue={card.published_at}
                    showAuthor
                  />
                ))}
              </section>
            ) : (
              <div className={styles.stateCard}>{copy.noExperienceCards}</div>
            )
          ) : (
            <AccessNotice signedIn={isSignedIn} returnHref={returnHref} />
          )
        ) : hasCloudAccess ? (
          relatedArchives.length > 0 ? (
            <PlantRelatedArchives archives={relatedArchives} />
          ) : (
            <div className={styles.stateCard}>{copy.noRelatedProjects}</div>
          )
        ) : (
          <AccessNotice signedIn={isSignedIn} returnHref={returnHref} />
        )}

        <Link href={newProjectHref} className={styles.bottomAction}>
          {copy.newProject}
          <UiIcon name="arrow-right" size={16} />
        </Link>
      </main>
    </>
  );
}

function AccessNotice({
  signedIn,
  returnHref,
}: {
  signedIn: boolean;
  returnHref: string;
}) {
  const { language } = useLanguage();
  const copy = publicGuideCopy[language];
  const href = signedIn ? "/membership" : buildLoginHref(returnHref);

  return (
    <section className={styles.accessNotice}>
      <span>{signedIn ? copy.membershipForFull : copy.registerForOverview}</span>
      <Link href={href}>
        {signedIn ? copy.learnMembership : copy.registerForOverview}
      </Link>
    </section>
  );
}
