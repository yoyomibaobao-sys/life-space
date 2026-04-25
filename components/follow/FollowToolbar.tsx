import type { ProjectStatusFilter, TabKey } from "@/lib/follow-types";
import { searchInputStyle, selectStyle, tabButtonStyle, tabRowStyle, toolbarStyle } from "@/components/follow/FollowShared";

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
  return (
    <>
      <div style={tabRowStyle}>
        <button type="button" onClick={() => onTabChange("projects")} style={tabButtonStyle(tab === "projects")}>关注项目</button>
        <button type="button" onClick={() => onTabChange("users")} style={tabButtonStyle(tab === "users")}>关注用户</button>
      </div>

      <div style={toolbarStyle}>
        <input
          value={keyword}
          onChange={(e) => onKeywordChange(e.target.value)}
          placeholder={tab === "projects" ? "搜索项目 / 系统名 / 用户名" : "搜索用户名 / 项目名"}
          style={searchInputStyle}
        />

        {tab === "projects" ? (
          <select
            value={projectStatus}
            onChange={(e) => onProjectStatusChange(e.target.value as ProjectStatusFilter)}
            style={selectStyle}
          >
            <option value="all">全部状态</option>
            <option value="open">求助中</option>
            <option value="resolved">已解决</option>
            <option value="ended">已结束</option>
          </select>
        ) : null}
      </div>
    </>
  );
}
