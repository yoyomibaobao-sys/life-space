"use client";

import type { ProjectStatusFilter, TabKey } from "@/lib/follow-types";
import { searchInputStyle, selectStyle, tabButtonStyle, tabRowStyle, toolbarStyle } from "@/components/follow/FollowShared";
import { useLanguage } from "@/lib/i18n/useLanguage";

export default function FollowToolbar({
  tab,
  keyword,
  projectStatus,
  onTabChange,
  onKeywordChange,
  onProjectStatusChange,
}: {
  tab: TabKey;
  keyword: string;
  projectStatus: ProjectStatusFilter;
  onTabChange: (tab: TabKey) => void;
  onKeywordChange: (value: string) => void;
  onProjectStatusChange: (value: ProjectStatusFilter) => void;
}) {
  const { t } = useLanguage();
  const followT = t.follow;

  return (
    <>
      <div style={tabRowStyle}>
        <button type="button" onClick={() => onTabChange("projects")} style={tabButtonStyle(tab === "projects")}>{followT.projects}</button>
        <button type="button" onClick={() => onTabChange("users")} style={tabButtonStyle(tab === "users")}>{followT.users}</button>
      </div>

      <div style={toolbarStyle}>
        <input
          value={keyword}
          onChange={(e) => onKeywordChange(e.target.value)}
          placeholder={tab === "projects" ? followT.search_projects : followT.search_users}
          style={searchInputStyle}
        />

        {tab === "projects" ? (
          <select
            value={projectStatus}
            onChange={(e) => onProjectStatusChange(e.target.value as ProjectStatusFilter)}
            style={selectStyle}
          >
            <option value="all">{followT.status_all}</option>
            <option value="open">{followT.status_open}</option>
            <option value="resolved">{followT.status_resolved}</option>
            <option value="ended">{followT.status_ended}</option>
          </select>
        ) : null}
      </div>
    </>
  );
}
