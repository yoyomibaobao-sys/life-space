"use client";

import { useState, type CSSProperties, type FormEvent } from "react";
import MobilePageHeaderView from "@/components/mobile/MobilePageHeaderView";
import UiIcon from "@/components/ui/UiIcon";
import { useLanguage } from "@/lib/i18n/useLanguage";
import { getLegalContent, type LegalPageKey } from "@/lib/legal-content";
import { getSupportCopy } from "@/lib/i18n/support-workflow";
import {
  FEEDBACK_CATEGORIES,
  getFeedbackCategoryLabel,
  type SupportRpcResult,
} from "@/lib/support-submissions";
import { safeSupportUrl } from "@/lib/support-links";
import { supabase } from "@/lib/supabase";

export type AndroidProfileInfoKind =
  | "membership-benefits"
  | "data-security"
  | "legal-index"
  | "legal-privacy"
  | "legal-terms"
  | "legal-refunds"
  | "legal-contact"
  | "feedback";

const LEGAL_KEYS: LegalPageKey[] = ["privacy", "terms", "refunds", "contact"];
const FEEDBACK_EMAIL = "yoyomibaobao@gmail.com";

export default function AndroidProfileInfoPage({
  kind,
  online,
  signedIn,
  onBack,
  onNavigate,
}: {
  kind: AndroidProfileInfoKind;
  online: boolean;
  signedIn: boolean;
  onBack: () => void;
  onNavigate: (path: string) => void;
}) {
  const { language, t } = useLanguage();

  if (kind === "membership-benefits") {
    const cloudPlan = t.membership_page.plans[2];
    const localPlan = t.membership_page.plans[1];
    return (
      <InfoShell title={t.membership_page.benefits_rules_title} onBack={onBack}>
        <p style={introStyle}>{t.membership_page.benefits_rules_subtitle}</p>
        <section style={featuredCardStyle}>
          <div style={planTopStyle}>
            <h2 style={sectionTitleStyle}>{cloudPlan.title}</h2>
            <strong style={priceStyle}>{cloudPlan.price}</strong>
          </div>
          <p style={bodyStyle}>{cloudPlan.description}</p>
          <ul style={listStyle}>{cloudPlan.items.map((item) => <li key={item}>{item}</li>)}</ul>
          <button
            type="button"
            style={primaryButtonStyle}
            disabled={!online}
            onClick={() => onNavigate("/membership/payment")}
          >
            {online ? t.membership_page.open_now : language === "zh" ? "联网后开通" : "Connect to subscribe"}
          </button>
        </section>

        <details style={detailsStyle}>
          <summary style={summaryStyle}>{localPlan.title} · {localPlan.price}</summary>
          <p style={detailsBodyStyle}>{localPlan.description}</p>
          <ul style={listStyle}>{localPlan.items.map((item) => <li key={item}>{item}</li>)}</ul>
        </details>
        <details style={detailsStyle}>
          <summary style={summaryStyle}>{t.membership_page.trial_title}</summary>
          <p style={detailsBodyStyle}>{t.membership_page.trial_description}</p>
        </details>
        <details style={detailsStyle}>
          <summary style={summaryStyle}>{t.membership_page.rules_title}</summary>
          <ul style={listStyle}>{t.membership_page.rules.map((rule) => <li key={rule}>{rule}</li>)}</ul>
        </details>
      </InfoShell>
    );
  }

  if (kind === "data-security") {
    const sections = language === "zh" ? [
      {
        title: "本机数据",
        paragraphs: [
          "本地项目、记录和照片保存在当前设备，可在断网时继续查看和记录。它们不会因为切换到云会员而自动变成云端内容。",
        ],
      },
      {
        title: "云端数据",
        paragraphs: [
          "云项目以云端版本为准，联网时读取和修改。会员或云体验结束后的保留、只读与转本地规则按会员规则执行。",
        ],
      },
      {
        title: "离线缓存",
        paragraphs: [
          "APP 会为正在使用的云项目保留轻量离线副本，主要用于断网查看。缓存中的云项目只读，不作为可独立修改的第二份云项目。",
          "已结束项目不进入离线缓存；显式退出登录后会清除该账号的云端缓存。",
        ],
      },
      {
        title: "离线记录与同步",
        paragraphs: [
          "在云项目中断网新增的记录先保存在本机并进入待同步状态。恢复网络后，再上传到原来的云项目。未完成同步前，不把本机内容当作已经上传成功。",
        ],
      },
      {
        title: "备份与导出",
        paragraphs: [
          "备份与导出是单独的操作入口。导出的是本人项目、记录及其原始图片等可备份内容，不把社区互动、集市信息或经验卡本身作为独立备份对象。",
        ],
      },
    ] : [
      {
        title: "Local data",
        paragraphs: ["Local projects, records and photos stay on this device and remain available offline. They do not automatically become cloud data when membership changes."],
      },
      {
        title: "Cloud data",
        paragraphs: ["Cloud projects use the cloud copy as the source of truth while online. Retention, read-only access and conversion to local after membership or trial expiry follow the membership rules."],
      },
      {
        title: "Offline cache",
        paragraphs: ["The app keeps a lightweight offline copy of active cloud projects for reading when disconnected. Cached cloud projects are read-only and are not a second editable cloud copy.", "Ended projects are not cached. Explicit sign-out clears the cloud cache for that account."],
      },
      {
        title: "Offline records and sync",
        paragraphs: ["Records added to a cloud project while offline are saved locally and marked pending. When connectivity returns, they are uploaded back to the original cloud project."],
      },
      {
        title: "Backup & export",
        paragraphs: ["Backup and export remain a separate action. Exports cover the user's own projects, records and original media, not community interactions, marketplace posts or experience cards as standalone items."],
      },
    ];
    return (
      <InfoShell title={language === "zh" ? "数据规则" : "Data rules"} onBack={onBack}>
        <p style={introStyle}>
          {language === "zh"
            ? "这里说明 LifeSpace 中数据实际存放、缓存和同步的方式；隐私政策等法律文本统一放在“法律规则”中。"
            : "This page explains how LifeSpace stores, caches and syncs data. Privacy policy and other legal terms remain under Legal & rules."}
        </p>
        <article style={documentStyle}>
          {sections.map((section) => (
            <section key={section.title} style={documentSectionStyle}>
              <h2 style={documentTitleStyle}>{section.title}</h2>
              {section.paragraphs.map((paragraph) => <p key={paragraph} style={bodyStyle}>{paragraph}</p>)}
            </section>
          ))}
        </article>
      </InfoShell>
    );
  }

  if (kind === "feedback") {
    return (
      <FeedbackInfoPage
        online={online}
        signedIn={signedIn}
        onBack={onBack}
      />
    );
  }

  const content = getLegalContent(language);
  if (kind === "legal-index") {
    return (
      <InfoShell title={content.index.title} onBack={onBack}>
        <p style={introStyle}>{content.index.intro}</p>
        <small style={versionStyle}>{content.index.version}</small>
        <div style={navGridStyle}>
          {LEGAL_KEYS.map((key) => (
            <button
              type="button"
              key={key}
              style={navCardStyle}
              onClick={() => onNavigate(`/legal/${key}`)}
            >
              <strong>{content.nav[key].title}</strong>
              <span style={navDescriptionStyle}>{content.nav[key].description}</span>
              <UiIcon name="chevron-right" size={17} aria-hidden="true" />
            </button>
          ))}
        </div>
      </InfoShell>
    );
  }

  const pageKey = kind.replace("legal-", "") as LegalPageKey;
  const page = content.pages[pageKey];
  return (
    <InfoShell title={page.title} onBack={onBack}>
      <p style={introStyle}>{page.intro}</p>
      <small style={versionStyle}>{page.version}</small>
      <article style={documentStyle}>
        {page.sections.map((section) => (
          <section key={section.title} style={documentSectionStyle}>
            <h2 style={documentTitleStyle}>{section.title}</h2>
            {section.paragraphs?.map((paragraph) => <p key={paragraph} style={bodyStyle}>{paragraph}</p>)}
            {section.bullets ? (
              <ul style={listStyle}>{section.bullets.map((item) => <li key={item}>{item}</li>)}</ul>
            ) : null}
          </section>
        ))}
      </article>
      <div style={relatedStyle}>
        {LEGAL_KEYS.filter((key) => key !== pageKey).map((key) => (
          <button type="button" key={key} style={secondaryButtonStyle} onClick={() => onNavigate(`/legal/${key}`)}>
            {content.nav[key].title}
          </button>
        ))}
      </div>
    </InfoShell>
  );
}

