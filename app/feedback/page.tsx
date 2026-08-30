"use client";

import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import UiIcon from "@/components/ui/UiIcon";
import { useLanguage } from "@/lib/i18n/useLanguage";
import styles from "./page.module.css";

const FEEDBACK_EMAIL = "yoyomibaobao@gmail.com";

type FeedbackType = "" | "feature" | "problem" | "experience" | "other";

export default function FeedbackPage() {
  const { language, t } = useLanguage();
  const [type, setType] = useState<FeedbackType>("");
  const [content, setContent] = useState("");
  const [contact, setContact] = useState("");
  const [pageUrl, setPageUrl] = useState("");
  const [status, setStatus] = useState("");

  const typeLabels = useMemo(
    () => ({
      feature: t.feedback_type_feature,
      problem: t.feedback_type_problem,
      experience: t.feedback_type_experience,
      other: t.feedback_type_other,
    }),
    [t]
  );

  async function handleCopyEmail() {
    try {
      await navigator.clipboard.writeText(FEEDBACK_EMAIL);
      setStatus(t.feedback_email_copied);
    } catch {
      setStatus(FEEDBACK_EMAIL);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("");

    if (!type || !content.trim()) {
      setStatus(t.feedback_required);
      return;
    }

    const selectedType = typeLabels[type];
    const subject = `LifeSpace ${language === "zh" ? "反馈" : "Feedback"} - ${selectedType}`;
    const body = [
      `${t.feedback_type}: ${selectedType}`,
      "",
      `${t.feedback_content}:`,
      content.trim(),
      "",
      `${t.feedback_contact}: ${contact.trim() || "-"}`,
      `${t.feedback_page_url}: ${pageUrl.trim() || "-"}`,
    ].join("\n");

    window.location.href = `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  return (
    <main className={styles.page}>
      <Link href="/profile" className={`${styles.backLink} mobile-app-desktop-only`}>
        <UiIcon name="arrow-left" size={16} />
        {t.feedback_back_user_info}
      </Link>
      <section className={styles.hero}>
        <div className={styles.eyebrow}>{t.feedback_eyebrow}</div>
        <h1 className={styles.title}>{t.feedback_title}</h1>
        <p className={styles.intro}>{t.feedback_intro}</p>
      </section>

      <div className={styles.grid}>
        <section className={styles.card}>
          <form className={styles.form} onSubmit={handleSubmit}>
            <label className={styles.field}>
              <span className={styles.label}>{t.feedback_type}</span>
              <select
                className={styles.select}
                value={type}
                onChange={(event) => setType(event.target.value as FeedbackType)}
                required
              >
                <option value="">{t.feedback_type_placeholder}</option>
                <option value="feature">{t.feedback_type_feature}</option>
                <option value="problem">{t.feedback_type_problem}</option>
                <option value="experience">{t.feedback_type_experience}</option>
                <option value="other">{t.feedback_type_other}</option>
              </select>
            </label>

            <label className={styles.field}>
              <span className={styles.label}>{t.feedback_content}</span>
              <textarea
                className={styles.textarea}
                value={content}
                onChange={(event) => setContent(event.target.value)}
                placeholder={t.feedback_content_placeholder}
                required
              />
            </label>

            <label className={styles.field}>
              <span className={styles.label}>{t.feedback_contact}</span>
              <input
                className={styles.input}
                value={contact}
                onChange={(event) => setContact(event.target.value)}
                placeholder={t.feedback_contact_placeholder}
              />
            </label>

            <label className={styles.field}>
              <span className={styles.label}>{t.feedback_page_url}</span>
              <input
                className={styles.input}
                value={pageUrl}
                onChange={(event) => setPageUrl(event.target.value)}
                placeholder={t.feedback_page_url_placeholder}
              />
            </label>

            <p className={styles.note}>{t.feedback_privacy}</p>
            <button className={styles.submit} type="submit">
              {t.feedback_submit}
            </button>
            {status ? <p className={styles.status}>{status}</p> : null}
          </form>
        </section>

        <aside className={styles.card}>
          <h2 className={styles.sideTitle}>{t.feedback_email_label}</h2>
          <div className={styles.emailRow}>
            <div className={styles.email}>{FEEDBACK_EMAIL}</div>
            <button className={styles.copyButton} type="button" onClick={() => void handleCopyEmail()}>
              {t.feedback_copy_email}
            </button>
          </div>
        </aside>
      </div>

      <section className={styles.intent}>
        <h2 className={styles.intentTitle}>{t.feedback_intent_title}</h2>
        <p className={styles.intentText}>{t.feedback_intent_p1}</p>
        <p className={styles.intentText}>{t.feedback_intent_p2}</p>
      </section>

      <p className={styles.bottomNote}>{t.feedback_bottom}</p>
    </main>
  );
}
