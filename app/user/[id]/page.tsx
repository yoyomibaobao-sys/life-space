"use client";

import { supabase } from "@/lib/supabase";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import UserSpaceHeader from "@/components/user-space/UserSpaceHeader";
import UserSpaceFilters from "@/components/user-space/UserSpaceFilters";
import UserSpaceArchiveList from "@/components/user-space/UserSpaceArchiveList";
import { type MediaItem } from "@/lib/domain-types";
import { resolveMediaDisplayPairs } from "@/lib/media-urls";
import { type ArchiveCategory } from "@/lib/archive-categories";
import { buildLoginHref, getCurrentInternalPath } from "@/lib/auth-return";
import {
  canCreateMembershipContent,
  getCreateContentBlockedText,
  normalizeMembershipRpcResult,
} from "@/lib/membership";
import { showToast } from "@/components/Toast";
import { useLanguage } from "@/lib/i18n/useLanguage";
import type { UserSpaceTag } from "@/lib/user-space-types";

type Category = "all" | ArchiveCategory;

type UserSpaceArchive = {
  id: string;
  title: string | null;
  category: string | null;
  system_name: string | null;
  species_name_snapshot: string | null;
  sub_tag_id: string | null;
  group_tag_id: string | null;
  status: string | null;
  record_count: number | null;
  view_count: number | null;
  created_at?: string | null;
  ended_at?: string | null;
};

type UserSpaceRecord = {
  id: string;
  archive_id: string;
  note: string | null;
  record_time: string;
  primary_image_url: string | null;
  display_primary_image_url?: string | null;
  status?: string | null;
  status_tag?: string | null;
  media?: MediaItem[];
};

type UserSpaceSubTag = {
  id: string;
  name: string | null;
  category: string | null;
};

type UserSpaceGroupTag = {
  id: string;
  name: string | null;
  sub_tag_id: string | null;
};

type ArchiveFollowIdRow = {
  archive_id: string;
};

type UserSpaceArchiveStats = {
  count: number;
  latest: UserSpaceRecord;
  hasHelp: boolean;
};

function getMediaUrl(media?: MediaItem | null) {
  return media?.display_url || "";
}

function getMediaPreviewUrl(media?: MediaItem | null) {
  return media?.display_thumb_url || getMediaUrl(media);
}

