"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { showToast } from "@/components/Toast";
import ConfirmDialog from "@/components/ConfirmDialog";
import {
  getArchiveCategoryIcon,
  getArchiveCategoryLabel,
} from "@/lib/archive-categories";

type TabKey = "projects" | "users";
type ProjectStatusFilter = "all" | "open" | "resolved" | "ended";

type ArchiveFollowRow = {
  archive_id: string;
  created_at: string;
};

type UserFollowRow = {
  following_id: string;
  created_at: string;
};

type ArchiveRow = {
  id: string;
  user_id: string;
  title: string;
  category: string | null;
  system_name: string | null;
  species_name_snapshot: string | null;
  group_tag_id: string | null;
  sub_tag_id: string | null;
  created_at: string | null;
  status: string | null;
  ended_at: string | null;
  help_status: string | null;
  record_count: number | null;
  last_record_time: string | null;
  view_count: number | null;
  cover_image_url?: string | null;
};

type RecordRow = {
  archive_id: string;
  note: string | null;
  record_time: string | null;
  primary_image_url: string | null;
};

type ProfileRow = {
  id: string;
  username: string | null;
  avatar_url: string | null;
};

type SubTagRow = {
  id: string;
  name: string | null;
};

type GroupTagRow = {
  id: string;
  name: string | null;
};

type FollowProjectCard = {
  id: string;
  title: string;
  displaySystemName: string;
  ownerId: string;
  ownerName: string;
  ownerAvatarUrl: string | null;
  categoryLabel: string;
  categoryIcon: string;
  subTagName: string;
  groupTagName: string;
  latestNote: string;
  latestRecordTime: string | null;
  recordCount: number;
  durationDays: number;
  viewCount: number;
  statusLabel: string;
  statusKind: "help" | "resolved" | "ended" | "normal";
  coverUrl: string | null;
};

type FollowUserCard = {
  id: string;
  username: string;
  avatarUrl: string | null;
  latestRecordTime: string | null;
  publicArchiveCount: number;
  recentArchiveTitles: string[];
};

