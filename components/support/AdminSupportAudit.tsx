"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useLanguage } from "@/lib/i18n/useLanguage";
import { getSupportCopy } from "@/lib/i18n/support-workflow";
import { formatPreciseDateTime } from "@/lib/date-time";
import { getSupportStatusLabel, getSupportResolutionLabel, normalizeSupportRows } from "@/lib/support-submissions";
import styles from "./support.module.css";

type AuditEvent = {
  id: number; submission_id: string; actor_id: string;
  previous_status: string; next_status: string;
  resolution: string | null; admin_note: string | null; occurred_at: string;
};
export default function AdminSupportAudit() {
  const { language } = useLanguage();
  const copy = getSupportCopy(language);
  const [rows, setRows] = useState<AuditEvent[]>([]);
  const [page, setPage] = useState(0);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
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
  return <section className={styles.card}>
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
  </section>;
}
