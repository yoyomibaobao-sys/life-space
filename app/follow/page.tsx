"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { PUBLIC_PROFILE_SELECT } from "@/lib/domain-types";
import { showToast } from "@/components/Toast";
import ConfirmDialog from "@/components/ConfirmDialog";
import CompactActivityTime from "@/components/ui/CompactActivityTime";
import ProjectMetaLine from "@/components/ui/ProjectMetaLine";
import UiIcon, { type UiIconName } from "@/components/ui/UiIcon";
import {
  getArchiveCategoryIcon,
  getArchiveCategoryLabel,
} from "@/lib/archive-categories";
import { resolveMediaDisplayPairs } from "@/lib/media-urls";
import { useLanguage } from "@/lib/i18n/useLanguage";
import { buildLoginHref, getCurrentInternalPath } from "@/lib/auth-return";
import MobileContentTopBar from "@/components/mobile/MobileContentTopBar";
import { fetchFollowedPublicProjects } from "@/lib/followed-public-project-feed";
import type {
  DiscoveryProjectCursor,
  DiscoveryProjectFeedItem,
} from "@/lib/discover-project-types";

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
  cover_image_path?: string | null;
  cover_thumb_path?: string | null;
};

type RecordRow = {
  id: string;
  archive_id: string;
  note: string | null;
  record_time: string | null;
  primary_image_url: string | null;
};

type MediaRow = {
  record_id: string | null;
  url: string | null;
  thumb_url: string | null;
  storage_path: string | null;
  thumb_path: string | null;
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
  categoryIcon: UiIconName;
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
  followedAt: string | null;
};

type FollowUserCard = {
  id: string;
  username: string;
  avatarUrl: string | null;
  latestRecordTime: string | null;
  publicArchiveCount: number;
  recentArchiveTitles: string[];
  followedAt: string | null;
  publicArchives: FollowProjectCard[];
};

