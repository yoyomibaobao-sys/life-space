"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { formatPreciseDateTime } from "@/lib/date-time";
import { useLanguage } from "@/lib/i18n/useLanguage";
import { getSupportCopy } from "@/lib/i18n/support-workflow";
import { safeSupportUrl } from "@/lib/support-links";
import { getFeedbackCategoryLabel, getReportCategoryLabel, getSupportResolutionLabel, getSupportStatusLabel, normalizeSupportRows, type SupportRpcResult, type SupportSubmissionKind, type SupportSubmissionRow } from "@/lib/support-submissions";
import { supabase } from "@/lib/supabase";
import styles from "./support.module.css";

export default function SupportHistory({ kind, revision, highlightedId }: { kind: SupportSubmissionKind; revision: number; highlightedId: string }) {
  const { language } = useLanguage();
  const copy = getSupportCopy(language);
  const [rows, setRows] = useState<SupportSubmissionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    const abort = new AbortController();
    setLoading(true); setError(false);
    void (async () => {
      try {
        const { data, error: rpcError } = await supabase.rpc("get_my_support_submissions", { p_kind: kind, p_limit: 100 }).abortSignal(abort.signal);
        if (!active) return;
        if (rpcError) { setError(true); return; }
        setRows(normalizeSupportRows<SupportSubmissionRow>(data));
      } catch { if (active) setError(true); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; abort.abort(); };
  }, [kind, revision, retry]);
  useEffect(() => {
    if (!loading && !error && highlightedId) document.getElementById(`submission-${highlightedId}`)?.scrollIntoView({ block: "start" });
  }, [loading, error, highlightedId]);
  return <section aria-label={copy.history}>
    <div className={styles.row}><h2>{copy.history}</h2><button className={styles.secondary} onClick={() => setRetry(value => value + 1)} disabled={loading}>{copy.retry}</button></div>
    {loading && <p role="status">{copy.loading}</p>}
    {error && <p role="alert" className={styles.error}>{copy.loadError}</p>}
    {!loading && !error && <>
      {!rows.length && <p>{copy.empty}</p>}
      {rows.length >= 100 && <p className={styles.note}>{copy.recent}</p>}
      {highlightedId && !rows.some(row => row.id === highlightedId) && <p className={styles.note}>{copy.notInRecent}</p>}
    </>}
    {rows.map(row => <SubmissionCard key={row.id} row={row} highlighted={row.id === highlightedId} onUpdated={() => setRetry(value => value + 1)} />)}
  </section>;
}

function SubmissionCard({ row, highlighted, onUpdated }: { row: SupportSubmissionRow; highlighted: boolean; onUpdated: () => void }) {
  const { language } = useLanguage();
  const copy = getSupportCopy(language);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const inFlight = useRef(false);
  const href = safeSupportUrl(row.target_url || row.source_url);
  async function supplement(event: FormEvent) {
    event.preventDefault();
    if (!draft.trim() || inFlight.current) return;
    inFlight.current = true; setSaving(true); setError(false);
    try {
      const { data, error: rpcError } = await supabase.rpc("supplement_support_submission", { p_submission_id: row.id, p_supplement: draft.trim() });
      if (rpcError || !(data as SupportRpcResult | null)?.ok) { setError(true); return; }
      setDraft(""); onUpdated();
    } catch { setError(true); }
    finally { inFlight.current = false; setSaving(false); }
  }
  return <article id={`submission-${row.id}`} className={`${styles.card} ${highlighted ? styles.highlighted : ""}`}>
    <div className={styles.row}><strong>{(row.kind === "report" ? getReportCategoryLabel : getFeedbackCategoryLabel)(row.category, language)}</strong><span className={styles.status}>{getSupportStatusLabel(row.status, language)}</span></div>
    <time className={styles.time}>{formatPreciseDateTime(row.created_at)}</time>
    {row.content && <p className={styles.content}>{row.content}</p>}
    {href && <Link href={href}>{copy.openTarget}</Link>}
    {row.supplement && <p className={styles.content}>{copy.supplement}: {row.supplement}</p>}
    {row.status === "resolved" && <p className={styles.message}>{copy.result}: {getSupportResolutionLabel(row.resolution, language)}</p>}
    {row.status === "needs_info" && !row.supplement && <form className={styles.form} onSubmit={supplement}>
      <label className={styles.field}>{copy.supplement}<textarea value={draft} onChange={e => setDraft(e.target.value)} maxLength={3000} required disabled={saving} /></label>
      <p className={styles.note}>{copy.supplementHint}</p>
      <button className={styles.button} disabled={saving}>{saving ? copy.submitting : copy.submit}</button>
    </form>}
    {error && <p role="alert" className={styles.error}>{copy.supplementError}</p>}
  </article>;
}
