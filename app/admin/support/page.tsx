"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useSupportIdentity } from "@/components/support/useSupportIdentity";
import { formatPreciseDateTime } from "@/lib/date-time";
import { useLanguage } from "@/lib/i18n/useLanguage";
import { getSupportCopy } from "@/lib/i18n/support-workflow";
import { safeSupportUrl } from "@/lib/support-links";
import { getFeedbackCategoryLabel, getReportCategoryLabel, getSupportResolutionLabel, getSupportStatusLabel, normalizeSupportRows, type AdminSupportSubmissionRow, type SupportRpcResult, type SupportSubmissionKind } from "@/lib/support-submissions";
import { supabase } from "@/lib/supabase";
import styles from "@/components/support/support.module.css";

export default function AdminSupportPage() {
  const { language } = useLanguage();
  const copy = getSupportCopy(language);
  const { userId, error, retry } = useSupportIdentity();
  return <main className={styles.page}>
    <Link href="/profile" className="mobile-app-desktop-only">{copy.back}</Link>
    <h1 className="mobile-app-desktop-only">{copy.admin}</h1>
    {error ? <p role="alert">{copy.loadError} <button className={styles.secondary} onClick={retry}>{copy.retry}</button></p>
      : userId === undefined ? <p role="status">{copy.loading}</p>
      : !userId ? <p>{copy.denied}</p> : <AdminGate key={userId} userId={userId} />}
  </main>;
}

function AdminGate({ userId }: { userId: string }) {
  const { language } = useLanguage();
  const copy = getSupportCopy(language);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [failed, setFailed] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const { data, error } = await supabase.rpc("is_app_admin", { p_user_id: userId });
        if (!active) return;
        if (error) setFailed(true); else setAllowed(data === true);
      } catch { if (active) setFailed(true); }
    })();
    return () => { active = false; };
  }, [userId, revision]);
  if (failed) return <p role="alert">{copy.loadError} <button className={styles.secondary} onClick={() => { setFailed(false); setRevision(value => value + 1); }}>{copy.retry}</button></p>;
  if (allowed === null) return <p role="status">{copy.loading}</p>;
  if (!allowed) return <p>{copy.denied}</p>;
  return <SupportQueue />;
}

function SupportQueue() {
  const { language } = useLanguage();
  const copy = getSupportCopy(language);
  const [kind, setKind] = useState<SupportSubmissionKind>("report");
  const [status, setStatus] = useState("submitted");
  return <>
    <p className={styles.note}>{copy.adminHint}</p>
    <div className={styles.actions}>
      <button className={kind === "report" ? styles.button : styles.secondary} onClick={() => setKind("report")}>{copy.reportQueue}</button>
      <button className={kind === "feedback" ? styles.button : styles.secondary} onClick={() => setKind("feedback")}>{copy.feedbackQueue}</button>
      <label className={styles.field}>
        <select aria-label={copy.all} value={status} onChange={e => setStatus(e.target.value)}>
          <option value="">{copy.all}</option>
          {["submitted", "needs_info", "resolved"].map(value => <option key={value} value={value}>{getSupportStatusLabel(value, language)}</option>)}
        </select>
      </label>
    </div>
    <QueueItems key={`${kind}-${status}`} kind={kind} status={status} />
  </>;
}

