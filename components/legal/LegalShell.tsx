"use client";

import Link from "next/link";
import UiIcon from "@/components/ui/UiIcon";
import { useLanguage } from "@/lib/i18n/useLanguage";
import { getLegalContent, type LegalPageKey } from "@/lib/legal-content";
import styles from "./LegalShell.module.css";

const PAGE_KEYS: LegalPageKey[] = ["privacy", "terms", "refunds", "contact"];

export function LegalIndex() {
  const { language } = useLanguage();
  const content = getLegalContent(language);

  return (
    <main className={styles.page}>
      <div className={styles.backRow}>
        <Link href="/profile">
          <UiIcon name="arrow-left" size={16} />
          {content.backToProfile}
        </Link>
      </div>
      <header className={styles.hero}>
        <div className={styles.eyebrow}>{content.index.eyebrow}</div>
        <h1>{content.index.title}</h1>
        <p>{content.index.intro}</p>
        <small>{content.index.version}</small>
      </header>

      <nav className={styles.cardGrid} aria-label={content.index.title}>
        {PAGE_KEYS.map((key) => (
          <Link key={key} href={`/legal/${key}`} className={styles.navCard}>
            <strong>{content.nav[key].title}</strong>
            <span>{content.nav[key].description}</span>
            <UiIcon name="arrow-right" size={20} className={styles.navIcon} />
          </Link>
        ))}
      </nav>
    </main>
  );
}

export function LegalPage({ pageKey }: { pageKey: LegalPageKey }) {
  const { language } = useLanguage();
  const content = getLegalContent(language);
  const page = content.pages[pageKey];

  return (
    <main className={styles.page}>
      <div className={styles.backRow}>
        <Link href="/legal">
          <UiIcon name="arrow-left" size={16} />
          {content.backToLegal}
        </Link>
      </div>

      <header className={styles.hero}>
        <div className={styles.eyebrow}>{page.eyebrow}</div>
        <h1>{page.title}</h1>
        <p>{page.intro}</p>
        <small>{page.version}</small>
      </header>

      <article className={styles.document}>
        {page.sections.map((section) => (
          <section key={section.title}>
            <h2>{section.title}</h2>
            {section.paragraphs?.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
            {section.bullets ? (
              <ul>
                {section.bullets.map((item) => <li key={item}>{item}</li>)}
              </ul>
            ) : null}
          </section>
        ))}
      </article>

      <nav className={styles.related} aria-label={content.index.title}>
        {PAGE_KEYS.filter((key) => key !== pageKey).map((key) => (
          <Link key={key} href={`/legal/${key}`}>{content.nav[key].title}</Link>
        ))}
      </nav>
    </main>
  );
}
