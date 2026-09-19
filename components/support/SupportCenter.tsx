"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { buildLoginHref } from "@/lib/auth-return";
import { useLanguage } from "@/lib/i18n/useLanguage";
import { getSupportCopy } from "@/lib/i18n/support-workflow";
import { getReportTarget, safeSupportUrl } from "@/lib/support-links";
import { FEEDBACK_CATEGORIES, REPORT_CATEGORIES, getFeedbackCategoryLabel, getReportCategoryLabel, type SupportRpcResult, type SupportSubmissionKind } from "@/lib/support-submissions";
import { supabase } from "@/lib/supabase";
import { useSupportIdentity } from "./useSupportIdentity";
import SupportHistory from "./SupportHistory";
import styles from "./support.module.css";

const FEEDBACK_EMAIL = "yoyomibaobao@gmail.com";

export default function SupportCenter({ kind }: { kind: SupportSubmissionKind }) {
  const { language, t } = useLanguage();
  const copy = getSupportCopy(language);
  const { userId, error, retry } = useSupportIdentity();
  const params = useSearchParams();
  const [emailStatus, setEmailStatus] = useState("");
  const path = kind === "report" ? "/report" : "/feedback";
  const returnTo = `${path}${params.toString() ? `?${params.toString()}` : ""}`;
  return <main className={styles.page}>
    <Link href="/profile" className="mobile-app-desktop-only">{copy.back}</Link>
    <h1 className="mobile-app-desktop-only">{kind === "report" ? copy.report : copy.feedback}</h1>
    <div className={styles.row}>
      <p className={styles.note}>{copy.intro}</p>
      <Link href={kind === "report" ? "/feedback" : "/report"}>{kind === "report" ? copy.feedback : copy.reports}</Link>
    </div>
    {error ? <p role="alert" className={styles.error}>{copy.loadError} <button className={styles.secondary} onClick={retry}>{copy.retry}</button></p>
      : userId === undefined ? <p role="status">{copy.loading}</p>
      : !userId ? <section className={styles.card}><p>{copy.signInHint}</p><Link href={buildLoginHref(returnTo)}>{copy.signIn}</Link></section>
      : <SignedInSupport key={`${userId}-${kind}-${params.get("target") || ""}`} kind={kind} />}
    <aside className={styles.card}>
      <h2>{copy.emailTitle}</h2><p className={styles.note}>{copy.emailHint}</p>
      <div className={styles.actions}>
        <a href={`mailto:${FEEDBACK_EMAIL}`}>{FEEDBACK_EMAIL}</a>
        <button className={styles.secondary} onClick={async () => {
          try { await navigator.clipboard.writeText(FEEDBACK_EMAIL); setEmailStatus(copy.copied); }
          catch { setEmailStatus(FEEDBACK_EMAIL); }
        }}>{copy.copyEmail}</button>
      </div><p role="status" className={styles.note}>{emailStatus}</p>
    </aside>
    {kind === "feedback" && <section className={styles.intent}>
      <h2>{t.feedback_intent_title}</h2><p>{t.feedback_intent_p1}</p><p>{t.feedback_intent_p2}</p>
    </section>}
  </main>;
}

function SignedInSupport({ kind }: { kind: SupportSubmissionKind }) {
  const { language } = useLanguage();
  const copy = getSupportCopy(language);
  const params = useSearchParams();
  const [targetInput, setTargetInput] = useState(params.get("target") || "");
  const [category, setCategory] = useState("");
  const [content, setContent] = useState("");
  const [source, setSource] = useState("");
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const inFlight = useRef(false);
  const [revision, setRevision] = useState(0);
  const [submittedId, setSubmittedId] = useState("");
  const categories = kind === "report" ? REPORT_CATEGORIES : FEEDBACK_CATEGORIES;
  const categoryLabel = kind === "report" ? getReportCategoryLabel : getFeedbackCategoryLabel;
  const requiredContent = kind === "feedback" || category === "other";
  const target = getReportTarget(targetInput);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (inFlight.current) return;
    setFailed(true); setMessage("");
    if (!category || (requiredContent && !content.trim())) { setMessage(copy.required); return; }
    if ((kind === "report" && !target) || (source.trim() && !safeSupportUrl(source))) { setMessage(copy.targetError); return; }
    inFlight.current = true; setSaving(true);
    try {
      const { data, error } = await supabase.rpc("submit_support_submission", {
        p_kind: kind, p_category: category, p_content: content.trim(),
        p_source_url: kind === "report" ? target?.url : safeSupportUrl(source),
        p_target_type: kind === "report" ? target?.type : null,
        p_target_id: kind === "report" ? target?.id : null,
        p_target_url: kind === "report" ? target?.url : null,
      });
      const result = data as SupportRpcResult | null;
      if (error || !result?.ok) { setMessage(result?.error === "rate_limited" ? copy.rateLimited : copy.submitError); return; }
      setFailed(false); setMessage(result.duplicate ? copy.duplicate : copy.submitted);
      if (!result.duplicate) setContent("");
      setSubmittedId(result.id || ""); setRevision(value => value + 1);
    } catch { setMessage(copy.submitError); }
    finally { inFlight.current = false; setSaving(false); }
  }
  return <>
    <section className={styles.card}>
      <form className={styles.form} onSubmit={submit}>
        {kind === "report" && <label className={styles.field}>{copy.target}
          <input value={targetInput} onChange={e => setTargetInput(e.target.value)} maxLength={2000} required disabled={saving} />
          <span className={styles.note}>{copy.targetHint}</span>
        </label>}
        <label className={styles.field}>{copy.category}
          <select value={category} onChange={e => setCategory(e.target.value)} required disabled={saving}>
            <option value="">{copy.choose}</option>{categories.map(value => <option key={value} value={value}>{categoryLabel(value, language)}</option>)}
          </select>
        </label>
        <label className={styles.field}>{copy.content}{requiredContent ? "" : copy.optional}
          <textarea value={content} onChange={e => setContent(e.target.value)} maxLength={4000} required={requiredContent} disabled={saving} />
        </label>
        {kind === "feedback" && <label className={styles.field}>{copy.source}
          <input value={source} onChange={e => setSource(e.target.value)} maxLength={2000} disabled={saving} />
        </label>}
        <p className={styles.note}>{copy.privacy}</p>
        <button type="submit" className={styles.button} disabled={saving}>{saving ? copy.submitting : copy.submit}</button>
        {message && <p role={failed ? "alert" : "status"} className={failed ? styles.error : styles.message}>{message}</p>}
      </form>
    </section>
    <SupportHistory kind={kind} revision={revision} highlightedId={submittedId || params.get("submission") || ""} />
  </>;
}