function FeedbackInfoPage({
  online,
  signedIn,
  onBack,
}: {
  online: boolean;
  signedIn: boolean;
  onBack: () => void;
}) {
  const { language, t } = useLanguage();
  const copy = getSupportCopy(language);
  const [category, setCategory] = useState("");
  const [content, setContent] = useState("");
  const [source, setSource] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!online || !signedIn || saving) return;
    if (!category || !content.trim()) {
      setMessage(copy.required);
      return;
    }
    if (source.trim() && !safeSupportUrl(source)) {
      setMessage(copy.targetError);
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      const { data, error } = await supabase.rpc("submit_support_submission", {
        p_kind: "feedback",
        p_category: category,
        p_content: content.trim(),
        p_source_url: safeSupportUrl(source),
        p_target_type: null,
        p_target_id: null,
        p_target_url: null,
      });
      const result = data as SupportRpcResult | null;
      if (error || !result?.ok) {
        setMessage(result?.error === "rate_limited" ? copy.rateLimited : copy.submitError);
      } else {
        setMessage(result.duplicate ? copy.duplicate : copy.submitted);
        if (!result.duplicate) setContent("");
      }
    } catch {
      setMessage(copy.submitError);
    } finally {
      setSaving(false);
    }
  }

  return (
    <InfoShell title={copy.feedback} onBack={onBack}>
      <p style={introStyle}>{copy.intro}</p>
      {!online ? <p style={offlineNoticeStyle}>{language === "zh" ? "当前断网。联系信息可查看，反馈提交将在联网后可用。" : "You are offline. Contact details remain available; submissions require a connection."}</p> : null}
      {online && !signedIn ? <p style={offlineNoticeStyle}>{copy.signInHint}</p> : null}

      <section style={featuredCardStyle}>
        <h2 style={sectionTitleStyle}>{copy.emailTitle}</h2>
        <p style={bodyStyle}>{copy.emailHint}</p>
        <a href={`mailto:${FEEDBACK_EMAIL}`} style={emailLinkStyle}>{FEEDBACK_EMAIL}</a>
      </section>

      <form onSubmit={submit} style={feedbackFormStyle}>
        <label style={fieldStyle}>
          <span>{copy.category}</span>
          <select value={category} onChange={(event) => setCategory(event.target.value)} disabled={!online || !signedIn || saving} style={controlStyle}>
            <option value="">{copy.choose}</option>
            {FEEDBACK_CATEGORIES.map((value) => <option key={value} value={value}>{getFeedbackCategoryLabel(value, language)}</option>)}
          </select>
        </label>
        <label style={fieldStyle}>
          <span>{copy.content}</span>
          <textarea value={content} onChange={(event) => setContent(event.target.value)} disabled={!online || !signedIn || saving} maxLength={4000} style={{ ...controlStyle, minHeight: 110, resize: "vertical" }} />
        </label>
        <label style={fieldStyle}>
          <span>{copy.source}{copy.optional}</span>
          <input value={source} onChange={(event) => setSource(event.target.value)} disabled={!online || !signedIn || saving} maxLength={2000} style={controlStyle} />
        </label>
        <p style={bodyStyle}>{copy.privacy}</p>
        <button type="submit" style={primaryButtonStyle} disabled={!online || !signedIn || saving}>
          {saving ? copy.submitting : copy.submit}
        </button>
        {message ? <p role="status" style={messageStyle}>{message}</p> : null}
      </form>

      <section style={intentStyle}>
        <h2 style={sectionTitleStyle}>{t.feedback_intent_title}</h2>
        <p style={bodyStyle}>{t.feedback_intent_p1}</p>
        <p style={bodyStyle}>{t.feedback_intent_p2}</p>
      </section>
    </InfoShell>
  );
}

