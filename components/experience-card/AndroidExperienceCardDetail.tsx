"use client";

import { useEffect, useState, type CSSProperties } from "react";
import MobilePageHeaderView from "@/components/mobile/MobilePageHeaderView";
import PublicExperiencePlayer from "@/components/experience-card/PublicExperiencePlayer";
import { ExperienceFullscreenDetail } from "@/components/experience-card/PublicExperienceGallery";
import ExperienceCardTimeline from "@/components/experience-card/ExperienceCardTimeline";
import ExperienceCardInteractions from "@/components/experience-card/ExperienceCardInteractions";
import { loadExperienceCard } from "@/lib/experience-cards";
import type { ExperienceCardDetail } from "@/lib/experience-card-types";
import { supabase } from "@/lib/supabase";
import { useLanguage } from "@/lib/i18n/useLanguage";

export default function AndroidExperienceCardDetail({
  cardId,
  onBack,
}: {
  cardId: string;
  onBack: () => void;
}) {
  const { language } = useLanguage();
  const [detail, setDetail] = useState<ExperienceCardDetail | null>(null);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    let active = true;
    void Promise.all([
      loadExperienceCard(cardId),
      supabase.auth.getUser(),
    ]).then(([value, auth]) => {
      if (!active) return;
      setDetail(value);
      setViewerId(auth.data.user?.id || null);
      setFailed(!value);
      setLoading(false);
    }).catch(() => {
      if (!active) return;
      setDetail(null);
      setFailed(true);
      setLoading(false);
    });
    return () => { active = false; };
  }, [cardId]);

  const title = language === "zh" ? "经验卡详情" : "Experience details";

  return (
    <div data-android-shell-page="experience-detail">
      <MobilePageHeaderView
        title={title}
        titleText={title}
        showBack
        ariaLabel={language === "zh" ? "返回经验" : "Back to experience"}
        onBack={onBack}
      />
      {loading ? (
        <section style={stateStyle}>{language === "zh" ? "正在加载…" : "Loading…"}</section>
      ) : failed || !detail ? (
        <section style={stateStyle}>{language === "zh" ? "这张经验卡暂时无法加载。" : "This experience card is unavailable."}</section>
      ) : (
        <main style={pageStyle}>
          <section style={heroStyle}>
            <h1 style={titleStyle}>{detail.card.title}</h1>
            <div style={metaStyle}>
              {detail.author?.username || (language === "zh" ? "用户" : "User")}
              {detail.archive.title ? ` · ${detail.archive.title}` : ""}
            </div>
            {detail.card.description ? <p style={descriptionStyle}>{detail.card.description}</p> : null}
          </section>

          <div style={playerWrapStyle}>
            <PublicExperiencePlayer detail={detail} active />
            <button
              type="button"
              style={fullscreenButtonStyle}
              onClick={() => setFullscreen(true)}
            >
              {language === "zh" ? "全屏" : "Full screen"}
            </button>
          </div>

          <section style={sectionStyle}>
            <h2 style={sectionTitleStyle}>{language === "zh" ? "记录过程" : "Timeline"}</h2>
            <ExperienceCardTimeline archive={detail.archive} records={detail.records} />
          </section>

          <ExperienceCardInteractions
            cardId={detail.card.id}
            cardOwnerId={detail.card.user_id}
            currentUserId={viewerId}
            isPublic={detail.isPubliclyAvailable}
          />
        </main>
      )}
      {fullscreen && detail ? (
        <ExperienceFullscreenDetail detail={detail} onClose={() => setFullscreen(false)} />
      ) : null}
    </div>
  );
}

const pageStyle: CSSProperties = {
  padding: "10px 12px calc(84px + var(--app-safe-area-bottom, 0px))",
  background: "#f6f8f3",
  minHeight: "100vh",
};

const stateStyle: CSSProperties = {
  margin: 14,
  padding: 18,
  borderRadius: 15,
  background: "#fff",
  color: "#667163",
  textAlign: "center",
};

const heroStyle: CSSProperties = {
  marginBottom: 12,
  padding: "14px 14px 12px",
  border: "1px solid #e3eadf",
  borderRadius: 16,
  background: "#fff",
};

const titleStyle: CSSProperties = {
  margin: 0,
  color: "#263826",
  fontSize: 20,
  lineHeight: 1.35,
  fontWeight: 850,
};

const metaStyle: CSSProperties = {
  marginTop: 5,
  color: "#758070",
  fontSize: 13,
};

const descriptionStyle: CSSProperties = {
  margin: "10px 0 0",
  color: "#40503d",
  fontSize: 14,
  lineHeight: 1.65,
  whiteSpace: "pre-wrap",
};

const sectionStyle: CSSProperties = {
  marginTop: 12,
  padding: 14,
  border: "1px solid #e3eadf",
  borderRadius: 16,
  background: "#fff",
};

const sectionTitleStyle: CSSProperties = {
  margin: "0 0 12px",
  color: "#2f422e",
  fontSize: 16,
  fontWeight: 850,
};

const playerWrapStyle: CSSProperties = {
  position: "relative",
};

const fullscreenButtonStyle: CSSProperties = {
  position: "absolute",
  right: 10,
  bottom: 10,
  zIndex: 6,
  minHeight: 34,
  padding: "0 12px",
  border: "1px solid rgba(255,255,255,.45)",
  borderRadius: 999,
  background: "rgba(12,18,12,.62)",
  color: "#fff",
  fontSize: 13,
  fontWeight: 750,
};
