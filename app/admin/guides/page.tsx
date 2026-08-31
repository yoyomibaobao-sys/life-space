"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import MobilePageHeader from "@/components/mobile/MobilePageHeader";
import { showToast } from "@/components/Toast";
import UiIcon from "@/components/ui/UiIcon";
import { getArchiveCategoryLabel } from "@/lib/archive-categories";
import { buildLoginHref } from "@/lib/auth-return";
import { useLanguage } from "@/lib/i18n/useLanguage";
import { supabase } from "@/lib/supabase";

type GuideCandidateRow = {
  id: string;
  category: string;
  name: string;
  usage_count: number | null;
  distinct_user_count: number | null;
  created_at: string | null;
  updated_at: string | null;
};

export default function AdminGuideReviewPage() {
  const { language } = useLanguage();
  const isEnglish = language === "en";
  const [checking, setChecking] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<GuideCandidateRow[]>([]);
  const [actionId, setActionId] = useState("");
  const [error, setError] = useState("");

  const loadRows = useCallback(async () => {
    setLoading(true);
    setError("");
    const { data, error: loadError } = await supabase.rpc("list_pending_guide_candidates");
    if (loadError) {
      console.error("load pending linked guides error:", loadError);
      setError(isEnglish ? "Could not load the review queue." : "关联指引审核队列加载失败。");
      setRows([]);
    } else {
      setRows((data || []) as GuideCandidateRow[]);
    }
    setLoading(false);
  }, [isEnglish]);

  useEffect(() => {
    async function init() {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        window.location.href = buildLoginHref("/admin/guides");
        return;
      }
      const { data: adminAllowed, error: adminError } = await supabase.rpc("is_app_admin", {
        p_user_id: data.user.id,
      });
      const nextAllowed = !adminError && Boolean(adminAllowed);
      setAllowed(nextAllowed);
      setChecking(false);
      if (nextAllowed) await loadRows();
    }
    void init();
  }, [loadRows]);

  async function review(row: GuideCandidateRow, decision: "approve" | "reject") {
    if (actionId) return;
    const reviewNote = decision === "reject"
      ? window.prompt(isEnglish ? "Optional rejection note" : "可填写拒绝原因（选填）") || ""
      : "";
    setActionId(row.id);
    const { data, error: reviewError } = await supabase.rpc("review_guide_candidate", {
      p_candidate_id: row.id,
      p_decision: decision,
      p_review_note: reviewNote || null,
    });
    setActionId("");
    if (reviewError || !data) {
      console.error("review linked guide error:", reviewError);
      showToast(isEnglish ? "Review failed" : "审核失败");
      return;
    }
    showToast(
      decision === "approve"
        ? (isEnglish ? "Added to the public guide library" : "已加入公共指引库")
        : (isEnglish ? "Candidate rejected" : "已拒绝该候选"),
    );
    await loadRows();
  }

  const title = isEnglish ? "Linked guide review" : "关联指引审核";
  return (
    <main style={pageStyle}>
      <MobilePageHeader title={title} titleText={title} fallbackHref="/profile" ariaLabel={isEnglish ? "Back" : "返回"} />
      <div style={shellStyle}>
        <header style={desktopHeaderStyle}>
          <Link href="/profile" style={backLinkStyle}>
            <UiIcon name="arrow-left" size={16} />
            {isEnglish ? "Back to profile" : "返回个人资料"}
          </Link>
          <h1 style={titleStyle}>{title}</h1>
          <p style={introStyle}>
            {isEnglish
              ? "Candidates enter this queue after use by at least three different users. Approval publishes the name to the guide library."
              : "至少 3 位不同用户使用后才进入这里；确认后，该名称才会加入公共指引库。"}
          </p>
        </header>

        {checking ? (
          <div style={emptyStyle}>{isEnglish ? "Checking access..." : "正在验证权限…"}</div>
        ) : !allowed ? (
          <div style={errorStyle}>{isEnglish ? "Administrator access required." : "仅管理员可以查看。"}</div>
        ) : loading && rows.length === 0 ? (
          <div style={emptyStyle}>{isEnglish ? "Loading..." : "加载中…"}</div>
        ) : error ? (
          <div style={errorStyle}>{error}</div>
        ) : rows.length === 0 ? (
          <div style={emptyStyle}>{isEnglish ? "No candidates are awaiting review." : "当前没有待审核的关联指引。"}</div>
        ) : (
          <section style={listStyle}>
            {rows.map((row) => (
              <article key={row.id} style={cardStyle}>
                <div style={cardHeadingStyle}>
                  <span style={categoryStyle}>{getArchiveCategoryLabel(row.category, language)}</span>
                  <strong>{row.name}</strong>
                </div>
                <div style={metaStyle}>
                  <span>{isEnglish ? `${row.distinct_user_count || 0} users` : `${row.distinct_user_count || 0} 位用户`}</span>
                  <span>{isEnglish ? `${row.usage_count || 0} projects` : `${row.usage_count || 0} 个项目`}</span>
                </div>
                <div style={actionRowStyle}>
                  <button type="button" disabled={Boolean(actionId)} onClick={() => void review(row, "approve")} style={approveButtonStyle}>
                    {isEnglish ? "Approve" : "确认并公开"}
                  </button>
                  <button type="button" disabled={Boolean(actionId)} onClick={() => void review(row, "reject")} style={rejectButtonStyle}>
                    {isEnglish ? "Reject" : "拒绝"}
                  </button>
                </div>
              </article>
            ))}
          </section>
        )}
      </div>
    </main>
  );
}

