"use client";

import Link from "next/link";
import {
  archiveCategoryOptions,
  getArchiveCategoryDescription,
  getArchiveCategoryLabel,
  type ArchiveCategory,
} from "@/lib/archive-categories";
import { useLanguage } from "@/lib/i18n/useLanguage";

type Props = {
  onCreateArchive: (category: ArchiveCategory) => void;
  createDisabled?: boolean;
  createDisabledTitle?: string;
  createDisabledHref?: string;
};

export default function ArchiveToolbar({
  onCreateArchive,
  createDisabled = false,
  createDisabledTitle,
  createDisabledHref,
}: Props) {
  const { language, t } = useLanguage();

  return (
    <section
      style={{
        marginBottom: 14,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#263326" }}>
            {t.archive_workspace.new_project}
          </div>
          <div style={{ marginTop: 3, fontSize: 12, color: "#7d8a75" }}>
            {t.archive_workspace.choose_category_hint}
          </div>
        </div>

        {createDisabled && createDisabledHref ? (
          <Link
            href={createDisabledHref}
            title={createDisabledTitle}
            style={{
              padding: "10px 16px",
              borderRadius: 999,
              border: "1px solid #cfe3c8",
              background: "#9aa398",
              color: "#fff",
              cursor: "pointer",
              fontSize: 14,
              fontWeight: 600,
              whiteSpace: "nowrap",
              textDecoration: "none",
            }}
          >
            {t.archive_workspace.open_membership}
          </Link>
        ) : null}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(132px, 1fr))",
          gap: 10,
        }}
      >
        {archiveCategoryOptions.map((option) => {
          const disabled = createDisabled;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                if (disabled) return;
                onCreateArchive(option.value);
              }}
              disabled={disabled}
              title={
                createDisabledTitle ||
                getArchiveCategoryDescription(option.value, language)
              }
              style={{
                minHeight: 66,
                textAlign: "left",
                borderRadius: 16,
                border: "1px solid #d8e6d0",
                background: disabled ? "#f1f2ef" : "#fbfdf8",
                color: disabled ? "#9aa398" : "#254425",
                cursor: disabled ? "not-allowed" : "pointer",
                padding: "10px 12px",
                boxShadow: disabled ? "none" : "0 6px 16px rgba(44, 74, 38, 0.04)",
              }}
            >
              <div style={{ fontSize: 15, fontWeight: 800 }}>
                {getArchiveCategoryLabel(option.value, language)}
              </div>
              <div
                style={{
                  marginTop: 4,
                  fontSize: 12,
                  lineHeight: 1.45,
                  color: disabled ? "#9aa398" : "#6f7b6a",
                }}
              >
                {getArchiveCategoryDescription(option.value, language)}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