function InfoShell({ title, onBack, children }: { title: string; onBack: () => void; children: React.ReactNode }) {
  const { t } = useLanguage();
  return (
    <div data-android-profile-info="true">
      <MobilePageHeaderView title={title} titleText={title} showBack ariaLabel={t.nav.back} onBack={onBack} />
      <main style={pageStyle}>{children}</main>
    </div>
  );
}

const pageStyle: CSSProperties = { width: "100%", maxWidth: 760, margin: "0 auto", padding: "14px 12px 36px", boxSizing: "border-box" };
const introStyle: CSSProperties = { margin: "0 0 8px", color: "#687563", fontSize: 14, lineHeight: 1.65 };
const versionStyle: CSSProperties = { display: "block", marginBottom: 14, color: "#879282", fontSize: 11, lineHeight: 1.45 };
const featuredCardStyle: CSSProperties = { display: "grid", gap: 10, marginBottom: 12, padding: 14, border: "1px solid #d7e4d1", borderRadius: 16, background: "#f8fbf6" };
const planTopStyle: CSSProperties = { display: "grid", gap: 3 };
const sectionTitleStyle: CSSProperties = { margin: 0, color: "#2a3b28", fontSize: 17, lineHeight: 1.35 };
const priceStyle: CSSProperties = { color: "#3f7d3d", fontSize: 15 };
const bodyStyle: CSSProperties = { margin: 0, color: "#596856", fontSize: 14, lineHeight: 1.65 };
const listStyle: CSSProperties = { margin: 0, paddingLeft: 20, color: "#465541", fontSize: 14, lineHeight: 1.72 };
const primaryButtonStyle: CSSProperties = { minHeight: 42, border: 0, borderRadius: 12, background: "#4f7b45", color: "#fff", padding: "8px 14px", fontSize: 14, fontWeight: 800, cursor: "pointer" };
const secondaryButtonStyle: CSSProperties = { minHeight: 36, border: "1px solid #dbe5d7", borderRadius: 10, background: "#fff", color: "#4e654a", padding: "6px 10px", fontSize: 13, fontWeight: 700, cursor: "pointer" };
const detailsStyle: CSSProperties = { marginBottom: 10, padding: "12px 14px", border: "1px solid #dfe8d8", borderRadius: 14, background: "#fff" };
const summaryStyle: CSSProperties = { cursor: "pointer", color: "#2f472e", fontSize: 15, fontWeight: 800, lineHeight: 1.5 };
const detailsBodyStyle: CSSProperties = { ...bodyStyle, margin: "10px 0" };
const navGridStyle: CSSProperties = { display: "grid", gap: 9, marginTop: 14 };
const navCardStyle: CSSProperties = { minHeight: 68, display: "grid", gridTemplateColumns: "1fr auto", gap: 4, alignItems: "center", border: "1px solid #dfe8dc", borderRadius: 14, background: "#fff", color: "#334c32", padding: "11px 13px", textAlign: "left", cursor: "pointer" };
const navDescriptionStyle: CSSProperties = { gridColumn: "1 / 2", color: "#74806f", fontSize: 12, lineHeight: 1.5 };
const documentStyle: CSSProperties = { display: "grid", gap: 14, marginTop: 14, padding: 14, border: "1px solid #e0e8dd", borderRadius: 16, background: "#fff" };
const documentSectionStyle: CSSProperties = { display: "grid", gap: 7 };
const documentTitleStyle: CSSProperties = { margin: 0, color: "#30452e", fontSize: 16, lineHeight: 1.4 };
const relatedStyle: CSSProperties = { display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 };
const offlineNoticeStyle: CSSProperties = { margin: "10px 0", padding: "9px 11px", borderRadius: 10, background: "#f5f2e8", color: "#745f3d", fontSize: 13, lineHeight: 1.5 };
const emailLinkStyle: CSSProperties = { color: "#477343", fontSize: 14, fontWeight: 800, textDecoration: "none", overflowWrap: "anywhere" };
const feedbackFormStyle: CSSProperties = { display: "grid", gap: 10, marginBottom: 12, padding: 14, border: "1px solid #dfe8dc", borderRadius: 16, background: "#fff" };
const fieldStyle: CSSProperties = { display: "grid", gap: 5, color: "#435440", fontSize: 13, fontWeight: 700 };
const controlStyle: CSSProperties = { width: "100%", minHeight: 38, border: "1px solid #d5dfd1", borderRadius: 10, background: "#fff", color: "#2f3d2d", padding: "7px 9px", fontSize: 14, boxSizing: "border-box" };
const messageStyle: CSSProperties = { margin: 0, color: "#4f6b4a", fontSize: 13, lineHeight: 1.5 };
const intentStyle: CSSProperties = { display: "grid", gap: 8, padding: 14, borderRadius: 14, background: "#f5f8f2" };
