"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import PublicExperiencePlayer from "@/components/experience-card/PublicExperiencePlayer";
import { loadExperienceCard } from "@/lib/experience-cards";
import type { ExperienceCardDetail } from "@/lib/experience-card-types";
import { useLanguage } from "@/lib/i18n/useLanguage";
import feedStyles from "@/components/experience-card/PublicExperienceFeed.module.css";

export default function PublicExperienceFeedItem({ cardId }: { cardId: string }) {
  const { t } = useLanguage();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [detail, setDetail] = useState<ExperienceCardDetail | null>(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void loadExperienceCard(cardId).then((value) => {
      if (!cancelled) setDetail(value);
    });
    return () => {
      cancelled = true;
    };
  }, [cardId]);

  useEffect(() => {
    const node = rootRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        setActive(entries.some((entry) => entry.isIntersecting && entry.intersectionRatio >= 0.55));
      },
      { threshold: [0.2, 0.55, 0.8] }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={rootRef} className={feedStyles.item}>
      {detail ? (
        <PublicExperiencePlayer detail={detail} active={active} />
      ) : (
        <div style={loadingStyle}>{t.experience.loading_playback}</div>
      )}
    </div>
  );
}

const loadingStyle: CSSProperties = {
  minHeight: 320,
  display: "grid",
  placeItems: "center",
  color: "#7b8777",
  fontSize: 13,
};