export default function FollowPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("projects");
  const [keyword, setKeyword] = useState("");
  const [projectStatus, setProjectStatus] = useState<ProjectStatusFilter>("all");
  const [projectCards, setProjectCards] = useState<FollowProjectCard[]>([]);
  const [userCards, setUserCards] = useState<FollowUserCard[]>([]);
  const [projectConfirmId, setProjectConfirmId] = useState<string | null>(null);
  const [userConfirmId, setUserConfirmId] = useState<string | null>(null);
  const [projectSubmitting, setProjectSubmitting] = useState(false);
  const [userSubmitting, setUserSubmitting] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }

      setCurrentUserId(user.id);

      const [{ data: archiveFollows }, { data: userFollows }] = await Promise.all([
        supabase
          .from("archive_follows")
          .select("archive_id, created_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("follows")
          .select("following_id, created_at")
          .eq("follower_id", user.id)
          .order("created_at", { ascending: false }),
      ]);

      const archiveFollowRows = (archiveFollows || []) as ArchiveFollowRow[];
      const userFollowRows = (userFollows || []) as UserFollowRow[];

      const archiveIds = unique(archiveFollowRows.map((item) => item.archive_id).filter(Boolean));
      const followedUserIds = unique(
        userFollowRows.map((item) => item.following_id).filter(Boolean)
      );

      const archivesPromise = archiveIds.length
        ? supabase
            .from("archives")
            .select(
              "id, user_id, title, category, system_name, species_name_snapshot, group_tag_id, sub_tag_id, created_at, status, ended_at, help_status, record_count, last_record_time, view_count, cover_image_url"
            )
            .in("id", archiveIds)
        : Promise.resolve({ data: [] as ArchiveRow[], error: null });

      const followedUsersArchivesPromise = followedUserIds.length
        ? supabase
            .from("archives")
            .select(
              "id, user_id, title, last_record_time, is_public"
            )
            .in("user_id", followedUserIds)
            .eq("is_public", true)
        : Promise.resolve({ data: [] as any[], error: null });

      const recordsPromise = archiveIds.length
        ? supabase
            .from("records")
            .select("archive_id, note, record_time, primary_image_url")
            .in("archive_id", archiveIds)
            .order("record_time", { ascending: false })
        : Promise.resolve({ data: [] as RecordRow[], error: null });

      const [archivesResult, followedUsersArchivesResult, recordsResult] =
        await Promise.all([archivesPromise, followedUsersArchivesPromise, recordsPromise]);

      const archives = (archivesResult.data || []) as ArchiveRow[];
      const followedUsersArchives = (followedUsersArchivesResult.data || []) as Array<
        Pick<ArchiveRow, "id" | "user_id" | "title" | "last_record_time"> & {
          is_public?: boolean;
        }
      >;
      const records = (recordsResult.data || []) as RecordRow[];

      const profileIds = unique([
        ...archives.map((item) => item.user_id),
        ...followedUserIds,
      ]);
      const subTagIds = unique(archives.map((item) => item.sub_tag_id).filter(Boolean)) as string[];
      const groupTagIds = unique(archives.map((item) => item.group_tag_id).filter(Boolean)) as string[];

      const [profilesResult, subTagsResult, groupTagsResult] = await Promise.all([
        profileIds.length
          ? supabase.from("profiles").select("id, username, avatar_url").in("id", profileIds)
          : Promise.resolve({ data: [] as ProfileRow[], error: null }),
        subTagIds.length
          ? supabase.from("sub_tags").select("id, name").in("id", subTagIds)
          : Promise.resolve({ data: [] as SubTagRow[], error: null }),
        groupTagIds.length
          ? supabase.from("group_tags").select("id, name").in("id", groupTagIds)
          : Promise.resolve({ data: [] as GroupTagRow[], error: null }),
      ]);

      const profiles = (profilesResult.data || []) as ProfileRow[];
      const subTags = (subTagsResult.data || []) as SubTagRow[];
      const groupTags = (groupTagsResult.data || []) as GroupTagRow[];

      const profileMap = new Map(profiles.map((item) => [item.id, item]));
      const subTagMap = new Map(subTags.map((item) => [item.id, item.name || ""]));
      const groupTagMap = new Map(groupTags.map((item) => [item.id, item.name || ""]));

      const latestRecordMap = new Map<string, RecordRow>();
      records.forEach((record) => {
        if (!record.archive_id) return;
        if (!latestRecordMap.has(record.archive_id)) {
          latestRecordMap.set(record.archive_id, record);
        }
      });

      const nextProjectCards = archives
        .map((archive) => {
          const latestRecord = latestRecordMap.get(archive.id);
          const profile = profileMap.get(archive.user_id);
          const systemName =
            archive.system_name || archive.species_name_snapshot || "未填写";
          const endBase = archive.ended_at || archive.last_record_time || new Date().toISOString();

          return {
            id: archive.id,
            title: archive.title || "未命名项目",
            displaySystemName: systemName,
            ownerId: archive.user_id,
            ownerName: profile?.username || "未设置用户名",
            ownerAvatarUrl: profile?.avatar_url || null,
            categoryLabel: getArchiveCategoryLabel(archive.category),
            categoryIcon: getArchiveCategoryIcon(archive.category),
            subTagName: archive.sub_tag_id ? subTagMap.get(archive.sub_tag_id) || "" : "",
            groupTagName: archive.group_tag_id
              ? groupTagMap.get(archive.group_tag_id) || ""
              : "",
            latestNote: latestRecord?.note?.trim() || "新增了一条记录",
            latestRecordTime: latestRecord?.record_time || archive.last_record_time || null,
            recordCount: Number(archive.record_count || 0),
            durationDays: getDurationDays(archive.created_at, endBase),
            viewCount: Number(archive.view_count || 0),
            statusLabel: getProjectStatusLabel(archive.help_status, archive.status),
            statusKind: getProjectStatusKind(archive.help_status, archive.status),
            coverUrl:
              archive.cover_image_url || latestRecord?.primary_image_url || null,
          } satisfies FollowProjectCard;
        })
        .sort(byRecentProject);

      const publicArchiveMap = new Map<string, Array<{ title: string; last_record_time: string | null }>>();
      followedUsersArchives.forEach((archive) => {
        if (!archive.user_id) return;
        if (!publicArchiveMap.has(archive.user_id)) {
          publicArchiveMap.set(archive.user_id, []);
        }
        publicArchiveMap.get(archive.user_id)?.push({
          title: archive.title || "未命名项目",
          last_record_time: archive.last_record_time || null,
        });
      });

      const nextUserCards = followedUserIds
        .map((followedId) => {
          const profile = profileMap.get(followedId);
          const archivesOfUser = (publicArchiveMap.get(followedId) || []).sort(
            (a, b) => getTimeValue(b.last_record_time) - getTimeValue(a.last_record_time)
          );

          return {
            id: followedId,
            username: profile?.username || "未设置用户名",
            avatarUrl: profile?.avatar_url || null,
            latestRecordTime: archivesOfUser[0]?.last_record_time || null,
            publicArchiveCount: archivesOfUser.length,
            recentArchiveTitles: archivesOfUser.slice(0, 3).map((item) => item.title),
          } satisfies FollowUserCard;
        })
        .sort((a, b) => getTimeValue(b.latestRecordTime) - getTimeValue(a.latestRecordTime));

      setProjectCards(nextProjectCards);
      setUserCards(nextUserCards);
      setLoading(false);
    }

    load();
  }, [router]);

  const filteredProjectCards = useMemo(() => {
    const search = keyword.trim().toLowerCase();

    return projectCards.filter((item) => {
      const matchKeyword = !search
        ? true
        : [
            item.title,
            item.displaySystemName,
            item.ownerName,
            item.categoryLabel,
            item.subTagName,
            item.groupTagName,
            item.latestNote,
          ]
            .join(" ")
            .toLowerCase()
            .includes(search);

      if (!matchKeyword) return false;
      if (projectStatus === "all") return true;
      if (projectStatus === "open") return item.statusKind === "help";
      if (projectStatus === "resolved") return item.statusKind === "resolved";
      if (projectStatus === "ended") return item.statusKind === "ended";
      return true;
    });
  }, [keyword, projectCards, projectStatus]);

  const filteredUserCards = useMemo(() => {
    const search = keyword.trim().toLowerCase();
    return userCards.filter((item) => {
      if (!search) return true;
      return [item.username, ...item.recentArchiveTitles]
        .join(" ")
        .toLowerCase()
        .includes(search);
    });
  }, [keyword, userCards]);

  async function handleUnfollowProject(archiveId: string) {
    if (!currentUserId || projectSubmitting) return;

    setProjectSubmitting(true);

    const { error } = await supabase
      .from("archive_follows")
      .delete()
      .eq("user_id", currentUserId)
      .eq("archive_id", archiveId);

    if (error) {
      setProjectSubmitting(false);
      showToast("取消关注失败");
      return;
    }

    setProjectCards((prev) => prev.filter((item) => item.id !== archiveId));
    setProjectSubmitting(false);
    setProjectConfirmId(null);
    showToast("已取消关注项目");
  }

  async function handleUnfollowUser(userId: string) {
    if (!currentUserId || userSubmitting) return;

    setUserSubmitting(true);

    const { error } = await supabase
      .from("follows")
      .delete()
      .eq("follower_id", currentUserId)
      .eq("following_id", userId);

    if (error) {
      setUserSubmitting(false);
      showToast("取消关注失败");
      return;
    }

    setUserCards((prev) => prev.filter((item) => item.id !== userId));
    setUserSubmitting(false);
    setUserConfirmId(null);
    showToast("已取消关注用户");
  }

  return (
    <main style={pageStyle}>
      <section style={heroStyle}>
        <div>
          <div style={eyebrowStyle}>持续追踪中心</div>
          <h1 style={titleStyle}>我的关注</h1>
          <div style={subtitleStyle}>查看你正在追踪的项目和用户最近发生了什么。</div>
        </div>

        <div style={summaryWrapStyle}>
          <SummaryCard label="关注项目" value={projectCards.length} />
          <SummaryCard label="关注用户" value={userCards.length} />
        </div>
      </section>

      <section style={panelStyle}>
        <div style={tabRowStyle}>
          <button
            type="button"
            onClick={() => setTab("projects")}
            style={tabButtonStyle(tab === "projects")}
          >
            关注项目
          </button>
          <button
            type="button"
            onClick={() => setTab("users")}
            style={tabButtonStyle(tab === "users")}
          >
            关注用户
          </button>
        </div>

        <div style={toolbarStyle}>
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder={tab === "projects" ? "搜索项目 / 系统名 / 用户名" : "搜索用户名 / 项目名"}
            style={searchInputStyle}
          />

          {tab === "projects" ? (
            <select
              value={projectStatus}
              onChange={(e) => setProjectStatus(e.target.value as ProjectStatusFilter)}
              style={selectStyle}
            >
              <option value="all">全部状态</option>
              <option value="open">求助中</option>
              <option value="resolved">已解决</option>
              <option value="ended">已结束</option>
            </select>
          ) : null}
        </div>

        {loading ? (
          <div style={emptyWrapStyle}>正在加载关注内容…</div>
        ) : tab === "projects" ? (
          filteredProjectCards.length ? (
            <div style={listStyle}>
              {filteredProjectCards.map((item) => {
                const meta = [item.ownerName, item.categoryLabel];
                if (item.subTagName) meta.push(item.subTagName);
                if (item.groupTagName) meta.push(item.groupTagName);

                const stats = [
                  `${formatDateTime(item.latestRecordTime)}更新`,
                  `${item.recordCount}条记录`,
                  `已持续${item.durationDays}天`,
                ];

                return (
                  <article key={item.id} style={cardStyle}>
                    <div style={coverStyle}>
                      {item.coverUrl ? (
                        <img src={item.coverUrl} alt="" style={coverImageStyle} />
                      ) : (
                        <span style={{ fontSize: 34 }}>{item.categoryIcon}</span>
                      )}
                    </div>

                    <div style={cardBodyStyle}>
                      <div style={cardTopRowStyle}>
                        <div style={lineClampOneStyle}>
                          <span style={projectTitleStyle}>{item.title}</span>
                          <span style={projectSubTitleStyle}> · {item.displaySystemName}</span>
                        </div>

                        {item.statusKind !== "normal" ? (
                          <StatusBadge kind={item.statusKind}>{item.statusLabel}</StatusBadge>
                        ) : null}
                      </div>

                      <div style={metaLineStyle}>{meta.join(" · ")}</div>

                      <div style={noteLineStyle}>最近记录：{item.latestNote}</div>

                      <div style={statsLineStyle}>{stats.join(" · ")}</div>

                      <div style={buttonRowStyle}>
                        <button
                          type="button"
                          onClick={() => router.push(`/archive/${item.id}`)}
                          style={primaryButtonStyle}
                        >
                          查看记录
                        </button>
                        <button
                          type="button"
                          onClick={() => setProjectConfirmId(item.id)}
                          style={ghostButtonStyle}
                        >
                          取消关注
                        </button>
                        <Link href={`/user/${item.ownerId}`} style={textLinkStyle}>
                          进入空间
                        </Link>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <EmptyState
              title="还没有关注的项目"
              description="去别人的项目页点“关注项目”后，这里就会出现。"
              actionLabel="去发现页看看"
              href="/discover"
            />
          )
        ) : filteredUserCards.length ? (
          <div style={listStyle}>
            {filteredUserCards.map((item) => (
              <article key={item.id} style={userCardStyle}>
                <div style={userAvatarWrapStyle}>
                  {item.avatarUrl ? (
                    <img src={item.avatarUrl} alt="" style={userAvatarStyle} />
                  ) : (
                    <div style={userAvatarFallbackStyle}>🌱</div>
                  )}
                </div>

                <div style={cardBodyStyle}>
                  <div style={cardTopRowStyle}>
                    <div style={projectTitleStyle}>{item.username}</div>
                  </div>

                  <div style={noteLineStyle}>
                    最近更新：
                    {item.recentArchiveTitles.length
                      ? item.recentArchiveTitles.join("、")
                      : "最近还没有公开项目更新"}
                  </div>

                  <div style={statsLineStyle}>
                    {formatDateTime(item.latestRecordTime)}更新 · 共{item.publicArchiveCount}个公开项目
                  </div>

                  <div style={buttonRowStyle}>
                    <button
                      type="button"
                      onClick={() => router.push(`/user/${item.id}`)}
                      style={primaryButtonStyle}
                    >
                      进入空间
                    </button>
                    <button
                      type="button"
                      onClick={() => router.push(`/user/${item.id}/profile`)}
                      style={ghostButtonStyle}
                    >
                      查看资料
                    </button>
                    <button
                      type="button"
                      onClick={() => setUserConfirmId(item.id)}
                      style={ghostButtonStyle}
                    >
                      取消关注
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState
            title="还没有关注的用户"
            description="去别人的空间页点“关注用户”后，这里就会出现。"
            actionLabel="去发现页看看"
            href="/discover"
          />
        )}
      </section>

      <ConfirmDialog
        open={!!projectConfirmId}
        title="取消关注项目"
        message="确定取消关注这个项目吗？取消后，它将从“我的关注”中移除。"
        confirmText={projectSubmitting ? "处理中..." : "取消关注"}
        cancelText="返回"
        danger
        onClose={() => {
          if (projectSubmitting) return;
          setProjectConfirmId(null);
        }}
        onConfirm={() => {
          if (!projectConfirmId) return;
          return handleUnfollowProject(projectConfirmId);
        }}
      />

      <ConfirmDialog
        open={!!userConfirmId}
        title="取消关注用户"
        message="确定取消关注这个用户吗？取消后，对方将从“我的关注”中移除。"
        confirmText={userSubmitting ? "处理中..." : "取消关注"}
        cancelText="返回"
        danger
        onClose={() => {
          if (userSubmitting) return;
          setUserConfirmId(null);
        }}
        onConfirm={() => {
          if (!userConfirmId) return;
          return handleUnfollowUser(userConfirmId);
        }}
      />
    </main>
  );
}

function EmptyState({
  title,
  description,
  actionLabel,
  href,
}: {
  title: string;
  description: string;
  actionLabel: string;
  href: string;
}) {
  return (
    <div style={emptyWrapStyle}>
      <div style={{ fontSize: 18, fontWeight: 650, color: "#2f3a2f" }}>{title}</div>
      <div style={{ marginTop: 8, color: "#7b8578", fontSize: 14 }}>{description}</div>
      <Link href={href} style={emptyActionStyle}>
        {actionLabel}
      </Link>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div style={summaryCardStyle}>
      <div style={{ fontSize: 12, color: "#7b8578" }}>{label}</div>
      <div style={{ marginTop: 6, fontSize: 28, fontWeight: 700, color: "#263326" }}>{value}</div>
    </div>
  );
}

function StatusBadge({
  children,
  kind,
}: {
  children: React.ReactNode;
  kind: "help" | "resolved" | "ended" | "normal";
}) {
  const palette = {
    help: { color: "#a65f45", background: "#fff5ee", border: "1px solid #efd8cc" },
    resolved: { color: "#4d7c5b", background: "#f1faf3", border: "1px solid #cfe4d4" },
    ended: { color: "#7f7668", background: "#f6f2ec", border: "1px solid #e4d8ca" },
    normal: { color: "#667066", background: "#f6f7f4", border: "1px solid #e6e8e1" },
  } as const;

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "4px 10px",
        borderRadius: 999,
        fontSize: 12,
        whiteSpace: "nowrap",
        ...palette[kind],
      }}
    >
      {children}
    </span>
  );
}

function unique<T>(items: T[]) {
  return Array.from(new Set(items));
}

function getTimeValue(value?: string | null) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function getDurationDays(start?: string | null, end?: string | null) {
  const startTime = getTimeValue(start);
  const endTime = getTimeValue(end);
  if (!startTime) return 0;
  const safeEnd = endTime || Date.now();
  return Math.max(1, Math.floor((safeEnd - startTime) / (1000 * 60 * 60 * 24)) + 1);
}

function formatDateTime(value?: string | null) {
  if (!value) return "暂无";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "暂无";

  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getProjectStatusLabel(helpStatus?: string | null, status?: string | null) {
  if (helpStatus === "open") return "求助中";
  if (helpStatus === "resolved") return "已解决";
  if (status === "ended") return "已结束";
  return "进行中";
}

function getProjectStatusKind(
  helpStatus?: string | null,
  status?: string | null
): "help" | "resolved" | "ended" | "normal" {
  if (helpStatus === "open") return "help";
  if (helpStatus === "resolved") return "resolved";
  if (status === "ended") return "ended";
  return "normal";
}

function byRecentProject(a: FollowProjectCard, b: FollowProjectCard) {
  return getTimeValue(b.latestRecordTime) - getTimeValue(a.latestRecordTime);
}

const pageStyle: React.CSSProperties = {
  maxWidth: 1120,
  margin: "0 auto",
  padding: "28px 16px 56px",
};

const heroStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 16,
  flexWrap: "wrap",
  marginBottom: 18,
};

const eyebrowStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#6f8f62",
  fontWeight: 700,
  letterSpacing: 1.2,
};

const titleStyle: React.CSSProperties = {
  margin: "8px 0 0",
  fontSize: 30,
  lineHeight: 1.2,
  color: "#243024",
};

const subtitleStyle: React.CSSProperties = {
  marginTop: 10,
  color: "#6f786e",
  fontSize: 14,
};

const summaryWrapStyle: React.CSSProperties = {
  display: "flex",
  gap: 12,
  flexWrap: "wrap",
};

const summaryCardStyle: React.CSSProperties = {
  minWidth: 120,
  background: "#fff",
  border: "1px solid #e8eee2",
  borderRadius: 18,
  padding: "14px 16px",
  boxShadow: "0 6px 18px rgba(40, 60, 40, 0.04)",
};

const panelStyle: React.CSSProperties = {
  background: "#fff",
  borderRadius: 24,
  border: "1px solid #e9efe3",
  boxShadow: "0 12px 32px rgba(39, 59, 39, 0.06)",
  padding: 16,
};

const tabRowStyle: React.CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
};

function tabButtonStyle(active: boolean): React.CSSProperties {
  return {
    border: active ? "1px solid #4f8f46" : "1px solid #dfe8d8",
    background: active ? "#4f8f46" : "#f7faf5",
    color: active ? "#fff" : "#495748",
    borderRadius: 999,
    padding: "9px 14px",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 650,
  };
}

const toolbarStyle: React.CSSProperties = {
  display: "flex",
  gap: 10,
  marginTop: 14,
  marginBottom: 16,
  flexWrap: "wrap",
};

const searchInputStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 240,
  borderRadius: 14,
  border: "1px solid #dfe7d8",
  background: "#fafcf8",
  padding: "12px 14px",
  fontSize: 14,
  outline: "none",
};

