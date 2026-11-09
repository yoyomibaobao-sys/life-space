"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useLanguage } from "@/lib/i18n/useLanguage";
import { getSupportCopy } from "@/lib/i18n/support-workflow";
import { formatPreciseDateTime } from "@/lib/date-time";
import { getReportCategoryLabel, getSupportStatusLabel, getSupportResolutionLabel, normalizeSupportRows } from "@/lib/support-submissions";
import styles from "./support.module.css";

type AuditEvent = {
  id: number; submission_id: string; actor_id: string;
  previous_status: string; next_status: string;
  resolution: string | null; admin_note: string | null; occurred_at: string;
};
type RecordModerationAuditEvent = {
  event_id: number | string;
  request_id: string;
  record_id: string;
  archive_id: string;
  owner_user_id: string;
  actor_id: string;
  action: "hide" | "restore" | "report_only";
  reason_code: string | null;
  admin_note: string | null;
  source_submission_id: string | null;
  previous_is_hidden: boolean;
  next_is_hidden: boolean;
  previous_version: number | string;
  next_version: number | string;
  previous_effective_public: boolean;
  next_effective_public: boolean;
  occurred_at: string;
};
export default function AdminSupportAudit() {
  const { language } = useLanguage();
  const copy = getSupportCopy(language);
  const [rows, setRows] = useState<AuditEvent[]>([]);
  const [page, setPage] = useState(0);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [moderationRows, setModerationRows] = useState<RecordModerationAuditEvent[]>([]);
  const [moderationPage, setModerationPage] = useState(0);
  const [moderationRevision, setModerationRevision] = useState(0);
  const [moderationLoading, setModerationLoading] = useState(true);
  const [moderationFailed, setModerationFailed] = useState(false);
  const limit = 50;
  useEffect(() => {
    let active = true;
    const abort = new AbortController();
    setLoading(true); setFailed(false);
    void (async () => {
      try {
        const { data, error } = await supabase.rpc("admin_list_support_audit_events", {
          p_limit: limit, p_offset: page * limit,
        }).abortSignal(abort.signal);
        if (!active) return;
        if (error) { setFailed(true); return; }
        setRows(normalizeSupportRows<AuditEvent>(data));
      } catch { if (active) setFailed(true); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; abort.abort(); };
  }, [page, revision]);
  useEffect(() => {
    let active = true;
    const abort = new AbortController();
    setModerationLoading(true);
    setModerationFailed(false);
    void (async () => {
      try {
        const { data, error } = await supabase.rpc("admin_list_record_moderation_events", {
          p_record_id: null, p_limit: limit, p_offset: moderationPage * limit,
        }).abortSignal(abort.signal);
        if (!active) return;
        if (error) { setModerationFailed(true); return; }
        setModerationRows(normalizeSupportRows<RecordModerationAuditEvent>(data));
      } catch { if (active) setModerationFailed(true); }
      finally { if (active) setModerationLoading(false); }
    })();
    return () => { active = false; abort.abort(); };
  }, [moderationPage, moderationRevision]);
  return <>
    <section className={styles.card}>
      <p className={styles.note}>{language === "zh" ? "仅管理员可查看审核操作，逐条保存操作者、时间和结果。" : "Administrator-only action history: actor, time and outcome of each review."}</p>
      <button className={styles.secondary} disabled={loading} onClick={() => setRevision(n => n + 1)}>{copy.retry}</button>
      {loading ? <p role="status">{copy.loading}</p> : failed ? <p role="alert">{copy.loadError}</p> : <>
        {!rows.length && <p>{copy.empty}</p>}
        {rows.map(entry => <article key={entry.id} className={styles.card}>
          <p><strong>{getSupportStatusLabel(entry.previous_status, language)} → {getSupportStatusLabel(entry.next_status, language)}</strong></p>
          <p className={styles.note}>{formatPreciseDateTime(entry.occurred_at)}</p>
          <p className={styles.note}>{language === "zh" ? "管理员：" : "Administrator: "}{entry.actor_id}</p>
          <p className={styles.note}>{language === "zh" ? "举报编号：" : "Submission: "}{entry.submission_id}</p>
          {entry.resolution && <p>{copy.result}: {getSupportResolutionLabel(entry.resolution, language)}</p>}
          {entry.admin_note && <p>{copy.adminNote}: {entry.admin_note}</p>}
        </article>)}
        <div className={styles.actions}>
          <button className={styles.secondary} disabled={page === 0} onClick={() => setPage(n => n - 1)}>{language === "zh" ? "上一页" : "Previous"}</button>
          <span>{page + 1}</span>
          <button className={styles.secondary} disabled={rows.length < limit} onClick={() => setPage(n => n + 1)}>{language === "zh" ? "下一页" : "Next"}</button>
        </div>
      </>}
    </section>
    <section className={styles.card}>
      <h3>{language === "zh" ? "记录下架、恢复与举报结案审计" : "Record moderation and report-closure audit"}</h3>
      <p className={styles.note}>{language === "zh"
        ? "只读追加式记录：操作者、请求编号、原始举报、处置类型及状态版本。"
        : "Append-only read history: actor, request, source report, action type and moderation-state version."}</p>
      <button className={styles.secondary} disabled={moderationLoading} onClick={() => setModerationRevision(n => n + 1)}>{copy.retry}</button>
      {moderationLoading ? <p role="status">{copy.loading}</p> : moderationFailed ? <p role="alert">{copy.loadError}</p> : <>
        {!moderationRows.length && <p>{copy.empty}</p>}
        {moderationRows.map(entry => <article key={String(entry.event_id)} className={styles.card}>
          <p><strong>{entry.action === "hide"
            ? (language === "zh" ? "下架记录" : "Record hidden")
            : entry.action === "restore"
              ? (language === "zh" ? "恢复记录" : "Record restored")
              : (language === "zh" ? "已下架记录的举报结案" : "Report closed for hidden record")}
            {" · "}v{entry.previous_version} → v{entry.next_version}</strong></p>
          <p className={styles.note}>{formatPreciseDateTime(entry.occurred_at)}</p>
          <p className={styles.note}>{language === "zh" ? "记录：" : "Record: "}{entry.record_id}</p>
          <p className={styles.note}>{language === "zh" ? "项目：" : "Project: "}{entry.archive_id}</p>
          <p className={styles.note}>{language === "zh" ? "所有者：" : "Owner: "}{entry.owner_user_id}</p>
          <p className={styles.note}>{language === "zh" ? "管理员：" : "Administrator: "}{entry.actor_id}</p>
          <p className={styles.note}>{language === "zh" ? "请求编号：" : "Request: "}{entry.request_id}</p>
          {entry.reason_code && <p>{language === "zh" ? "原因：" : "Reason: "}{getReportCategoryLabel(entry.reason_code, language)}</p>}
          <p>{language === "zh" ? "公开状态：" : "Effective public: "}
            {entry.previous_effective_public ? "true" : "false"} → {entry.next_effective_public ? "true" : "false"}</p>
          {entry.source_submission_id && <p className={styles.note}>{language === "zh" ? "来源举报：" : "Source report: "}{entry.source_submission_id}</p>}
          {entry.admin_note && <p>{copy.adminNote}: {entry.admin_note}</p>}
        </article>)}
        <div className={styles.actions}>
          <button className={styles.secondary} disabled={moderationPage === 0} onClick={() => setModerationPage(n => n - 1)}>{language === "zh" ? "上一页" : "Previous"}</button>
          <span>{moderationPage + 1}</span>
          <button className={styles.secondary} disabled={moderationRows.length < limit} onClick={() => setModerationPage(n => n + 1)}>{language === "zh" ? "下一页" : "Next"}</button>
        </div>
      </>}
    </section>
  </>;
}
