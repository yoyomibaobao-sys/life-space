"use client";

import { useState, type CSSProperties } from "react";
import MobilePageHeaderView from "@/components/mobile/MobilePageHeaderView";
import UiIcon from "@/components/ui/UiIcon";
import { showToast } from "@/components/Toast";
import {
  archiveCategoryOptions,
  getArchiveCategoryLabel,
  type ArchiveCategory,
} from "@/lib/archive-categories";
import {
  DEFAULT_ARCHIVE_CATEGORY_DEPTHS,
  getLocalArchiveCategoryDepths,
  saveLocalArchiveCategoryDepths,
  type ArchiveCategoryDepth,
  type ArchiveCategoryDepths,
} from "@/lib/archive-category-settings";
import { useLanguage } from "@/lib/i18n/useLanguage";
import { loadRememberedLocalOwnerContext } from "@/lib/local-owner-context";

export default function LocalProjectCategorySettingsView({
  onBack,
  localOwnerId,
}: {
  onBack: () => void;
  localOwnerId?: string | null;
}) {
  const { language, t } = useLanguage();
  const isEnglish = language === "en";
  const ownerId = localOwnerId || loadRememberedLocalOwnerContext()?.userId || null;
  const [localDepths, setLocalDepths] = useState<ArchiveCategoryDepths>(
    () => getLocalArchiveCategoryDepths(ownerId),
  );

  function updateDepth(category: ArchiveCategory, depth: ArchiveCategoryDepth) {
    setLocalDepths((current) => {
      const next = { ...current, [category]: depth };
      saveLocalArchiveCategoryDepths(next, ownerId);
      return next;
    });
    showToast(isEnglish ? "Group settings saved" : "项目分组设置已保存");
  }

  const pageTitle = t.archive_workspace.group_settings_title;

  return (
    <>
      <MobilePageHeaderView
        title={pageTitle}
        titleText={pageTitle}
        onBack={onBack}
        ariaLabel={isEnglish ? "Back to profile" : "返回个人资料"}
      />
      <div style={shellStyle}>
        <p style={introStyle}>
          {isEnglish
            ? "These settings apply immediately to local projects on this device."
            : "这些设置会立即作用于本机本地项目，无需联网。"}
        </p>
        <p style={introStyle}>{t.archive_workspace.group_setup_hint}</p>
        <section style={categoryListStyle}>
          {archiveCategoryOptions.map((option) => {
            const category = option.value;
            const depth = localDepths[category];
            const secondEnabled = depth >= 2;
            const thirdEnabled = depth >= 3;
            return (
              <article key={category} style={categoryCardStyle}>
                <div style={categoryHeadingStyle}>
                  <strong>{getArchiveCategoryLabel(category, language)}</strong>
                </div>
                <SettingRow
                  label={isEnglish ? "Enable level 1 groups" : "开启一级分组"}
                  checked={secondEnabled}
                  onToggle={() => updateDepth(category, secondEnabled ? 1 : 2)}
                />
                {secondEnabled ? (
                  <SettingRow
                    label={isEnglish ? "Enable level 2 groups" : "开启二级分组"}
                    checked={thirdEnabled}
                    onToggle={() => updateDepth(category, thirdEnabled ? 2 : 3)}
                  />
                ) : null}
              </article>
            );
          })}
        </section>
      </div>
    </>
  );
}

function SettingRow({
  label,
  checked,
  onToggle,
}: {
  label: string;
  checked?: boolean;
  onToggle?: () => void;
}) {
  return (
    <div style={settingRowStyle}>
      <span>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={onToggle}
        style={toggleStyle(Boolean(checked))}
      >
        <span style={toggleThumbStyle(Boolean(checked))} />
      </button>
    </div>
  );
}

const shellStyle: CSSProperties = { width: "min(760px, calc(100% - 24px))", margin: "0 auto", padding: "12px 0 110px" };
const introStyle: CSSProperties = { margin: "0 0 12px", color: "#71806d", fontSize: 14, lineHeight: 1.6 };
const categoryListStyle: CSSProperties = { display: "grid", gap: 12 };
const categoryCardStyle: CSSProperties = { overflow: "hidden", border: "1px solid #dfe8da", borderRadius: 16, background: "#fff" };
const categoryHeadingStyle: CSSProperties = { minHeight: 52, display: "flex", alignItems: "center", padding: "0 15px", borderBottom: "1px solid #edf1e9", color: "#314b30" };
const settingRowStyle: CSSProperties = { minHeight: 54, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "0 15px", borderBottom: "1px solid #f0f3ed", color: "#50604d", fontSize: 15 };
function toggleStyle(active: boolean): CSSProperties {
  return { position: "relative", width: 50, height: 30, flex: "0 0 50px", padding: 0, border: "1px solid #cad8c6", borderRadius: 999, background: active ? "#56854e" : "#e8eee5", cursor: "pointer" };
}
function toggleThumbStyle(active: boolean): CSSProperties {
  return { position: "absolute", top: 3, left: active ? 23 : 3, width: 22, height: 22, borderRadius: 999, background: "#fff", boxShadow: "0 1px 4px rgba(31, 46, 30, .25)", transition: "left 160ms ease" };
}
