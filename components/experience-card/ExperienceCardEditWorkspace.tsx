"use client";

import Link from "next/link";
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
} from "react";
import ExperienceCardEditor from "@/components/experience-card/ExperienceCardEditor";
import ExperienceCardVideoPanel from "@/components/experience-card/ExperienceCardVideoPanel";
import UiIcon from "@/components/ui/UiIcon";
import { loadExperienceCard } from "@/lib/experience-cards";
import type { ExperienceCardDetail } from "@/lib/experience-card-types";

export default function ExperienceCardEditWorkspace({
  cardId,
}: {
  cardId: string;
}) {
  const [detail, setDetail] = useState<ExperienceCardDetail | null>(null);
  const [previewLoading, setPreviewLoading] = useState(true);
  const [previewError, setPreviewError] = useState("");
  const [dirty, setDirty] = useState(false);
  const [editorRevision, setEditorRevision] = useState(0);
  const [previewRevision, setPreviewRevision] = useState(0);
  const [savedNotice, setSavedNotice] = useState("");
  const previewRef = useRef<HTMLElement | null>(null);

  async function reloadPreview() {
    setPreviewLoading(true);
    setPreviewError("");
    try {
      const nextDetail = await loadExperienceCard(cardId);
      if (!nextDetail) {
        setPreviewError("经验卡当前不可读取，请返回详情页重试。");
        setDetail(null);
        return;
      }
      setDetail(nextDetail);
      setPreviewRevision((value) => value + 1);
    } catch {
      setPreviewError("预览读取失败，请稍后重试。");
    } finally {
      setPreviewLoading(false);
    }
  }

  useEffect(() => {
    void reloadPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardId]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [dirty]);

  function confirmLeave(event: MouseEvent<HTMLAnchorElement>) {
    if (!dirty || window.confirm("修改尚未保存，确定离开吗？")) return;
    event.preventDefault();
  }

  async function handleSaved() {
    setDirty(false);
    setSavedNotice("已保存，下面是最新成品预览。");
    await reloadPreview();
    setEditorRevision((value) => value + 1);
    window.requestAnimationFrame(() => {
      previewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  return (
    <main style={pageStyle}>
      <header style={headerStyle}>
        <div>
          <Link
            href={`/experience-cards/${cardId}`}
            style={backLinkStyle}
            onClick={confirmLeave}
          >
            <UiIcon name="arrow-left" size={15} /> 返回经验卡
          </Link>
          <h1 style={titleStyle}>编辑经验卡</h1>
          <p style={leadStyle}>
            选择同一项目中的已有记录、图片和封面；保存后再预览或生成MP4。
          </p>
        </div>
        <Link
          href="/experience-cards"
          style={directoryLinkStyle}
          onClick={confirmLeave}
        >
          我的经验卡
        </Link>
      </header>

      <ExperienceCardEditor
        key={`${cardId}-${editorRevision}`}
        cardId={cardId}
        embedded
        onDirtyChange={(nextDirty) => {
          setDirty(nextDirty);
          if (nextDirty) setSavedNotice("");
        }}
        onSaved={handleSaved}
      />

      <section
        ref={previewRef}
        style={previewSectionStyle}
        aria-label="保存后的经验卡预览与MP4"
      >
        <div style={previewHeadingStyle}>
          <div>
            <div style={eyebrowStyle}>保存后的成品</div>
            <h2 style={previewTitleStyle}>预览与MP4</h2>
          </div>
          <Link
            href={`/experience-cards/${cardId}`}
            style={viewLinkStyle}
            onClick={confirmLeave}
          >
            查看详情 <UiIcon name="arrow-right" size={14} />
          </Link>
        </div>

        {savedNotice ? <p style={savedNoticeStyle}>{savedNotice}</p> : null}

        {dirty ? (
          <div style={saveFirstStyle}>
            先保存上面的修改，系统会更新预览，并显示最新版本的生成MP4按钮。
          </div>
        ) : previewLoading ? (
          <div style={previewMessageStyle}>正在准备预览...</div>
        ) : previewError ? (
          <div style={previewErrorStyle}>{previewError}</div>
        ) : detail ? (
          <ExperienceCardVideoPanel
            key={`${detail.card.updated_at}-${previewRevision}`}
            detail={detail}
            previewOnly
            integrated
          />
        ) : null}
      </section>
    </main>
  );
}

const pageStyle: CSSProperties = {
  maxWidth: 920,
  margin: "0 auto",
  padding: "22px 16px 96px",
  color: "#283428",
};

const headerStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 16,
  flexWrap: "wrap",
  marginBottom: 18,
};

const backLinkStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  color: "#697667",
  textDecoration: "none",
  fontSize: 14,
};

const titleStyle: CSSProperties = {
  margin: "10px 0 5px",
  fontSize: "clamp(25px, 4vw, 31px)",
  lineHeight: 1.25,
};

const leadStyle: CSSProperties = {
  maxWidth: 610,
  margin: 0,
  color: "#748071",
  fontSize: 13,
  lineHeight: 1.65,
};

const directoryLinkStyle: CSSProperties = {
  minHeight: 38,
  display: "inline-flex",
  alignItems: "center",
  padding: "7px 12px",
  border: "1px solid #d7e1d3",
  borderRadius: 999,
  background: "#fff",
  color: "#53634f",
  textDecoration: "none",
  fontSize: 12,
  fontWeight: 800,
};

const previewSectionStyle: CSSProperties = {
  scrollMarginTop: 18,
  marginTop: 18,
  padding: "18px clamp(14px, 3vw, 22px) 22px",
  border: "1px solid #dfe7dc",
  borderRadius: 20,
  background: "#f8fbf6",
};

const previewHeadingStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
  marginBottom: 14,
};

const eyebrowStyle: CSSProperties = {
  color: "#768471",
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: "0.06em",
};

const previewTitleStyle: CSSProperties = {
  margin: "4px 0 0",
  fontSize: 19,
  lineHeight: 1.35,
};

const viewLinkStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  color: "#536b4f",
  textDecoration: "none",
  fontSize: 12,
  fontWeight: 800,
};

const savedNoticeStyle: CSSProperties = {
  margin: "0 0 12px",
  padding: "9px 11px",
  border: "1px solid #cfe0ca",
  borderRadius: 11,
  background: "#edf6e9",
  color: "#4b6b47",
  fontSize: 12,
};

const previewMessageStyle: CSSProperties = {
  padding: 20,
  color: "#748071",
  fontSize: 13,
  textAlign: "center",
};

const saveFirstStyle: CSSProperties = {
  ...previewMessageStyle,
  border: "1px dashed #cdd9c9",
  borderRadius: 14,
  background: "#fff",
  lineHeight: 1.65,
};

const previewErrorStyle: CSSProperties = {
  ...previewMessageStyle,
  border: "1px solid #efd8d5",
  borderRadius: 12,
  background: "#fff8f7",
  color: "#a14d48",
};