export default function FollowPage() {
  const router = useRouter();
  const { language, t } = useLanguage();
  const followT = t.follow;
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>(() => getInitialTabFromUrl());
  const [keyword, setKeyword] = useState("");
  const [projectStatus, setProjectStatus] = useState<ProjectStatusFilter>("all");
  const [projectCards, setProjectCards] = useState<FollowProjectCard[]>([]);
  const [userCards, setUserCards] = useState<FollowUserCard[]>([]);
  const [projectLoadError, setProjectLoadError] = useState(false);
  const [userProjectsError, setUserProjectsError] = useState(false);
  const [loadVersion, setLoadVersion] = useState(0);
  const [selectedUserId, setSelectedUserId] = useState<string>("all");
  const [readUpdates, setReadUpdates] = useState<Record<string, string>>(() => {
    if (typeof window === "undefined") return {};
    try {
      return JSON.parse(localStorage.getItem("lifespace-follow-read") || "{}");
    } catch {
      return {};
    }
  });
  const [projectConfirmId, setProjectConfirmId] = useState<string | null>(null);
  const [userConfirmId, setUserConfirmId] = useState<string | null>(null);
  const [projectSubmitting, setProjectSubmitting] = useState(false);
  const [userSubmitting, setUserSubmitting] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [projectMenuOpenId, setProjectMenuOpenId] = useState<string | null>(null);
  const [userMenuTargetId, setUserMenuTargetId] = useState<string | null>(null);
  const [pinnedUserIds, setPinnedUserIds] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const value = JSON.parse(localStorage.getItem("lifespace-follow-pinned") || "[]");
      return Array.isArray(value)
        ? value.filter((item): item is string => typeof item === "string")
        : [];
    } catch {
      return [];
    }
  });
  const userLongPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userLongPressedIdRef = useRef<string | null>(null);

  useEffect(() => {
    function updateViewportMode() {
      setIsMobileViewport(window.innerWidth < 760);
    }

    updateViewportMode();
    window.addEventListener("resize", updateViewportMode);

    return () => window.removeEventListener("resize", updateViewportMode);
  }, []);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setProjectLoadError(false);
      setUserProjectsError(false);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push(buildLoginHref(getCurrentInternalPath()));
        return;
      }

      setCurrentUserId(user.id);

      const [archiveFollowsResult, userFollowsResult] = await Promise.all([
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

      if (archiveFollowsResult.error) {
        console.error("load followed projects error:", archiveFollowsResult.error);
        setProjectLoadError(true);
      }
      if (userFollowsResult.error) {
        console.error("load followed users error:", userFollowsResult.error);
        setUserProjectsError(true);
      }

      const archiveFollowRows = (archiveFollowsResult.data || []) as ArchiveFollowRow[];
      const userFollowRows = (userFollowsResult.data || []) as UserFollowRow[];

      const archiveIds = unique(archiveFollowRows.map((item) => item.archive_id).filter(Boolean));
      const followedUserIds = unique(
        userFollowRows.map((item) => item.following_id).filter(Boolean)
      );

      const archivesPromise = archiveIds.length
        ? supabase
            .from("archives")
            .select(
              "id, user_id, title, category, system_name, species_name_snapshot, group_tag_id, sub_tag_id, created_at, status, ended_at, help_status, record_count, last_record_time, view_count, cover_image_url, cover_image_path, cover_thumb_path"
            )
            .in("id", archiveIds)
            .eq("is_public", true)
        : Promise.resolve({ data: [] as ArchiveRow[], error: null });

      const followedUsersProjectsPromise = followedUserIds.length
        ? fetchAllFollowedPublicProjects()
        : Promise.resolve({ items: [] as DiscoveryProjectFeedItem[], error: null });

      const recordsPromise = archiveIds.length
        ? supabase
            .from("records")
            .select("id, archive_id, note, record_time, primary_image_url")
            .in("archive_id", archiveIds)
            .order("record_time", { ascending: false })
        : Promise.resolve({ data: [] as RecordRow[], error: null });

      const [archivesResult, followedUsersProjectsResult, recordsResult] =
        await Promise.all([archivesPromise, followedUsersProjectsPromise, recordsPromise]);

      const archives = (archivesResult.data || []) as ArchiveRow[];
      const followedUsersProjects = followedUsersProjectsResult.items;
      const records = (recordsResult.data || []) as RecordRow[];

      if (archivesResult.error || recordsResult.error) {
        console.error("load followed project details error:", {
          archives: archivesResult.error,
          records: recordsResult.error,
        });
        setProjectLoadError(true);
      }

      if (followedUsersProjectsResult.error) {
        console.error("load followed users' public projects error:", followedUsersProjectsResult.error);
        setUserProjectsError(true);
      }

      const profileIds = unique([
        ...archives.map((item) => item.user_id),
        ...followedUserIds,
      ]);
      const subTagIds = unique(archives.map((item) => item.sub_tag_id).filter(Boolean)) as string[];
      const groupTagIds = unique(archives.map((item) => item.group_tag_id).filter(Boolean)) as string[];

      const [profilesResult, subTagsResult, groupTagsResult] = await Promise.all([
        profileIds.length
          ? supabase.from("public_profiles").select(PUBLIC_PROFILE_SELECT).in("id", profileIds)
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

      const latestRecordIds = Array.from(latestRecordMap.values()).map(
        (record) => record.id
      );
      const latestMediaMap = new Map<string, MediaRow>();

      if (latestRecordIds.length > 0) {
        const { data: mediaRows, error: mediaError } = await supabase
          .from("media")
          .select("record_id, url, thumb_url, storage_path, thumb_path, sort_order, created_at")
          .in("record_id", latestRecordIds)
          .eq("type", "image")
          .order("sort_order", { ascending: true })
          .order("created_at", { ascending: true });

        if (mediaError) {
          console.error("load followed project media error:", mediaError);
        } else {
          ((mediaRows || []) as MediaRow[]).forEach((media) => {
            if (!media.record_id || latestMediaMap.has(media.record_id)) return;
            latestMediaMap.set(media.record_id, media);
          });
        }
      }

      const projectCoverPairs = await resolveMediaDisplayPairs(
        supabase,
        archives.map((archive) => {
          const latestRecord = latestRecordMap.get(archive.id);
          const latestMedia = latestRecord
            ? latestMediaMap.get(latestRecord.id)
            : null;

          if (archive.cover_image_path || archive.cover_image_url) {
            return {
              url: archive.cover_image_url,
              path: archive.cover_image_path,
              thumb_path: archive.cover_thumb_path,
            };
          }

          return (
            latestMedia || {
              url: latestRecord?.primary_image_url || null,
            }
          );
        })
      );

      const nextProjectCards = archives
        .map((archive, index) => {
          const latestRecord = latestRecordMap.get(archive.id);
          const profile = profileMap.get(archive.user_id);
          const systemName =
            archive.system_name || archive.species_name_snapshot || followT.not_provided;
          const endBase = archive.ended_at || archive.last_record_time || new Date().toISOString();

          return {
            id: archive.id,
            title: archive.title || followT.untitled_project,
            displaySystemName: systemName,
            ownerId: archive.user_id,
            ownerName: profile?.username || followT.username_not_set,
            ownerAvatarUrl: profile?.avatar_url || null,
            categoryLabel: getArchiveCategoryLabel(archive.category, language),
            categoryIcon: getArchiveCategoryIcon(archive.category),
            subTagName: archive.sub_tag_id ? subTagMap.get(archive.sub_tag_id) || "" : "",
            groupTagName: archive.group_tag_id
              ? groupTagMap.get(archive.group_tag_id) || ""
              : "",
            latestNote: latestRecord?.note?.trim() || followT.new_record,
            latestRecordTime: latestRecord?.record_time || archive.last_record_time || null,
            recordCount: Number(archive.record_count || 0),
            durationDays: getDurationDays(archive.created_at, endBase),
            viewCount: Number(archive.view_count || 0),
            statusLabel: getProjectStatusLabel(archive.help_status, archive.status, followT),
            statusKind: getProjectStatusKind(archive.help_status, archive.status),
            coverUrl:
              projectCoverPairs[index]?.display_thumb_url ||
              projectCoverPairs[index]?.display_url ||
              null,
            followedAt: archiveFollowRows.find((row) => row.archive_id === archive.id)?.created_at || null,
          } satisfies FollowProjectCard;
        })
        .sort(byRecentProject);

      const publicArchiveMap = new Map<string, FollowProjectCard[]>();
      followedUsersProjects.forEach((project) => {
        if (!project.owner_user_id) return;
        if (!publicArchiveMap.has(project.owner_user_id)) {
          publicArchiveMap.set(project.owner_user_id, []);
        }
        const profile = profileMap.get(project.owner_user_id);
        const statusKind = project.has_public_help
          ? "help"
          : project.archive_ended_at
            ? "ended"
            : "normal";
        publicArchiveMap.get(project.owner_user_id)?.push({
          id: project.archive_id,
          title: project.archive_title || followT.untitled_project,
          displaySystemName: project.system_name || project.species_name_snapshot || followT.not_provided,
          ownerId: project.owner_user_id,
          ownerName: project.profile_display_name || profile?.username || followT.username_not_set,
          ownerAvatarUrl: project.profile_avatar_url || profile?.avatar_url || null,
          categoryLabel: getArchiveCategoryLabel(project.category, language),
          categoryIcon: getArchiveCategoryIcon(project.category),
          subTagName: "",
          groupTagName: "",
          latestNote: project.card_summary?.trim() || followT.new_record,
          latestRecordTime: project.public_activity_at || null,
          recordCount: Number(project.public_record_count || 0),
          durationDays: getDurationDays(
            project.archive_created_at,
            project.archive_ended_at || project.public_activity_at
          ),
          viewCount: Number(project.view_count || 0),
          statusLabel:
            statusKind === "help"
              ? followT.status_open
              : statusKind === "ended"
                ? followT.status_ended
                : followT.status_ongoing,
          statusKind,
          coverUrl: project.display_image_url || null,
          followedAt: null,
        });
      });

      const nextUserCards = followedUserIds
        .map((followedId) => {
          const profile = profileMap.get(followedId);
          const archivesOfUser = (publicArchiveMap.get(followedId) || []).sort(
            (a, b) => getTimeValue(b.latestRecordTime) - getTimeValue(a.latestRecordTime)
          );
          const followedAt = userFollowRows.find((row) => row.following_id === followedId)?.created_at || null;

          return {
            id: followedId,
            username: profile?.username || followT.username_not_set,
            avatarUrl: profile?.avatar_url || null,
            latestRecordTime: archivesOfUser[0]?.latestRecordTime || null,
            publicArchiveCount: archivesOfUser.length,
            recentArchiveTitles: archivesOfUser.slice(0, 3).map((item) => item.title),
            followedAt,
            publicArchives: archivesOfUser,
          } satisfies FollowUserCard;
        })
        .sort((a, b) => getTimeValue(b.followedAt) - getTimeValue(a.followedAt));

      setProjectCards(nextProjectCards);
      setUserCards(nextUserCards);
      setLoading(false);
    }

    load();
  }, [followT, language, loadVersion, router]);

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
    const pinned = new Set(pinnedUserIds);
    return userCards
      .filter((item) => {
        if (!search) return true;
        return [item.username, ...item.recentArchiveTitles]
          .join(" ")
          .toLowerCase()
          .includes(search);
      })
      .sort((a, b) => {
        const pinDifference = Number(pinned.has(b.id)) - Number(pinned.has(a.id));
        if (pinDifference) return pinDifference;
        return getTimeValue(b.followedAt) - getTimeValue(a.followedAt);
      });
  }, [keyword, pinnedUserIds, userCards]);

  const selectedUserProjects = useMemo(() => {
    const users = selectedUserId === "all"
      ? filteredUserCards
      : filteredUserCards.filter((item) => item.id === selectedUserId);
    return users.flatMap((item) => item.publicArchives).sort(byRecentProject);
  }, [filteredUserCards, selectedUserId]);

  function hasUnread(key: string, updatedAt: string | null, followedAt: string | null) {
    if (!updatedAt) return false;
    const baseline = readUpdates[key] || followedAt;
    return Boolean(baseline && getTimeValue(updatedAt) > getTimeValue(baseline));
  }

  function markRead(key: string, updatedAt: string | null) {
    if (!updatedAt) return;
    setReadUpdates((current) => {
      const next = { ...current, [key]: updatedAt };
      localStorage.setItem("lifespace-follow-read", JSON.stringify(next));
      return next;
    });
  }

  function clearUserLongPressTimer() {
    if (userLongPressTimerRef.current) clearTimeout(userLongPressTimerRef.current);
    userLongPressTimerRef.current = null;
  }

  function beginUserLongPress(
    event: ReactPointerEvent<HTMLButtonElement>,
    userId: string
  ) {
    if (!isMobileViewport) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    clearUserLongPressTimer();
    userLongPressedIdRef.current = null;
    userLongPressTimerRef.current = setTimeout(() => {
      userLongPressedIdRef.current = userId;
      setUserMenuTargetId(userId);
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        navigator.vibrate?.(12);
      }
    }, 520);
  }

  function togglePinnedUser(userId: string) {
    setPinnedUserIds((current) => {
      const next = current.includes(userId)
        ? current.filter((id) => id !== userId)
        : [userId, ...current];
      localStorage.setItem("lifespace-follow-pinned", JSON.stringify(next));
      return next;
    });
    setUserMenuTargetId(null);
  }

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
      showToast(followT.unfollow_failed);
      return;
    }

    setProjectCards((prev) => prev.filter((item) => item.id !== archiveId));
    setProjectSubmitting(false);
    setProjectConfirmId(null);
    showToast(followT.project_unfollowed);
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
      showToast(followT.unfollow_failed);
      return;
    }

    setUserCards((prev) => prev.filter((item) => item.id !== userId));
    setPinnedUserIds((current) => {
      const next = current.filter((id) => id !== userId);
      localStorage.setItem("lifespace-follow-pinned", JSON.stringify(next));
      return next;
    });
    setSelectedUserId((current) => current === userId ? "all" : current);
    setUserMenuTargetId(null);
    setUserSubmitting(false);
    setUserConfirmId(null);
    showToast(followT.user_unfollowed);
  }

  return (
    <>
      {isMobileViewport ? (
        <MobileContentTopBar
          ariaLabel={followT.title}
          searchLabel={tab === "projects" ? followT.search_projects : followT.search_users}
          onSearch={() => setMobileSearchOpen((open) => !open)}
          items={[
            {
              key: "projects",
              label: `${followT.projects} (${projectCards.length})`,
              active: tab === "projects",
              onClick: () => setTab("projects"),
            },
            {
              key: "users",
              label: `${followT.users} (${userCards.length})`,
              active: tab === "users",
              onClick: () => setTab("users"),
            },
          ]}
        />
      ) : null}
      <main style={isMobileViewport ? mobilePageStyle : pageStyle}>
      {!isMobileViewport ? (
        <section style={heroStyle}>
          <h1 style={titleStyle}>{followT.title}</h1>

          <div style={summaryWrapStyle}>
            <SummaryCard label={followT.projects} value={projectCards.length} />
            <SummaryCard label={followT.users} value={userCards.length} />
          </div>
        </section>
      ) : null}

      <section style={isMobileViewport ? mobilePanelStyle : panelStyle}>
        {!isMobileViewport ? <div style={tabRowStyle}>
          <button
            type="button"
            onClick={() => setTab("projects")}
            style={tabButtonStyle(tab === "projects")}
          >
            {isMobileViewport ? `${followT.projects} (${projectCards.length})` : followT.projects}
          </button>
          <button
            type="button"
            onClick={() => setTab("users")}
            style={tabButtonStyle(tab === "users")}
          >
            {isMobileViewport ? `${followT.users} (${userCards.length})` : followT.users}
          </button>
        </div> : null}

        {!isMobileViewport || mobileSearchOpen ? <div style={isMobileViewport ? mobileToolbarStyle : toolbarStyle}>
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder={tab === "projects" ? followT.search_projects : followT.search_users}
            style={isMobileViewport ? mobileSearchInputStyle : searchInputStyle}
          />

          {tab === "projects" ? (
            <select
              value={projectStatus}
              onChange={(e) => setProjectStatus(e.target.value as ProjectStatusFilter)}
              style={isMobileViewport ? mobileSelectStyle : selectStyle}
            >
              <option value="all">{followT.status_all}</option>
              <option value="open">{followT.status_open}</option>
              <option value="resolved">{followT.status_resolved}</option>
              <option value="ended">{followT.status_ended}</option>
            </select>
          ) : null}
        </div> : null}

        {loading ? (
          <div style={emptyWrapStyle}>{followT.loading}</div>
        ) : tab === "projects" ? (
          projectLoadError ? (
            <div style={emptyWrapStyle}>
              <div>{followT.project_load_failed}</div>
              <button
                type="button"
                onClick={() => setLoadVersion((value) => value + 1)}
                style={{ ...ghostButtonStyle, marginTop: 14 }}
              >
                {followT.reload}
              </button>
            </div>
          ) : filteredProjectCards.length ? (
            <div style={listStyle}>
              {filteredProjectCards.map((item) => {
                const meta = [item.displaySystemName, item.ownerName];
                const separateStats = isMobileViewport && language === "en";
                if (item.subTagName) meta.push(item.subTagName);
                if (item.groupTagName) meta.push(item.groupTagName);

                return (
                  <article
                    key={item.id}
                    role={isMobileViewport ? "link" : undefined}
                    tabIndex={isMobileViewport ? 0 : undefined}
                    onClick={() => {
                      if (isMobileViewport) {
                        markRead(`project:${item.id}`, item.latestRecordTime);
                        router.push(`/archive/${item.id}`);
                      }
                    }}
                    onKeyDown={(event) => {
                      if (isMobileViewport && (event.key === "Enter" || event.key === " ")) {
                        router.push(`/archive/${item.id}`);
                      }
                    }}
                    style={{ ...cardStyle, cursor: isMobileViewport ? "pointer" : undefined }}
                  >
                    <div style={coverStyle}>
                      {item.coverUrl ? (
                        <img src={item.coverUrl} alt="" style={coverImageStyle} />
                      ) : (
                        <UiIcon name={item.categoryIcon} size={32} strokeWidth={1.6} />
                      )}
                    </div>

                    <div style={cardBodyStyle}>
                      <div style={cardInlineTitleRowStyle}>
                        <span style={language === "en" ? projectInlineMetaEnglishStyle : projectInlineMetaStyle}>{item.categoryLabel} ·</span>
                        <span style={projectTitleInlineStyle}>{item.title}</span>
                        {hasUnread(`project:${item.id}`, item.latestRecordTime, item.followedAt) ? (
                          <span style={unreadDotStyle} title={followT.new_record} />
                        ) : null}
                        {separateStats ? null : <ProjectMetaLine recordCount={item.recordCount} durationDays={item.durationDays} />}
                        {item.statusKind !== "normal" ? (
                          <StatusBadge kind={item.statusKind}>{item.statusLabel}</StatusBadge>
                        ) : null}
                        {isMobileViewport ? (
                          <div style={followCardMenuWrapStyle} onClick={(event) => event.stopPropagation()}>
                            <button
                              type="button"
                              aria-label={t.nav.more_actions}
                              onClick={() => setProjectMenuOpenId((id) => id === item.id ? null : item.id)}
                              style={followCardMoreButtonStyle}
                            >
                              <UiIcon name="more" size={18} />
                            </button>
                            {projectMenuOpenId === item.id ? (
                              <div style={followCardMenuStyle}>
                                <button type="button" onClick={() => router.push(`/user/${item.ownerId}`)} style={followCardMenuItemStyle}>
                                  {followT.enter_space}
                                </button>
                                <button type="button" onClick={() => { setProjectMenuOpenId(null); setProjectConfirmId(item.id); }} style={followCardDangerMenuItemStyle}>
                                  {followT.unfollow}
                                </button>
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </div>

                      <div style={metaLineStyle}>{meta.filter(Boolean).join(" · ") || followT.projects}</div>

                      {separateStats ? (
                        <ProjectMetaLine
                          recordCount={item.recordCount}
                          durationDays={item.durationDays}
                          style={{ fontSize: 11, gap: "3px 8px" }}
                        />
                      ) : null}

                      <div style={noteLineStyle}>
                        {item.latestNote}
                        {item.latestRecordTime ? (
                          <>
                            <span aria-hidden="true"> · </span>
                            <CompactActivityTime value={item.latestRecordTime} />
                          </>
                        ) : null}
                      </div>

                      {!isMobileViewport ? <div style={buttonRowStyle}>
                        <button
                          type="button"
                          onClick={() => {
                            markRead(`project:${item.id}`, item.latestRecordTime);
                            router.push(`/archive/${item.id}`);
                          }}
                          style={primaryButtonStyle}
                        >
                          {followT.view_records}
                        </button>
                        <button
                          type="button"
                          onClick={() => setProjectConfirmId(item.id)}
                          style={ghostButtonStyle}
                        >
                          {followT.unfollow}
                        </button>
                        <Link href={`/user/${item.ownerId}`} style={textLinkStyle}>
                          {followT.enter_space}
                        </Link>
                      </div> : null}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <EmptyState
              title={followT.empty_projects}
              description={followT.empty_projects_intro}
              actionLabel={followT.browse_discover}
              href="/discover"
            />
          )
        ) : filteredUserCards.length ? (
          <div>
            <div style={followedUserRailStyle}>
              <button
                type="button"
                onClick={() => setSelectedUserId("all")}
                style={followedUserAllButtonStyle(selectedUserId === "all")}
              >
                <span>{followT.status_all}</span>
              </button>
              {filteredUserCards.map((item) => {
                const unread = hasUnread(`user:${item.id}`, item.latestRecordTime, item.followedAt);
                return (
                  <div key={item.id} style={followedUserItemWrapStyle}>
                    <button
                      type="button"
                      onPointerDown={(event) => beginUserLongPress(event, item.id)}
                      onPointerUp={clearUserLongPressTimer}
                      onPointerLeave={clearUserLongPressTimer}
                      onPointerCancel={clearUserLongPressTimer}
                      onContextMenu={(event) => {
                        if (!isMobileViewport) return;
                        event.preventDefault();
                        clearUserLongPressTimer();
                        userLongPressedIdRef.current = item.id;
                        setUserMenuTargetId(item.id);
                      }}
                      onClick={(event) => {
                        if (userLongPressedIdRef.current === item.id) {
                          event.preventDefault();
                          userLongPressedIdRef.current = null;
                          return;
                        }
                        setSelectedUserId(item.id);
                        markRead(`user:${item.id}`, item.latestRecordTime);
                      }}
                      title={isMobileViewport ? followT.long_press_user_hint : undefined}
                      style={followedUserPillStyle(selectedUserId === item.id)}
                    >
                      <span style={{ position: "relative" }}>
                        {item.avatarUrl ? (
                          <img src={item.avatarUrl} alt="" style={userAvatarSmallStyle} />
                        ) : (
                          <span style={userAvatarFallbackSmallStyle}><UiIcon name="sprout" size={18} /></span>
                        )}
                        {unread ? <span style={railUnreadDotStyle} /> : null}
                        {pinnedUserIds.includes(item.id) ? <span style={railPinnedDotStyle} /> : null}
                      </span>
                      <span style={railUsernameStyle}>{item.username}</span>
                    </button>
                    {!isMobileViewport ? (
                      <Link
                        href={`/user/${item.id}`}
                        aria-label={`${followT.enter_space}: ${item.username}`}
                        title={followT.enter_space}
                        style={followedUserSpaceShortcutStyle}
                      >
                        <UiIcon name="arrow-right" size={12} strokeWidth={2} />
                      </Link>
                    ) : null}
                  </div>
                );
              })}
            </div>

            {!isMobileViewport && selectedUserId !== "all" ? (
              <div style={selectedUserActionStyle}>
                <Link href={`/user/${selectedUserId}`} style={textLinkStyle}>{followT.enter_space}</Link>
                <button type="button" onClick={() => setUserConfirmId(selectedUserId)} style={ghostButtonStyle}>
                  {followT.unfollow}
                </button>
              </div>
            ) : null}

            {userProjectsError ? (
              <div style={emptyWrapStyle}>
                <div>{followT.user_projects_load_failed}</div>
                <button
                  type="button"
                  onClick={() => setLoadVersion((value) => value + 1)}
                  style={{ ...ghostButtonStyle, marginTop: 14 }}
                >
                  {followT.reload}
                </button>
              </div>
            ) : selectedUserProjects.length ? (
              <div style={listStyle}>
                {selectedUserProjects.map((item) => (
                  <article key={`${item.ownerId}-${item.id}`} style={cardStyle}>
                    <button
                      type="button"
                      onClick={() => router.push(`/archive/${item.id}`)}
                      style={projectCoverButtonStyle}
                    >
                      <span style={coverStyle}>
                        {item.coverUrl ? <img src={item.coverUrl} alt="" style={coverImageStyle} /> : <UiIcon name={item.categoryIcon} size={32} />}
                      </span>
                    </button>
                    <div style={cardBodyStyle}>
                      <div style={cardInlineTitleRowStyle}>
                        <span style={language === "en" ? projectInlineMetaEnglishStyle : projectInlineMetaStyle}>{item.categoryLabel} ·</span>
                        <button type="button" onClick={() => router.push(`/archive/${item.id}`)} style={projectTitleButtonStyle}>
                          {item.title}
                        </button>
                      </div>
                      <div style={metaLineStyle}>{item.displaySystemName} · {item.ownerName}</div>
                      <ProjectMetaLine recordCount={item.recordCount} durationDays={item.durationDays} updatedAt={item.latestRecordTime} />
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div style={isMobileViewport ? compactEmptyTextStyle : emptyWrapStyle}>
                {selectedUserId === "all"
                  ? followT.empty_followed_user_projects_short
                  : followT.empty_selected_user_projects}
              </div>
            )}
          </div>
        ) : (
          <EmptyState
            title={followT.empty_users}
            description={isMobileViewport ? "" : followT.empty_users_intro}
            actionLabel={followT.browse_discover}
            href="/discover"
          />
        )}
      </section>

      {isMobileViewport && userMenuTargetId ? (
        <div style={userActionBackdropStyle} onClick={() => setUserMenuTargetId(null)}>
          <section
            role="dialog"
            aria-modal="true"
            aria-label={userCards.find((item) => item.id === userMenuTargetId)?.username || followT.users}
            style={userActionSheetStyle}
            onClick={(event) => event.stopPropagation()}
          >
            <div style={userActionTitleStyle}>
              {userCards.find((item) => item.id === userMenuTargetId)?.username || followT.username_not_set}
            </div>
            <button
              type="button"
              onClick={() => togglePinnedUser(userMenuTargetId)}
              style={userActionButtonStyle}
            >
              {pinnedUserIds.includes(userMenuTargetId) ? followT.unpin_user : followT.pin_user}
            </button>
            <button
              type="button"
              onClick={() => router.push(`/user/${userMenuTargetId}`)}
              style={userActionButtonStyle}
            >
              {followT.enter_space}
            </button>
            <button
              type="button"
              onClick={() => {
                setUserMenuTargetId(null);
                setUserConfirmId(userMenuTargetId);
              }}
              style={userActionDangerButtonStyle}
            >
              {followT.unfollow}
            </button>
            <button
              type="button"
              onClick={() => setUserMenuTargetId(null)}
              style={userActionCancelButtonStyle}
            >
              {followT.back}
            </button>
          </section>
        </div>
      ) : null}

      <ConfirmDialog
        open={!!projectConfirmId}
        title={followT.unfollow_project_title}
        message={followT.unfollow_project_message}
        confirmText={projectSubmitting ? followT.processing : followT.unfollow}
        cancelText={followT.back}
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
        title={followT.unfollow_user_title}
        message={followT.unfollow_user_message}
        confirmText={userSubmitting ? followT.processing : followT.unfollow}
        cancelText={followT.back}
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
    </>
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
      {description ? (
        <div style={{ marginTop: 8, color: "#7b8578", fontSize: 14 }}>{description}</div>
      ) : null}
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
        padding: "2px 7px",
        borderRadius: 999,
        fontSize: 11,
        whiteSpace: "nowrap",
        ...palette[kind],
      }}
    >
      {children}
    </span>
  );
}

function getInitialTabFromUrl(): TabKey {
  if (typeof window === "undefined") return "projects";
  const tab = new URLSearchParams(window.location.search).get("tab");
  return tab === "users" ? "users" : "projects";
}

async function fetchAllFollowedPublicProjects() {
  const items: DiscoveryProjectFeedItem[] = [];
  let cursor: DiscoveryProjectCursor | null = null;

  do {
    const result = await fetchFollowedPublicProjects({ cursor, limit: 49 });
    if (result.error) {
      return { items: [] as DiscoveryProjectFeedItem[], error: result.error };
    }

    items.push(...result.items);
    cursor = result.nextCursor;
  } while (cursor);

  return { items, error: null };
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

function getProjectStatusLabel(
  helpStatus: string | null | undefined,
  status: string | null | undefined,
  labels: { status_open: string; status_resolved: string; status_ended: string; status_ongoing: string }
) {
  if (helpStatus === "open") return labels.status_open;
  if (helpStatus === "resolved") return labels.status_resolved;
  if (status === "ended") return labels.status_ended;
  return labels.status_ongoing;
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

const mobilePageStyle: React.CSSProperties = {
  maxWidth: 1120,
  margin: "0 auto",
  padding: "8px 10px 28px",
};

const heroStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 16,
  flexWrap: "wrap",
  marginBottom: 18,
};

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 30,
  lineHeight: 1.2,
  color: "#243024",
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

const mobilePanelStyle: React.CSSProperties = {
  background: "transparent",
  border: 0,
  borderRadius: 0,
  boxShadow: "none",
  padding: 0,
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

const mobileToolbarStyle: React.CSSProperties = {
  display: "flex",
  gap: 6,
  marginBottom: 8,
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

const mobileSearchInputStyle: React.CSSProperties = {
  ...searchInputStyle,
  minWidth: 0,
  height: 38,
  padding: "0 10px",
  borderRadius: 10,
  fontSize: 13,
};

const selectStyle: React.CSSProperties = {
  borderRadius: 14,
  border: "1px solid #dfe7d8",
  background: "#fafcf8",
  padding: "12px 14px",
  fontSize: 14,
  color: "#465245",
};

const mobileSelectStyle: React.CSSProperties = {
  ...selectStyle,
  minWidth: 92,
  height: 38,
  padding: "0 8px",
  borderRadius: 10,
  fontSize: 12,
};

const listStyle: React.CSSProperties = {
  display: "grid",
  gap: 10,
};

const cardStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "100px minmax(0, 1fr)",
  gap: 10,
  padding: 8,
  border: "1px solid #ebf0e7",
  borderRadius: 16,
  background: "#fff",
  alignItems: "start",
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
  width: 100,
  height: 100,
  minHeight: 100,
  maxHeight: 100,
  alignSelf: "start",
  borderRadius: 14,
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
  gridTemplateRows: "auto auto auto auto",
  gap: 3,
  alignContent: "space-between",
};

const cardInlineTitleRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-start",
  gap: 5,
  minWidth: 0,
  overflow: "hidden",
  whiteSpace: "nowrap",
};

const cardTopRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 10,
  minWidth: 0,
};

const projectTitleStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 700,
  color: "#253125",
};

const projectTitleInlineStyle: React.CSSProperties = {
  ...projectTitleStyle,
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};


const projectInlineMetaStyle: React.CSSProperties = {
  fontSize: 11,
  color: "#7b8578",
  fontWeight: 600,
};

const projectInlineMetaEnglishStyle: React.CSSProperties = {
  ...projectInlineMetaStyle,
  maxWidth: "42%",
  overflow: "hidden",
  textOverflow: "ellipsis",
  fontSize: 10.5,
};

const metaLineStyle: React.CSSProperties = {
  color: "#7a8578",
  fontSize: 11,
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const noteLineStyle: React.CSSProperties = {
  color: "#334033",
  fontSize: 12,
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
  gap: 5,
  alignItems: "center",
  flexWrap: "nowrap",
  overflow: "hidden",
  marginTop: 0,
};

const primaryButtonStyle: React.CSSProperties = {
  border: "none",
  background: "#4f7b45",
  color: "#fff",
  borderRadius: 999,
  padding: "4px 8px",
  cursor: "pointer",
  fontSize: 11,
  fontWeight: 600,
  whiteSpace: "nowrap",
  flexShrink: 0,
};

const ghostButtonStyle: React.CSSProperties = {
  border: "1px solid #dfe7d8",
  background: "#fff",
  color: "#445244",
  borderRadius: 999,
  padding: "4px 8px",
  cursor: "pointer",
  fontSize: 11,
  whiteSpace: "nowrap",
  flexShrink: 0,
};

const textLinkStyle: React.CSSProperties = {
  color: "#4f7b45",
  textDecoration: "none",
  fontSize: 11,
  fontWeight: 600,
  whiteSpace: "nowrap",
  flexShrink: 0,
};

const followCardMenuWrapStyle: React.CSSProperties = {
  position: "relative",
  marginLeft: "auto",
  flexShrink: 0,
};

const followCardMoreButtonStyle: React.CSSProperties = {
  width: 28,
  height: 28,
  display: "grid",
  placeItems: "center",
  border: "1px solid #e8ede4",
  borderRadius: 999,
  background: "#fff",
  color: "#697567",
  padding: 0,
  cursor: "pointer",
};

const followCardMenuStyle: React.CSSProperties = {
  position: "absolute",
  top: 34,
  right: 0,
  zIndex: 30,
  width: 124,
  display: "grid",
  gap: 2,
  padding: 5,
  border: "1px solid #e2e9df",
  borderRadius: 11,
  background: "#fff",
  boxShadow: "0 12px 28px rgba(39,58,34,0.16)",
};

const followCardMenuItemStyle: React.CSSProperties = {
  minHeight: 34,
  border: 0,
  borderRadius: 8,
  background: "transparent",
  color: "#40583a",
  padding: "0 9px",
  textAlign: "left",
  fontSize: 13,
  cursor: "pointer",
};

const followCardDangerMenuItemStyle: React.CSSProperties = {
  ...followCardMenuItemStyle,
  color: "#b5574f",
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

const unreadDotStyle: React.CSSProperties = {
  width: 8,
  height: 8,
  flex: "0 0 auto",
  borderRadius: "50%",
  background: "#d94c43",
};

const followedUserRailStyle: React.CSSProperties = {
  display: "flex",
  gap: 3,
  overflowX: "auto",
  padding: "0 1px 2px",
  marginBottom: 2,
  WebkitOverflowScrolling: "touch",
};

const followedUserItemWrapStyle: React.CSSProperties = {
  position: "relative",
  width: 56,
  flex: "0 0 56px",
};

function followedUserPillStyle(active: boolean): React.CSSProperties {
  return {
    width: 56,
    flex: "0 0 56px",
    display: "grid",
    justifyItems: "center",
    gap: 1,
    padding: "2px 2px 3px",
    border: active ? "1px solid #9fc796" : "1px solid transparent",
    borderRadius: 14,
    background: active ? "#eef7e8" : "transparent",
    color: active ? "#315f31" : "#566553",
    cursor: "pointer",
  };
}

const followedUserSpaceShortcutStyle: React.CSSProperties = {
  position: "absolute",
  top: 24,
  right: 1,
  width: 21,
  height: 21,
  display: "grid",
  placeItems: "center",
  border: "1px solid #d5dfd0",
  borderRadius: "50%",
  background: "rgba(255, 255, 255, 0.96)",
  color: "#587152",
  boxShadow: "0 2px 6px rgba(54, 78, 50, 0.10)",
  textDecoration: "none",
};

function followedUserAllButtonStyle(active: boolean): React.CSSProperties {
  return {
    minHeight: 32,
    alignSelf: "center",
    flex: "0 0 auto",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0 11px",
    border: active ? "1px solid #9fc796" : "1px solid #dfe7d9",
    borderRadius: 999,
    background: active ? "#eef7e8" : "#fff",
    color: active ? "#315f31" : "#566553",
    fontSize: 13,
    fontWeight: active ? 750 : 650,
    lineHeight: 1,
    whiteSpace: "nowrap",
    cursor: "pointer",
  };
}

const userAvatarSmallStyle: React.CSSProperties = {
  width: 35,
  height: 35,
  display: "block",
  borderRadius: "50%",
  objectFit: "cover",
};

const userAvatarFallbackSmallStyle: React.CSSProperties = {
  width: 35,
  height: 35,
  display: "grid",
  placeItems: "center",
  borderRadius: "50%",
  background: "#edf5e8",
  color: "#6f8f62",
};

const railUnreadDotStyle: React.CSSProperties = {
  ...unreadDotStyle,
  position: "absolute",
  top: 0,
  right: 0,
  boxShadow: "0 0 0 2px #fff",
};

const railPinnedDotStyle: React.CSSProperties = {
  position: "absolute",
  left: -1,
  bottom: 2,
  width: 9,
  height: 9,
  borderRadius: "50%",
  background: "#527f4c",
  boxShadow: "0 0 0 2px #fff",
};

const railUsernameStyle: React.CSSProperties = {
  width: "100%",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  fontSize: 11.5,
  fontWeight: 600,
  lineHeight: 1.1,
};

const selectedUserActionStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  alignItems: "center",
  gap: 8,
  margin: "0 2px 10px",
};

const compactEmptyTextStyle: React.CSSProperties = {
  padding: "18px 8px",
  color: "#879083",
  fontSize: 13,
  textAlign: "center",
};

const userActionBackdropStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 1500,
  display: "flex",
  alignItems: "flex-end",
  justifyContent: "center",
  padding: "16px 12px calc(16px + var(--app-safe-area-bottom))",
  background: "rgba(28, 38, 27, 0.32)",
};

const userActionSheetStyle: React.CSSProperties = {
  width: "min(100%, 420px)",
  display: "grid",
  gap: 8,
  padding: 16,
  border: "1px solid #dfe8da",
  borderRadius: 20,
  background: "#fff",
  boxShadow: "0 18px 46px rgba(25, 39, 24, 0.24)",
};

const userActionTitleStyle: React.CSSProperties = {
  marginBottom: 4,
  color: "#243524",
  fontSize: 18,
  fontWeight: 850,
  overflowWrap: "anywhere",
};

const userActionButtonStyle: React.CSSProperties = {
  minHeight: 48,
  border: "1px solid #dbe6d7",
  borderRadius: 13,
  background: "#f8fbf6",
  color: "#315c31",
  fontSize: 16,
  fontWeight: 750,
};

const userActionDangerButtonStyle: React.CSSProperties = {
  ...userActionButtonStyle,
  borderColor: "#efd5d2",
  background: "#fff8f7",
  color: "#ad5049",
};

const userActionCancelButtonStyle: React.CSSProperties = {
  ...userActionButtonStyle,
  background: "#fff",
  color: "#657264",
};

const projectCoverButtonStyle: React.CSSProperties = {
  border: 0,
  padding: 0,
  background: "transparent",
  cursor: "pointer",
};

const projectTitleButtonStyle: React.CSSProperties = {
  ...projectTitleInlineStyle,
  border: 0,
  padding: 0,
  background: "transparent",
  textAlign: "left",
  cursor: "pointer",
};
