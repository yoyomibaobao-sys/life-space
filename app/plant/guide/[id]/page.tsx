"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import MobilePageHeader from "@/components/mobile/MobilePageHeader";
import UiIcon from "@/components/ui/UiIcon";
import {
  getArchiveCategoryIcon,
  getArchiveCategoryLabel,
} from "@/lib/archive-categories";
import { useLanguage } from "@/lib/i18n/useLanguage";
import {
  buildPublicGuideContent,
  getPublicGuideName,
  getPublicGuideSectionName,
  getPublicGuideSummary,
  publicGuideCopy,
  type PublicGuideEntry,
  type PublicGuideSection,
} from "@/lib/public-guide-library";
import { supabase } from "@/lib/supabase";
import styles from "./page.module.css";

export default function PublicGuideDetailPage() {
  const params = useParams<{ id: string }>();
  const { language, t } = useLanguage();
  const copy = publicGuideCopy[language];
  const [entry, setEntry] = useState<PublicGuideEntry | null>(null);
  const [section, setSection] = useState<PublicGuideSection | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);

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
          .select("id, category, slug, name, name_en, summary, summary_en, sort_order")
          .eq("id", row.section_id)
          .maybeSingle();
        if (!sectionResult.error) {
          sectionRow = sectionResult.data as PublicGuideSection | null;
        }
      }

      if (!cancelled) {
        if (error) console.warn("load public guide detail failed:", error);
        setEntry(error ? null : row);
        setSection(sectionRow);
        setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  const name = entry ? getPublicGuideName(entry, language) : copy.publicLibrary;
  const summary = entry ? getPublicGuideSummary(entry, language) : "";
  const content = useMemo(
    () => (entry ? buildPublicGuideContent(entry, language) : null),
    [entry, language],
  );
  const newProjectHref = entry
    ? `/archive/new?category=${encodeURIComponent(entry.category)}&system_name=${encodeURIComponent(entry.name)}`
    : "/archive/new";

  if (loading) {
    return (
      <>
        <MobilePageHeader
          title={copy.publicLibrary}
          fallbackHref="/plant"
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
          fallbackHref="/plant"
          ariaLabel={t.nav.back}
        />
        <main className={styles.page}>
          <Link href="/plant" className={`${styles.desktopBack} mobile-app-desktop-only`}>
            <UiIcon name="arrow-left" size={15} /> {copy.back}
          </Link>
          <div className={styles.stateCard}>{copy.notFound}</div>
        </main>
      </>
    );
  }

  return (
    <>
      <MobilePageHeader
        title={name}
        titleText={name}
        fallbackHref="/plant"
        ariaLabel={t.nav.back}
        right={
          <Link href={newProjectHref} className={styles.mobileNewProject}>
            {copy.newProject}
          </Link>
        }
      />

      <main className={styles.page}>
        <div className={`${styles.desktopTopRow} mobile-app-desktop-only`}>
          <Link href="/plant" className={styles.desktopBack}>
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

          <p className={styles.summary}>{summary || copy.contentPending}</p>
          <p className={styles.frameworkNote}>{copy.frameworkNote}</p>
        </article>

        {content.parameters.length > 0 ? (
          <section className={styles.sectionCard}>
            <h2>{copy.keyParameters}</h2>
            <div className={styles.parameterGrid}>
              {content.parameters.map((item) => (
                <div key={`${item.label}-${item.value}`} className={styles.parameterCard}>
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {content.cycle ? (
          <section className={styles.sectionCard}>
            <div className={styles.sectionTitleRow}>
              <h2>{copy.referenceCycle}</h2>
              <strong>{content.cycle.total}</strong>
            </div>
            <div className={styles.cycleTrack}>
              {content.cycle.stages.map((stage, index) => (
                <div key={`${stage.label}-${stage.duration}`} className={styles.cycleStage}>
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
            <section key={contentSection.title} className={styles.sectionCard}>
              <h2>{contentSection.title}</h2>
              {contentSection.intro ? (
                <p className={styles.sectionIntro}>{contentSection.intro}</p>
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
          <section className={`${styles.sectionCard} ${styles.cautionCard}`}>
            <h2>{copy.cautions}</h2>
            <ul className={styles.cautionList}>
              {content.cautions.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        ) : null}

        <Link href={newProjectHref} className={styles.bottomAction}>
          {copy.newProject}
          <UiIcon name="arrow-right" size={16} />
        </Link>
      </main>
    </>
  );
}