const pageStyle: CSSProperties = { minHeight: "100vh", background: "#f7faf5", color: "#263626" };
const shellStyle: CSSProperties = { width: "min(760px, calc(100% - 24px))", margin: "0 auto", padding: "20px 0 100px" };
const desktopHeaderStyle: CSSProperties = { marginBottom: 18 };
const backLinkStyle: CSSProperties = { display: "inline-flex", alignItems: "center", gap: 5, color: "#4f704b", textDecoration: "none", fontWeight: 750 };
const titleStyle: CSSProperties = { margin: "14px 0 7px", fontSize: 28 };
const introStyle: CSSProperties = { margin: 0, color: "#6f7c6c", fontSize: 14, lineHeight: 1.65 };
const listStyle: CSSProperties = { display: "grid", gap: 12 };
const cardStyle: CSSProperties = { padding: 15, border: "1px solid #dfe8da", borderRadius: 16, background: "#fff" };
const cardHeadingStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 9, color: "#2e422d", fontSize: 17 };
const categoryStyle: CSSProperties = { padding: "4px 8px", borderRadius: 999, background: "#edf7e9", color: "#4d7548", fontSize: 12, fontWeight: 800 };
const metaStyle: CSSProperties = { display: "flex", gap: 14, marginTop: 10, color: "#778273", fontSize: 13 };
const actionRowStyle: CSSProperties = { display: "flex", gap: 9, marginTop: 14 };
const approveButtonStyle: CSSProperties = { minHeight: 40, flex: 1, border: 0, borderRadius: 11, background: "#4f844b", color: "#fff", fontWeight: 800, cursor: "pointer" };
const rejectButtonStyle: CSSProperties = { minHeight: 40, flex: 1, border: "1px solid #e3cbc7", borderRadius: 11, background: "#fff", color: "#a34f48", fontWeight: 750, cursor: "pointer" };
const emptyStyle: CSSProperties = { padding: 28, border: "1px solid #e2e9df", borderRadius: 15, background: "#fff", color: "#778273", textAlign: "center" };
const errorStyle: CSSProperties = { ...emptyStyle, borderColor: "#eed6d3", background: "#fff4f2", color: "#a14d47" };
