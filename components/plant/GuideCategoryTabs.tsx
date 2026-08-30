"use client";

import { archiveCategoryOptions, getArchiveCategoryLabel, type ArchiveCategory } from "@/lib/archive-categories";
import { useLanguage } from "@/lib/i18n/useLanguage";
import styles from "./GuideCategoryTabs.module.css";

export default function GuideCategoryTabs({ value, onChange }: {
  value: ArchiveCategory;
  onChange: (category: ArchiveCategory) => void;
}) {
  const { language } = useLanguage();
  return (
    <nav className={styles.tabs} aria-label={language === "en" ? "Guide categories" : "指引分类"}>
      {archiveCategoryOptions.map((option) => (
        <button key={option.value} type="button" aria-current={value === option.value ? "page" : undefined} onClick={() => onChange(option.value)}>
          {getArchiveCategoryLabel(option.value, language)}
        </button>
      ))}
    </nav>
  );
}