const selectStyle: React.CSSProperties = {
  borderRadius: 14,
  border: "1px solid #dfe7d8",
  background: "#fafcf8",
  padding: "12px 14px",
  fontSize: 14,
  color: "#465245",
};

const listStyle: React.CSSProperties = {
  display: "grid",
  gap: 14,
};

const cardStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "112px minmax(0, 1fr)",
  gap: 14,
  padding: 14,
  border: "1px solid #ebf0e7",
  borderRadius: 20,
  background: "#fff",
};

const userCardStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "72px minmax(0, 1fr)",
  gap: 14,
  padding: 14,
  border: "1px solid #ebf0e7",
  borderRadius: 20,
  background: "#fff",
};

const coverStyle: React.CSSProperties = {
  width: 112,
  height: 112,
  borderRadius: 16,
  overflow: "hidden",
  background: "linear-gradient(135deg, #f4f7f1, #eef4ed)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "#9aaa9a",
};

const coverImageStyle: React.CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
};

const userAvatarWrapStyle: React.CSSProperties = {
  width: 72,
  height: 72,
};

const userAvatarStyle: React.CSSProperties = {
  width: "100%",
  height: "100%",
  borderRadius: "50%",
  objectFit: "cover",
};

const userAvatarFallbackStyle: React.CSSProperties = {
  width: "100%",
  height: "100%",
  borderRadius: "50%",
  background: "#edf5e8",
  color: "#6f8f62",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 30,
};