function QueueItems({ kind, status }: { kind: SupportSubmissionKind; status: string }) {
  const { language } = useLanguage();
  const copy = getSupportCopy(language);
  const [rows, setRows] = useState<AdminSupportSubmissionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  const [message, setMessage] = useState("");
  useEffect(() => {
    let active = true;
    const abort = new AbortController();
    setLoading(true); setError(false);
    void (async () => {
      try {
        const { data, error: rpcError } = await supabase.rpc("admin_list_support_submissions", { p_kind: kind, p_status: status || null, p_limit: 200 }).abortSignal(abort.signal);
        if (!active) return;
        if (rpcError) { setError(true); return; }
        setRows(normalizeSupportRows<AdminSupportSubmissionRow>(data));
      } catch { if (active) setError(true); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; abort.abort(); };
  }, [kind, status, revision]);
  return <>
    <p className={styles.note}>{copy.queueLimit}</p>
    <button className={styles.secondary} disabled={loading} onClick={() => setRevision(value => value + 1)}>{copy.retry}</button>
    {message && <p role="status" className={styles.message}>{message}</p>}
    {loading ? <p role="status">{copy.loading}</p> : error ? <p role="alert" className={styles.error}>{copy.loadError}</p> : <>
      {!rows.length && <p>{copy.empty}</p>}
      {rows.map(row => <QueueItem key={`${row.id}-${row.updated_at}`} row={row} onUpdated={() => { setMessage(copy.updated); setRevision(value => value + 1); }} />)}
    </>}
  </>;
}

function QueueItem({ row, onUpdated }: { row: AdminSupportSubmissionRow; onUpdated: () => void }) {
  const { language } = useLanguage();
  const copy = getSupportCopy(language);
  const [note, setNote] = useState(row.admin_note || "");
  const [resolution, setResolution] = useState("");
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const inFlight = useRef(false);
  const href = safeSupportUrl(row.target_url || row.source_url);
  const choices = row.kind === "report" ? ["action_taken", "no_violation", "duplicate", "closed"] : ["recorded", "action_taken", "not_planned", "closed"];
  async function update(status: "needs_info" | "resolved") {
    if (inFlight.current || (status === "resolved" && !resolution)) return;
    if (status === "resolved" && !window.confirm(row.kind === "report" ? copy.confirmGroup : copy.confirm)) return;
    inFlight.current = true; setSaving(true); setFailed(false);
    try {
      const { data, error } = await supabase.rpc("admin_update_support_submission", { p_submission_id: row.id, p_status: status, p_resolution: status === "resolved" ? resolution : null, p_admin_note: note.trim() || null });
      if (error || !(data as SupportRpcResult | null)?.ok) { setFailed(true); return; }
      onUpdated();
    } catch { setFailed(true); }
    finally { inFlight.current = false; setSaving(false); }
  }
  return <article className={styles.card}>
    <div className={styles.row}><strong>{(row.kind === "report" ? getReportCategoryLabel : getFeedbackCategoryLabel)(row.category, language)}</strong><span className={styles.status}>{getSupportStatusLabel(row.status, language)}</span></div>
    <time className={styles.time}>{formatPreciseDateTime(row.created_at)}</time>
    {row.content && <p className={styles.content}>{row.content}</p>}
    {href && <Link href={href} target="_blank" rel="noopener noreferrer">{copy.openTarget}</Link>}
    {row.supplement && <p className={styles.content}>{copy.supplement}: {row.supplement}</p>}
    {row.kind === "report" && row.status !== "resolved" && <p className={styles.note}>{copy.sameTarget}: {row.same_target_count}. {copy.groupHint}</p>}
    {row.status === "resolved" ? <>
      <p>{copy.result}: {getSupportResolutionLabel(row.resolution, language)}</p>
      {row.admin_note && <p className={styles.content}>{copy.adminNote}: {row.admin_note}</p>}
    </> : <div className={styles.form}>
      <label className={styles.field}>{copy.adminNote}<textarea value={note} onChange={e => setNote(e.target.value)} maxLength={1000} disabled={saving} /></label>
      <label className={styles.field}>{copy.result}<select value={resolution} onChange={e => setResolution(e.target.value)} disabled={saving}>
        <option value="">{copy.choose}</option>{choices.map(value => <option key={value} value={value}>{getSupportResolutionLabel(value, language)}</option>)}
      </select></label>
      <div className={styles.actions}>
        {!row.supplement && row.status !== "needs_info" && <button className={styles.secondary} disabled={saving} onClick={() => void update("needs_info")}>{copy.requestInfo}</button>}
        <button className={styles.button} disabled={saving || !resolution} onClick={() => void update("resolved")}>{saving ? copy.submitting : copy.markResult}</button>
      </div>
    </div>}
    {failed && <p role="alert" className={styles.error}>{copy.actionError}</p>}
  </article>;
}
