"use client";

import type { CSSProperties } from "react";
import MobilePageHeader from "@/components/mobile/MobilePageHeader";
import MobilePageHeaderView from "@/components/mobile/MobilePageHeaderView";
import InternalLink from "@/components/navigation/InternalLink";
import UiIcon from "@/components/ui/UiIcon";
import {
  archiveCategoryOptions,
  getArchiveCategoryLabel,
  type ArchiveCategory,
} from "@/lib/archive-categories";
import type { ArchiveCategoryDepth, ArchiveCategoryDepths, ArchiveCategorySpace } from "@/lib/archive-category-settings";
import { useLanguage } from "@/lib/i18n/useLanguage";

export default function ProjectCategorySettingsView({
  activeSpace,
  onSpaceChange,
  depths,
  loading,
  saving,
  error,
  cloudRequiresNetwork,
  onToggleDepth,
  onSave,
  onBack,
}: {
  activeSpace: ArchiveCategorySpace;
  onSpaceChange: (space: ArchiveCategorySpace) => void;
  depths: ArchiveCategoryDepths;
  loading?: boolean;
  saving?: boolean;
  error?: string;
  cloudRequiresNetwork?: boolean;
  onToggleDepth: (category: ArchiveCategory, depth: ArchiveCategoryDepth) => void;
  onSave: () => void;
  onBack?: () => void;
}) {
  const { language, t } = useLanguage();
  const isEnglish = language === "en";
  const pageTitle = t.archive_workspace.group_settings_title;
  const cloudLocked = activeSpace === "cloud" && cloudRequiresNetwork;

  function updateDepth(category: ArchiveCategory, depth: ArchiveCategoryDepth) {
    if (cloudLocked) return;
    onToggleDepth(category, depth);
  }

  return (
    <main data-project-category-settings-view="true" style={pageStyle}>
      {onBack ? (
        <MobilePageHeaderView
          title={pageTitle}
          titleText={pageTitle}
          showBack
          ariaLabel={isEnglish ? "Back to profile" : "返回个人资料"}
          onBack={onBack}
        />
      ) : (
        <MobilePageHeader
          title={pageTitle}
          titleText={pageTitle}
          fallbackHref="/profile"
          ariaLabel={isEnglish ? "Back to profile" : "返回个人资料"}
        />
      )}

      <div style={shellStyle}>
        <header style={desktopHeaderStyle}>
          {!onBack ? <InternalLink href="/profile" className="mobile-app-desktop-only" style={backLinkStyle}>
            <UiIcon name="arrow-left" size={17} />
            {isEnglish ? "Back to profile" : "返回个人资料"}
          </InternalLink> : null}
          {!onBack ? <h1 className="mobile-app-desktop-only" style={desktopTitleStyle}>{pageTitle}</h1> : null}
          <p style={introStyle}>
            {isEnglish
              ? "Cloud and local groups are configured independently. Hiding a level does not delete existing groups."
              : "云空间与本地分别设置。关闭层级只隐藏对应选择，不删除已有分组数据。"}
          </p>
        </header>

        <nav style={spaceTabsStyle} aria-label={isEnglish ? "Project space" : "项目空间"}>
          {(["cloud", "local"] as const).map((space) => (
            <button
              key={space}
              type="button"
              onClick={() => onSpaceChange(space)}
              style={spaceTabStyle(activeSpace === space)}
            >
              {space === "cloud"
                ? (isEnglish ? "Cloud" : "云空间")
                : (isEnglish ? "Local" : "本地")}
            </button>
          ))}
        </nav>

        <div style={{ ...introStyle, marginBottom: 14 }}>
          <p style={{ margin: "0 0 6px" }}>{t.archive_workspace.group_setup_hint}</p>
          <p style={{ margin: 0 }}>{t.archive_workspace.group_options_hint}</p>
        </div>

        {cloudLocked ? (
          <section style={messageStyle}>{isEnglish ? "A network connection is required." : "需要联网。"}</section>
        ) : loading ? (
          <section style={messageStyle}>{isEnglish ? "Loading..." : "加载中…"}</section>
        ) : (
          <section style={categoryListStyle}>
            {archiveCategoryOptions.map((option) => {
              const category = option.value;
              const depth = depths[category];
              const secondEnabled = depth >= 2;
              const thirdEnabled = depth >= 3;
              return (
                <article key={category} style={categoryCardStyle}>
                  <div style={categoryHeadingStyle}>
                    <strong>{getArchiveCategoryLabel(category, language)}</strong>
                    <span>{depth === 1
                      ? (isEnglish ? "No groups" : "未开启分组")
                      : (isEnglish ? `${depth - 1} group ${depth === 2 ? "level" : "levels"}` : `${depth === 2 ? "一级" : "二级"}分组`)}</span>
                  </div>
                  <SettingRow label={t.archive_workspace.main_category} value={isEnglish ? "Enabled" : "已启用"} />
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
        )}

        {error ? <div style={errorStyle}>{error}</div> : null}
        <button
          type="button"
          onClick={onSave}
          disabled={loading || saving || cloudLocked}
          style={saveButtonStyle}
        >
          {saving ? (isEnglish ? "Saving..." : "保存中…") : (isEnglish ? "Save" : "保存")}
        </button>
      </div>
    </main>
  );
}

function SettingRow({
  label,
  value,
  checked,
  onToggle,
}: {
  label: string;
  value?: string;
  checked?: boolean;
  onToggle?: () => void;
}) {
  return (
    <div style={settingRowStyle}>
      <span>{label}</span>
      {onToggle ? (
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
      ) : (
        <strong style={enabledTextStyle}>{value}</strong>
      )}
    </div>
  );
}

const pageStyle: CSSProperties = { minHeight: "100vh", background: "#f7faf5", color: "#263626" };
const shellStyle: CSSProperties = { width: "min(760px, calc(100% - 24px))", margin: "0 auto", padding: "18px 0 110px" };
const desktopHeaderStyle: CSSProperties = { marginBottom: 18 };
const backLinkStyle: CSSProperties = { display: "inline-flex", alignItems: "center", gap: 5, color: "#4f704b", textDecoration: "none", fontWeight: 750 };
const desktopTitleStyle: CSSProperties = { margin: "14px 0 6px", fontSize: 28 };
const introStyle: CSSProperties = { margin: 0, color: "#71806d", fontSize: 14, lineHeight: 1.6 };
const spaceTabsStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", marginBottom: 14, borderBottom: "1px solid #dfe8da" };
function spaceTabStyle(active: boolean): CSSProperties {
  return { minHeight: 48, border: 0, borderBottom: active ? "3px solid #56834e" : "3px solid transparent", background: "transparent", color: active ? "#2f6331" : "#6f7d6b", fontSize: 17, fontWeight: active ? 850 : 700, cursor: "pointer" };
}
const categoryListStyle: CSSProperties = { display: "grid", gap: 12 };
const categoryCardStyle: CSSProperties = { overflow: "hidden", border: "1px solid #dfe8da", borderRadius: 16, background: "#fff", boxShadow: "0 5px 16px rgba(38, 61, 36, 0.04)" };
const categoryHeadingStyle: CSSProperties = { minHeight: 52, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "0 15px", borderBottom: "1px solid #edf1e9", color: "#314b30" };
const settingRowStyle: CSSProperties = { minHeight: 54, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "0 15px", borderBottom: "1px solid #f0f3ed", color: "#50604d", fontSize: 15 };
const enabledTextStyle: CSSProperties = { color: "#4d7b49", fontSize: 14 };
function toggleStyle(active: boolean): CSSProperties {
  return { position: "relative", width: 50, height: 30, flex: "0 0 50px", padding: 0, border: "1px solid #cad8c6", borderRadius: 999, background: active ? "#56854e" : "#e8eee5", cursor: "pointer" };
}
function toggleThumbStyle(active: boolean): CSSProperties {
  return { position: "absolute", top: 3, left: active ? 23 : 3, width: 22, height: 22, borderRadius: 999, background: "#fff", boxShadow: "0 1px 4px rgba(31, 46, 30, .25)", transition: "left 160ms ease" };
}
const messageStyle: CSSProperties = { padding: 24, textAlign: "center", color: "#71806d" };
const errorStyle: CSSProperties = { marginTop: 12, padding: "10px 12px", borderRadius: 10, background: "#fff0ef", color: "#a44943", fontSize: 14 };
const saveButtonStyle: CSSProperties = { width: "100%", minHeight: 50, marginTop: 16, border: 0, borderRadius: 14, background: "#4f844b", color: "#fff", fontSize: 16, fontWeight: 800, cursor: "pointer" };