export default function UserSpacePage() {
  const { language, t } = useLanguage();
  const params = useParams();
  const router = useRouter();
  const userId = params.id as string;

  const [username, setUsername] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [isFollowingUser, setIsFollowingUser] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [archives, setArchives] = useState<UserSpaceArchive[]>([]);
  const [records, setRecords] = useState<UserSpaceRecord[]>([]);
  const [subTags, setSubTags] = useState<UserSpaceSubTag[]>([]);
  const [groupTags, setGroupTags] = useState<UserSpaceGroupTag[]>([]);

  const [activeCategory, setActiveCategory] = useState<Category>("all");
  const [activeSubTag, setActiveSubTag] = useState<string | null>(null);
  const [activeGroupTag, setActiveGroupTag] = useState<string | null>(null);

  const [followedArchiveIds, setFollowedArchiveIds] = useState<string[]>([]);

  const loadingRef = useRef(false);

  async function loadData() {
    if (loadingRef.current) return;
    loadingRef.current = true;

    try {
      const { data: profile } = await supabase
        .from("public_profiles")
        .select("username, avatar_url")
        .eq("id", userId)
        .maybeSingle();

      setUsername(profile?.username || "");
      setAvatarUrl(profile?.avatar_url || null);

      const { data: archivesData } = await supabase
        .from("archives")
        .select("*")
        .eq("user_id", userId)
        .eq("is_public", true)
        .order("created_at", { ascending: false });

      const safeArchives = (archivesData || []) as UserSpaceArchive[];
      setArchives(safeArchives);

      const archiveIds = safeArchives.map((a) => a.id);

      const {
        data: { user },
      } = await supabase.auth.getUser();
      setViewerId(user?.id || null);

      const [subTagResult, groupTagResult, recordsResult, followsResult] =
        await Promise.all([
          supabase
            .from("sub_tags")
            .select("*")
            .eq("user_id", userId)
            .order("created_at", { ascending: true }),
          supabase.rpc("get_public_user_space_group_tags", {
            p_user_id: userId,
          }),
          archiveIds.length === 0
            ? Promise.resolve({ data: [] as UserSpaceRecord[] })
            : supabase
                .from("records")
                .select("*, media(*)")
                .in("archive_id", archiveIds)
                .eq("visibility", "public")
                .order("record_time", { ascending: false }),
          user?.id && archiveIds.length > 0
            ? supabase
                .from("archive_follows")
                .select("archive_id")
                .eq("user_id", user.id)
                .in("archive_id", archiveIds)
            : Promise.resolve({ data: [] as ArchiveFollowIdRow[] }),
        ]);

      setSubTags((subTagResult.data || []) as UserSpaceSubTag[]);
      setGroupTags((groupTagResult.data || []) as UserSpaceGroupTag[]);
      setRecords(
        await attachRecordMediaDisplayUrls(
          (recordsResult.data || []) as UserSpaceRecord[]
        )
      );
      setFollowedArchiveIds(
        ((followsResult.data || []) as ArchiveFollowIdRow[]).map(
          (row) => row.archive_id
        )
      );
      if (user?.id && user.id !== userId) {
        const { data: userFollow } = await supabase
          .from("follows")
          .select("following_id")
          .eq("follower_id", user.id)
          .eq("following_id", userId)
          .maybeSingle();
        setIsFollowingUser(Boolean(userFollow));
      } else {
        setIsFollowingUser(false);
      }
    } finally {
      loadingRef.current = false;
    }
  }

  async function attachRecordMediaDisplayUrls(
    nextRecords: UserSpaceRecord[]
  ): Promise<UserSpaceRecord[]> {
    const allMedia = nextRecords.flatMap((record) => record.media || []);
    const primarySourceCount = nextRecords.length;
    const displayPairs = await resolveMediaDisplayPairs(supabase, [
      ...nextRecords.map((record) => ({ url: record.primary_image_url })),
      ...allMedia,
    ]);
    const primaryPairs = displayPairs.slice(0, primarySourceCount);
    const displayMedia = allMedia.map((media, index) => ({
      ...media,
      ...displayPairs[primarySourceCount + index],
    }));
    const recordsWithDisplayPrimary = nextRecords.map((record, index) => ({
      ...record,
      display_primary_image_url:
        primaryPairs[index]?.display_url || null,
    }));

    let mediaIndex = 0;

    return recordsWithDisplayPrimary.map((record) => {
      const mediaCount = record.media?.length || 0;
      const media = displayMedia.slice(mediaIndex, mediaIndex + mediaCount);
      mediaIndex += mediaCount;
      return { ...record, media };
    });
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const publicArchiveIds = useMemo(
    () => new Set(archives.map((a) => a.id)),
    [archives]
  );

  const visibleSubTags = useMemo(() => {
    return subTags.filter((tag) =>
      archives.some((archive) => archive.sub_tag_id === tag.id)
    );
  }, [archives, subTags]);

  const visibleGroupTags = useMemo(() => {
    if (!activeSubTag) return [];

    return groupTags.filter((tag) => {
      if (tag.sub_tag_id !== activeSubTag) return false;

      return archives.some(
        (archive) =>
          archive.sub_tag_id === activeSubTag &&
          archive.group_tag_id === tag.id &&
          publicArchiveIds.has(archive.id)
      );
    });
  }, [activeSubTag, archives, groupTags, publicArchiveIds]);

  const statsMap = useMemo(() => {
    const map: Record<string, UserSpaceArchiveStats> = {};

    records.forEach((record) => {
      if (!map[record.archive_id]) {
        map[record.archive_id] = {
          count: 0,
          latest: record,
          hasHelp: false,
        };
      }

      map[record.archive_id].count += 1;

      if (record.status_tag === "help" || record.status === "help") {
        map[record.archive_id].hasHelp = true;
      }

      if (
        new Date(record.record_time).getTime() >
        new Date(map[record.archive_id].latest.record_time).getTime()
      ) {
        map[record.archive_id].latest = record;
      }
    });

    return map;
  }, [records]);

  const coverMap = useMemo(() => {
    const map: Record<string, string> = {};

    records.forEach((record) => {
      if (map[record.archive_id]) return;

      const media = record.media || [];
      if (media.length > 0) {
        const primaryMedia = media.find(
          (media) => media.url && record.primary_image_url && media.url === record.primary_image_url
        );
        const previewUrl = getMediaPreviewUrl(primaryMedia || media[0]);
        if (previewUrl) {
          map[record.archive_id] = previewUrl;
          return;
        }
      }

      if (record.display_primary_image_url) {
        map[record.archive_id] = record.display_primary_image_url;
      }
    });

    return map;
  }, [records]);

  const filteredArchives = useMemo(() => {
    return archives.filter((archive) => {
      if (activeCategory !== "all" && archive.category !== activeCategory) {
        return false;
      }

      if (activeSubTag && archive.sub_tag_id !== activeSubTag) {
        return false;
      }

      if (activeGroupTag && archive.group_tag_id !== activeGroupTag) {
        return false;
      }

      return true;
    });
  }, [archives, activeCategory, activeSubTag, activeGroupTag]);

  function selectCategory(category: Category) {
    setActiveCategory(category);
    setActiveSubTag(null);
    setActiveGroupTag(null);
  }

  function selectSubTag(tag: UserSpaceTag) {
    setActiveCategory((tag.category || "plant") as ArchiveCategory);
    setActiveSubTag(tag.id);
    setActiveGroupTag(null);
  }

  function selectGroupTag(tagId: string) {
    setActiveGroupTag((current) => (current === tagId ? null : tagId));
  }

  async function toggleUserFollow() {
    if (!viewerId) {
      router.push(buildLoginHref(getCurrentInternalPath()));
      return;
    }
    if (viewerId === userId || followBusy) return;

    setFollowBusy(true);
    if (isFollowingUser) {
      const { error } = await supabase
        .from("follows")
        .delete()
        .eq("follower_id", viewerId)
        .eq("following_id", userId);
      setFollowBusy(false);
      if (error) {
        showToast(t.profile.public_profile.unfollow_failed);
        return;
      }
      setIsFollowingUser(false);
      return;
    }

    const { data: membershipData, error: membershipError } =
      await supabase.rpc("get_my_membership");
    const membership = membershipError
      ? null
      : normalizeMembershipRpcResult(membershipData);
    if (!canCreateMembershipContent(membership)) {
      setFollowBusy(false);
      showToast(getCreateContentBlockedText(membership, language));
      return;
    }

    const { error } = await supabase.from("follows").insert({
      follower_id: viewerId,
      following_id: userId,
    });
    setFollowBusy(false);
    if (error) {
      showToast(t.profile.public_profile.follow_failed);
      return;
    }
    setIsFollowingUser(true);
  }

  return (
    <main
      style={{
        maxWidth: 980,
        margin: "0 auto",
        padding: "20px 16px 48px",
      }}
    >
      <UserSpaceHeader
        username={username}
        avatarUrl={avatarUrl}
        isSelf={viewerId === userId}
        isFollowing={isFollowingUser}
        followBusy={followBusy}
        onToggleFollow={() => void toggleUserFollow()}
      />
      <UserSpaceFilters
        activeCategory={activeCategory}
        activeSubTag={activeSubTag}
        activeGroupTag={activeGroupTag}
        visibleSubTags={visibleSubTags}
        visibleGroupTags={visibleGroupTags}
        visibleCategories={Array.from(new Set(archives.map((archive) => archive.category).filter(Boolean))) as string[]}
        onSelectCategory={selectCategory}
        onSelectSubTag={selectSubTag}
        onSelectGroupTag={selectGroupTag}
        onClearGroupTag={() => setActiveGroupTag(null)}
      />
      <UserSpaceArchiveList
        archives={filteredArchives}
        subTags={subTags}
        groupTags={groupTags}
        statsMap={statsMap}
        coverMap={coverMap}
        followedArchiveIds={followedArchiveIds}
        onOpenArchive={(archiveId) => router.push(`/archive/${archiveId}`)}
      />
    </main>
  );
}
