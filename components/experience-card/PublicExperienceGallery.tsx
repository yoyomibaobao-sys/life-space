"use client";

import Link from "next/link";
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent,
} from "react";
import UiIcon from "@/components/ui/UiIcon";
import PublicExperiencePlayer from "@/components/experience-card/PublicExperiencePlayer";
import styles from "@/components/experience-card/PublicExperienceFeed.module.css";
import { loadExperienceCard } from "@/lib/experience-cards";
import type {
  ExperienceCardDetail,
  ExperienceCardListItem,
} from "@/lib/experience-card-types";
import { useLanguage } from "@/lib/i18n/useLanguage";
import {
  APP_STATUS_BAR_DARK,
  APP_STATUS_BAR_LIGHT,
  setAppStatusBarTheme,
} from "@/components/StatusBarTheme";

function getPublishedMeta(
  value: string | null | undefined,
  language: "zh" | "en",
  label: string
) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return ` · ${label}${new Intl.DateTimeFormat(
    language === "en" ? "en" : "zh-CN",
    { year: "numeric", month: "2-digit", day: "2-digit" },
  ).format(date)}`;
}

export default function PublicExperienceGallery({
  items,
}: {
  items: ExperienceCardListItem[];
}) {
  const { language, t } = useLanguage();
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  function openPlayback(index: number) {
    setOpenIndex(index);
  }

  function handleCardClick(event: MouseEvent<HTMLElement>, index: number) {
    if ((event.target as HTMLElement).closest("a")) return;
    openPlayback(index);
  }

  function handleCardKeyDown(event: ReactKeyboardEvent<HTMLElement>, index: number) {
    if ((event.target as HTMLElement).closest("a")) return;
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    openPlayback(index);
  }

  return (
    <>
      <section className={styles.gallery} aria-label={t.experience.public_feed}>
        {items.map((item, index) => (
          <article
            key={item.id}
            className={styles.previewCard}
            role="button"
            tabIndex={0}
            aria-label={`${t.experience.open_fullscreen}${item.title}`}
            onClick={(event) => handleCardClick(event, index)}
            onKeyDown={(event) => handleCardKeyDown(event, index)}
          >
            <span className={styles.previewMediaButton} aria-hidden="true">
              <span className={styles.previewMedia}>
              {item.coverUrl ? (
                <img
                  src={item.coverUrl}
                  alt=""
                  loading="lazy"
                  className={styles.previewImage}
                />
              ) : (
                <span className={styles.previewPlaceholder}>
                  <UiIcon name="image" size={23} />
                </span>
              )}
              <span className={styles.previewPlay} aria-hidden="true" />
              </span>
            </span>
            <span className={styles.previewBody}>
              <span className={styles.previewTitle}>{item.title}</span>
              <span className={styles.previewSource}>
                {item.authorName}
                {item.archiveTitle ? ` · ${item.archiveTitle}` : ""}
              </span>
              <span className={styles.previewMeta}>
                {item.source_record_count}{t.experience.record_suffix}
                {getPublishedMeta(item.published_at, language, t.experience.published_on)}
              </span>
              <span className={styles.previewFooter}>
                <span
                  className={styles.previewHelpful}
                  aria-label={`${t.experience.helpful} ${item.helpfulCount}`}
                >
                  <UiIcon name="helpful" size={13} />
                  {item.helpfulCount}
                </span>
                <Link
                  href={`/experience-cards/${item.id}`}
                  className={styles.previewDetails}
                  aria-label={`${t.experience.view_details}：${item.title}`}
                >
                  {t.experience.view_details}
                  <UiIcon name="arrow-right" size={13} />
                </Link>
              </span>
            </span>
          </article>
        ))}
      </section>

      {openIndex !== null ? (
        <ExperienceFullscreenViewer
          items={items}
          initialIndex={openIndex}
          onClose={() => setOpenIndex(null)}
        />
      ) : null}
    </>
  );
}

function ExperienceFullscreenViewer({
  items,
  initialIndex,
  onClose,
}: {
  items: ExperienceCardListItem[];
  initialIndex: number;
  onClose: () => void;
}) {
  const { t } = useLanguage();
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const pushedHistoryRef = useRef(false);
  const [activeIndex, setActiveIndex] = useState(initialIndex);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.dataset.mobileOverlayOpen = "true";
    setAppStatusBarTheme(APP_STATUS_BAR_DARK);

    window.history.pushState(
      { ...(window.history.state || {}), __experienceFullscreen: true },
      "",
      window.location.href,
    );
    pushedHistoryRef.current = true;

    const firstFrame = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const node = scrollerRef.current;
        if (node) node.scrollTop = initialIndex * node.clientHeight;
      });
    });

    function handlePopState() {
      pushedHistoryRef.current = false;
      onClose();
    }

    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") requestClose();
    }

    window.addEventListener("popstate", handlePopState);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(firstFrame);
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
      window.removeEventListener("popstate", handlePopState);
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      delete document.documentElement.dataset.mobileOverlayOpen;
      setAppStatusBarTheme(APP_STATUS_BAR_LIGHT);
    };
    // This overlay owns one temporary browser-history entry while mounted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function requestClose() {
    if (pushedHistoryRef.current && window.history.state?.__experienceFullscreen) {
      window.history.back();
      return;
    }
    onClose();
  }

  function handleScroll() {
    if (frameRef.current !== null) return;
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      const node = scrollerRef.current;
      if (!node || node.clientHeight <= 0) return;
      const nextIndex = Math.max(
        0,
        Math.min(items.length - 1, Math.round(node.scrollTop / node.clientHeight)),
      );
      setActiveIndex(nextIndex);
    });
  }

  return (
    <div
      className={styles.fullscreenOverlay}
      role="dialog"
      aria-modal="true"
      aria-label={t.experience.fullscreen_aria}
      data-mobile-swipe-ignore="true"
    >
      <button
        type="button"
        onClick={requestClose}
        className={styles.fullscreenClose}
        aria-label={t.experience.close_fullscreen}
      >
        <UiIcon name="close" size={21} />
      </button>
      <div ref={scrollerRef} onScroll={handleScroll} className={styles.fullscreenScroller}>
        {items.map((item, index) => (
          <FullscreenExperienceItem
            key={item.id}
            item={item}
            active={index === activeIndex}
            load={Math.abs(index - activeIndex) <= 1}
          />
        ))}
      </div>
    </div>
  );
}

function FullscreenExperienceItem({
  item,
  active,
  load,
}: {
  item: ExperienceCardListItem;
  active: boolean;
  load: boolean;
}) {
  const { t } = useLanguage();
  const [detail, setDetail] = useState<ExperienceCardDetail | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!load || detail || failed) return;
    let cancelled = false;
    void loadExperienceCard(item.id)
      .then((value) => {
        if (!cancelled) {
          setDetail(value);
          setFailed(!value);
        }
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [detail, failed, item.id, load]);

  return (
    <section className={styles.fullscreenItem} aria-label={item.title}>
      {detail ? (
        <PublicExperiencePlayer detail={detail} active={active} fullscreen />
      ) : (
        <div className={styles.fullscreenLoading}>
          {failed ? t.experience.unavailable_title : t.experience.loading_playback}
        </div>
      )}
    </section>
  );
}