const cardBodyStyle: React.CSSProperties = {
  minWidth: 0,
  display: "grid",
  gap: 8,
  alignContent: "center",
};

const cardTopRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 10,
};

const lineClampOneStyle: React.CSSProperties = {
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const projectTitleStyle: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 700,
  color: "#253125",
};

const projectSubTitleStyle: React.CSSProperties = {
  fontSize: 15,
  color: "#667266",
};

const metaLineStyle: React.CSSProperties = {
  color: "#5d685b",
  fontSize: 14,
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const noteLineStyle: React.CSSProperties = {
  color: "#334033",
  fontSize: 14,
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const statsLineStyle: React.CSSProperties = {
  color: "#8a9287",
  fontSize: 13,
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const buttonRowStyle: React.CSSProperties = {
  display: "flex",
  gap: 10,
  alignItems: "center",
  flexWrap: "wrap",
  marginTop: 2,
};

const primaryButtonStyle: React.CSSProperties = {
  border: "none",
  background: "#4f7b45",
  color: "#fff",
  borderRadius: 999,
  padding: "8px 14px",
  cursor: "pointer",
  fontSize: 14,
  fontWeight: 600,
};

const ghostButtonStyle: React.CSSProperties = {
  border: "1px solid #dfe7d8",
  background: "#fff",
  color: "#445244",
  borderRadius: 999,
  padding: "8px 14px",
  cursor: "pointer",
  fontSize: 14,
};

const textLinkStyle: React.CSSProperties = {
  color: "#4f7b45",
  textDecoration: "none",
  fontSize: 14,
  fontWeight: 600,
};

const emptyWrapStyle: React.CSSProperties = {
  border: "1px dashed #dce7d7",
  borderRadius: 20,
  padding: "36px 18px",
  textAlign: "center",
  background: "#fbfdf9",
  color: "#6c766a",
};

const emptyActionStyle: React.CSSProperties = {
  display: "inline-flex",
  marginTop: 14,
  textDecoration: "none",
  color: "#fff",
  background: "#4f7b45",
  borderRadius: 999,
  padding: "9px 14px",
  fontSize: 14,
  fontWeight: 600,
};
