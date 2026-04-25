"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { showToast } from "@/components/Toast";
import ArchiveAddRecordSection from "@/components/archive-detail/ArchiveAddRecordSection";
import ArchiveDetailHeader from "@/components/archive-detail/ArchiveDetailHeader";
import ArchiveLightbox from "@/components/archive-detail/ArchiveLightbox";
import ArchivePrivateState from "@/components/archive-detail/ArchivePrivateState";
import ArchiveRecordCard from "@/components/archive-detail/ArchiveRecordCard";
import ConfirmDialog from "@/components/ConfirmDialog";
import {
  getArchiveCategoryLabel,
  isNonPlantArchiveCategory,
} from "@/lib/archive-categories";
import type {
  ArchiveDetailArchive,
  ArchiveMode,
  LightboxImage,
  PlantSpeciesLite,
  RecordItem,
  RecordQueryRow,
  RecordTagRow,
  RelatedTagCountRow,
} from "@/lib/archive-detail-types";
import type { MediaItem } from "@/lib/domain-types";
import { buildMediaList, getDisplayName } from "@/lib/archive-detail-utils";

export default function ArchiveDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  if (id === "new") return null;

  return <Content id={id} />;
}

function Content({ id }: { id: string }) {
  const [archive, setArchive] = useState<ArchiveDetailArchive | null>(null);
  const [species, setSpecies] = useState<PlantSpeciesLite | null>(null);
  const [records, setRecords] = useState<RecordItem[]>([]);
  const [me, setMe] = useState<string | null | undefined>(undefined);
  const [username, setUsername] = useState("用户");
  const [sameTagCounts, setSameTagCounts] = useState<Record<string, number>>({});
  const [isProjectFollowed, setIsProjectFollowed] = useState(false);
  const [lightboxImages, setLightboxImages] = useState<LightboxImage[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [deleteMediaTarget, setDeleteMediaTarget] = useState<{
    recordId: string;
    mediaId: string;
  } | null>(null);
  const [isDeletingMedia, setIsDeletingMedia] = useState(false);
  const [showUnfollowProjectConfirm, setShowUnfollowProjectConfirm] = useState(false);
  const [projectFollowSubmitting, setProjectFollowSubmitting] = useState(false);

  const searchParams = useSearchParams();
  const modeParam = searchParams.get("mode");
  const highlightedRecordId = searchParams.get("record");

  const startTime =
    records.length > 0 ? records[records.length - 1].record_time : archive?.created_at;

  const isLightboxOpen = lightboxImages.length > 0;

  useEffect(() => {
    async function load() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const currentUserId = session?.user?.id ?? null;
      setMe(currentUserId);

      const { data: archiveData } = await supabase
        .from("archives")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (!archiveData) return;

      const isOwnerView = currentUserId === archiveData.user_id;
      setArchive(archiveData as ArchiveDetailArchive);

      if (!archiveData.is_public && !isOwnerView) {
        setRecords([]);
        return;
      }

      if (archiveData.is_public && !isOwnerView) {
        const viewSessionKey = `archive_viewed_${archiveData.id}`;
        if (!window.sessionStorage.getItem(viewSessionKey)) {
          const { data: nextViewCount, error: viewError } = await supabase.rpc(
            "increment_archive_view_count",
            {
              p_archive_id: archiveData.id,
            }
          );

          if (!viewError) {
            window.sessionStorage.setItem(viewSessionKey, "1");
            if (typeof nextViewCount === "number") {
              setArchive((prev) => (prev ? { ...prev, view_count: nextViewCount } : prev));
            }
          }
        }
      }

      if (archiveData.species_id) {
        const { data: speciesData } = await supabase
          .from("plant_species")
          .select("*")
          .eq("id", archiveData.species_id)
          .maybeSingle();
        setSpecies((speciesData || null) as PlantSpeciesLite | null);
      } else {
        setSpecies(null);
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("username")
        .eq("id", archiveData.user_id)
        .maybeSingle();

      setUsername(profile?.username || "用户");

      if (currentUserId && !isOwnerView) {
        const { data: archiveFollow } = await supabase
          .from("archive_follows")
          .select("id")
          .eq("archive_id", archiveData.id)
          .eq("user_id", currentUserId)
          .maybeSingle();

        setIsProjectFollowed(Boolean(archiveFollow));
      } else {
        setIsProjectFollowed(false);
      }

      let recordsQuery = supabase
        .from("records")
        .select(
          `
          *,
          record_tags (
            tag,
            tag_type,
            source,
            is_active
          )
        `
        )
        .eq("archive_id", archiveData.id)
        .order("record_time", { ascending: false });

      if (!isOwnerView) {
        recordsQuery = recordsQuery.eq("visibility", "public");
      }

      const { data: recordsData } = await recordsQuery;
      const recs = (recordsData ?? []) as RecordQueryRow[];
      const recordIds = recs.map((item) => item.id);
      const mediaMap: Record<string, MediaItem[]> = {};

      if (recordIds.length > 0) {
        const { data: mediaRaw } = await supabase.from("media").select("*").in("record_id", recordIds);

        (mediaRaw as MediaItem[] | null)?.forEach((media) => {
          const recordId = media.record_id;
          if (!recordId) return;
          if (!mediaMap[recordId]) mediaMap[recordId] = [];
          mediaMap[recordId].push(media);
        });
      }

      const finalRecords: RecordItem[] = recs.map((record) => {
        const behaviorTags =
          record.record_tags
            ?.filter(
              (tag): tag is RecordTagRow & { tag: string } =>
                tag.tag_type === "behavior" &&
                tag.is_active !== false &&
                typeof tag.tag === "string"
            )
            .map((tag) => tag.tag) || [];

        const displayTags = Array.from(new Set(behaviorTags));
        const userBehaviorTags =
          record.record_tags
            ?.filter(
              (tag): tag is RecordTagRow & { tag: string } =>
                tag.tag_type === "behavior" &&
                tag.source === "user" &&
                tag.is_active !== false &&
                typeof tag.tag === "string"
            )
            .map((tag) => tag.tag) || [];

        return {
          ...record,
          media: mediaMap[record.id] || [],
          parsed_actions: displayTags,
          user_behavior_tags: userBehaviorTags,
          display_tags: displayTags,
        };
      });

      setRecords(finalRecords);
    }

    load();
  }, [id]);

  useEffect(() => {
    async function loadSameTagCounts() {
      const visibleTags = Array.from(
        new Set<string>(
          records.flatMap((record): string[] =>
            Array.isArray(record.display_tags)
              ? record.display_tags.filter(
                  (tag: unknown): tag is string => typeof tag === "string"
                )
              : []
          )
        )
      );

      if (visibleTags.length === 0 || !archive) {
        setSameTagCounts({});
        return;
      }

      let relatedQuery = supabase
        .from("records")
        .select(
          `
          id,
          record_tags (
            tag,
            tag_type,
            is_active
          ),
          archives!inner (
            id,
            category,
            species_id,
            species_name_snapshot,
            system_name,
            is_public
          )
        `
        )
        .eq("visibility", "public")
        .eq("archives.is_public", true);

      if (archive.category === "plant") {
        if (archive.species_id) {
          relatedQuery = relatedQuery.eq("archives.species_id", archive.species_id);
        } else if (archive.species_name_snapshot) {
          relatedQuery = relatedQuery.eq(
            "archives.species_name_snapshot",
            archive.species_name_snapshot
          );
        } else {
          setSameTagCounts({});
          return;
        }
      } else if (isNonPlantArchiveCategory(archive.category) && archive.system_name) {
        relatedQuery = relatedQuery
          .eq("archives.category", archive.category)
          .eq("archives.system_name", archive.system_name);
      } else {
        setSameTagCounts({});
        return;
      }

      const { data, error } = await relatedQuery;
      if (error) {
        console.error("same tag counts load error:", error);
        setSameTagCounts({});
        return;
      }

      const wantedTags = new Set<string>(visibleTags);
      const nextCounts: Record<string, number> = Object.fromEntries(
        visibleTags.map((tag: string) => [tag, 0])
      );

      ((data || []) as RelatedTagCountRow[]).forEach((record) => {
        const recordTags = Array.from(
          new Set<string>(
            (record.record_tags || [])
              .filter(
                (tagRow): tagRow is RecordTagRow & { tag: string } =>
                  tagRow.tag_type === "behavior" &&
                  tagRow.is_active !== false &&
                  typeof tagRow.tag === "string"
              )
              .map((tagRow) => tagRow.tag)
              .filter((tag: string) => wantedTags.has(tag))
          )
        );

        recordTags.forEach((tag: string) => {
          nextCounts[tag] = (nextCounts[tag] || 0) + 1;
        });
      });

      setSameTagCounts(nextCounts);
    }

    loadSameTagCounts();
  }, [records, archive]);

  useEffect(() => {
    if (!highlightedRecordId) return;
    const target = document.getElementById(`record-${highlightedRecordId}`);
    if (!target) return;
    setTimeout(() => {
      target.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 120);
  }, [highlightedRecordId, records]);

  useEffect(() => {
    if (!isLightboxOpen) return;

    const previousBodyOverflow = document.body.style.overflow;
    const previousBodyTouchAction = document.body.style.touchAction;

    document.body.style.overflow = "hidden";
    document.body.style.touchAction = "none";

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.body.style.touchAction = previousBodyTouchAction;
    };
  }, [isLightboxOpen]);


  const handleCommentCountChange = useCallback((recordId: string, count: number) => {
    setRecords((prev) => {
      let changed = false;
      const next = prev.map((record) => {
        const nextCount = count ?? 0;
        const currentCount = record.comment_count ?? 0;
        if (record.id !== recordId || currentCount === nextCount) return record;
        changed = true;
        return { ...record, comment_count: nextCount };
      });
      return changed ? next : prev;
    });
  }, []);

  if (!archive || me === undefined) {
    return <div style={{ padding: 20 }}>加载中...</div>;
  }

  const activeArchive = archive;
  const isOwner = me === activeArchive.user_id;
  const mode: ArchiveMode = isOwner ? ((modeParam as ArchiveMode | null) || "owner") : "viewer";
  const archiveDisplayName = getDisplayName(activeArchive, species);
  const latestUpdate = records[0]?.record_time || activeArchive.last_record_time || activeArchive.created_at;
  const archiveCategoryLabel = getArchiveCategoryLabel(activeArchive.category);
  const encyclopediaHref = activeArchive.category === "plant" && species?.id ? `/plant/${species.id}` : null;

  if (!isOwner && !activeArchive.is_public) {
    return <ArchivePrivateState />;
  }

  function getSameTagCount(tag: string) {
    return sameTagCounts[tag] ?? 0;
  }

  function updateRecordTagState(
    recordId: string,
    tag: string,
    action: "add" | "remove"
  ) {
    setRecords((prev) =>
      prev.map((record) => {
        if (record.id !== recordId) return record;

        const displayTags = Array.isArray(record.display_tags) ? record.display_tags : [];
        const userTags = Array.isArray(record.user_behavior_tags)
          ? record.user_behavior_tags
          : [];

        if (action === "add") {
          return {
            ...record,
            display_tags: Array.from(new Set([...displayTags, tag])),
            parsed_actions: Array.from(new Set([...displayTags, tag])),
            user_behavior_tags: Array.from(new Set([...userTags, tag])),
          };
        }

        return {
          ...record,
          display_tags: displayTags.filter((item: string) => item !== tag),
          parsed_actions: displayTags.filter((item: string) => item !== tag),
          user_behavior_tags: userTags.filter((item: string) => item !== tag),
        };
      })
    );
  }

  async function updateArchiveHelpState(nextStatus: "open" | "resolved" | "none") {
    const now = new Date().toISOString();
    const patch: Partial<ArchiveDetailArchive> =
      nextStatus === "open"
        ? {
            help_status: "open",
            help_opened_at: activeArchive.help_opened_at || now,
            help_resolved_at: null,
            help_updated_at: now,
          }
        : nextStatus === "resolved"
        ? {
            help_status: "resolved",
            help_resolved_at: now,
            help_updated_at: now,
          }
        : {
            help_status: "none",
            help_opened_at: null,
            help_resolved_at: null,
            help_updated_at: now,
          };

    await supabase.from("archives").update(patch).eq("id", activeArchive.id);
    setArchive((prev) => (prev ? { ...prev, ...patch } : prev));
  }

  async function setRecordHelpStatus(recordId: string, nextStatus: "help" | "resolved" | null) {
    const { error } = await supabase
      .from("records")
      .update({ status_tag: nextStatus })
      .eq("id", recordId);

    if (error) {
      showToast("更新求助状态失败");
      return;
    }

    const nextRecords = records.map((record) =>
      record.id === recordId ? { ...record, status_tag: nextStatus } : record
    );

    setRecords(nextRecords);

    const hasOpenHelp = nextRecords.some((record) => record.status_tag === "help");
    const hasResolvedHelp = nextRecords.some((record) => record.status_tag === "resolved");

    await updateArchiveHelpState(hasOpenHelp ? "open" : hasResolvedHelp ? "resolved" : "none");

    showToast(
      nextStatus === "help"
        ? "已标记为求助"
        : nextStatus === "resolved"
        ? "已标记为已解决"
        : "已取消求助"
    );
  }


  async function toggleArchiveVisibility() {
    if (!isOwner) return;

    const nextValue = !activeArchive.is_public;
    const { error } = await supabase
      .from("archives")
      .update({ is_public: nextValue })
      .eq("id", activeArchive.id);

    if (error) {
      showToast("更新可见状态失败");
      return;
    }

    if (!nextValue) {
      await supabase.from("records").update({ visibility: "private" }).eq("archive_id", activeArchive.id);

      setRecords((prev) =>
        prev.map((record) => ({
          ...record,
          visibility: "private",
        }))
      );
    }

    setArchive((prev) => (prev ? { ...prev, is_public: nextValue } : prev));

    showToast(nextValue ? "已公开" : "已设为仅自己可见");
  }

  async function toggleProjectFollow() {
    if (projectFollowSubmitting) return;

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      window.location.href = "/login";
      return;
    }

    if (isProjectFollowed) {
      setShowUnfollowProjectConfirm(true);
      return;
    }

    setProjectFollowSubmitting(true);
    const { error } = await supabase.from("archive_follows").insert([
      {
        archive_id: activeArchive.id,
        user_id: user.id,
      },
    ]);
    setProjectFollowSubmitting(false);

    if (error) {
      showToast("关注项目失败");
      return;
    }

    setIsProjectFollowed(true);
    showToast("已关注该项目");
  }

  async function confirmUnfollowProject() {
    if (projectFollowSubmitting) return;

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      window.location.href = "/login";
      return;
    }

    setProjectFollowSubmitting(true);
    const { error } = await supabase
      .from("archive_follows")
      .delete()
      .eq("archive_id", activeArchive.id)
      .eq("user_id", user.id);
    setProjectFollowSubmitting(false);

    if (error) {
      showToast("取消关注失败");
      return;
    }

    setIsProjectFollowed(false);
    setShowUnfollowProjectConfirm(false);
    showToast("已取消关注该项目");
  }

  function openLightbox(media: MediaItem[], index: number) {
    const images = buildMediaList(media, activeArchive.title || "项目");
    if (!images.length) return;
    setLightboxImages(images);
    setLightboxIndex(index);
  }

  function getSameTagSearchHref(tag: string) {
    const encodedTag = encodeURIComponent(tag);
    const fromParams = `fromArchive=${encodeURIComponent(activeArchive.id)}&fromTitle=${encodeURIComponent(
      activeArchive.title || archiveDisplayName
    )}`;

    if (species?.id) {
      return `/discover/search?tag=${encodedTag}&species=${species.id}&${fromParams}`;
    }

    if (activeArchive.species_name_snapshot && activeArchive.category === "plant") {
      return `/discover/search?tag=${encodedTag}&name=${encodeURIComponent(
        activeArchive.species_name_snapshot
      )}&${fromParams}`;
    }

    if (activeArchive.system_name && isNonPlantArchiveCategory(activeArchive.category)) {
      return `/discover/search?tag=${encodedTag}&name=${encodeURIComponent(
        activeArchive.system_name
      )}&category=${activeArchive.category}&${fromParams}`;
    }

    return "";
  }

  async function handleDeleteMedia(recordId: string, mediaId: string) {
    setDeleteMediaTarget({ recordId, mediaId });
  }

  async function confirmDeleteMedia() {
    if (!deleteMediaTarget || isDeletingMedia) return;

    setIsDeletingMedia(true);

    const { error } = await supabase.from("media").delete().eq("id", deleteMediaTarget.mediaId);

    if (error) {
      showToast("删除图片失败");
      setIsDeletingMedia(false);
      return;
    }

    setRecords((prev) =>
      prev.map((record) =>
        record.id === deleteMediaTarget.recordId
          ? {
              ...record,
              media: (record.media || []).filter(
                (media) => media.id !== deleteMediaTarget.mediaId
              ),
            }
          : record
      )
    );

    showToast("图片已删除");
    setDeleteMediaTarget(null);
    setIsDeletingMedia(false);
  }

  async function handleRecordVisibilityChange(recordId: string, nextVisibility: string) {
    await supabase.from("records").update({ visibility: nextVisibility }).eq("id", recordId);

    setRecords((prev) =>
      prev.map((record) =>
        record.id === recordId ? { ...record, visibility: nextVisibility } : record
      )
    );
  }

  async function handleAddTag(recordId: string, newTag: string) {
    const target = records.find((item) => item.id === recordId);
    const existingTags = Array.isArray(target?.display_tags) ? target?.display_tags : [];

    if (existingTags.includes(newTag)) return;

    const { error } = await supabase.from("record_tags").insert([
      {
        record_id: recordId,
        tag: newTag,
        tag_type: "behavior",
        source: "user",
        is_active: true,
      },
    ]);

    if (error) {
      showToast("添加标签失败");
      return;
    }

    updateRecordTagState(recordId, newTag, "add");
    showToast("已添加标签");
  }

  return (
    <>
      <main style={{ padding: "18px 16px 46px", maxWidth: 760, margin: "0 auto" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            marginBottom: 12,
            flexWrap: "wrap",
          }}
        >
          <Link
            href={mode === "owner" ? "/archive" : "/discover"}
            style={{ fontSize: 14, color: "#666", textDecoration: "none" }}
          >
            {mode === "owner" ? "← 我的空间主页" : "← 返回发现"}
          </Link>
        </div>

        <ArchiveDetailHeader
          mode={mode}
          archive={activeArchive}
          username={username}
          archiveDisplayName={archiveDisplayName}
          archiveCategoryLabel={archiveCategoryLabel}
          latestUpdate={latestUpdate}
          recordCount={activeArchive.record_count || records.length || 0}
          encyclopediaHref={encyclopediaHref}
          isProjectFollowed={isProjectFollowed}
          onToggleArchiveVisibility={toggleArchiveVisibility}
          onToggleProjectFollow={toggleProjectFollow}
        />

        {mode === "owner" ? (
          <ArchiveAddRecordSection archiveId={activeArchive.id} archiveIsPublic={activeArchive.is_public} />
        ) : null}

        <section style={{ position: "relative", paddingLeft: 22 }}>
          <div
            style={{
              position: "absolute",
              left: 9,
              top: 0,
              bottom: 0,
              width: 2,
              background: "#e8eee5",
            }}
          />

          {records.map((item, index) => {
            const sameTagLinks = (item.display_tags || [])
              .map((tag) => ({
                tag,
                count: getSameTagCount(tag),
                href: getSameTagSearchHref(tag),
              }))
              .filter((entry) => Boolean(entry.href));

            return (
              <ArchiveRecordCard
                key={item.id}
                archive={activeArchive}
                item={item}
                index={index}
                mode={mode}
                startTime={startTime}
                isHighlighted={highlightedRecordId === item.id}
                sameTagLinks={sameTagLinks}
                onOpenLightbox={openLightbox}
                onDeleteMedia={handleDeleteMedia}
                onVisibilityChange={handleRecordVisibilityChange}
                onSetHelpStatus={setRecordHelpStatus}
                onRemoveTag={(recordId, tag) => updateRecordTagState(recordId, tag, "remove")}
                onAddTag={handleAddTag}
                currentUserId={me ?? null}
                onCommentCountChange={handleCommentCountChange}
              />
            );
          })}

          {records.length === 0 ? (
            <div
              style={{
                border: "1px solid #ebefea",
                borderRadius: 18,
                background: "#fff",
                padding: 18,
                color: "#7d897a",
                fontSize: 14,
              }}
            >
              这里还没有可显示的记录。
            </div>
          ) : null}
        </section>
      </main>

      {isLightboxOpen ? (
        <ArchiveLightbox
          images={lightboxImages}
          index={lightboxIndex}
          onChange={setLightboxIndex}
          onClose={() => {
            setLightboxImages([]);
            setLightboxIndex(0);
          }}
        />
      ) : null}

      <ConfirmDialog
        open={showUnfollowProjectConfirm}
        title="取消关注项目"
        message="确定不再关注这个项目吗？之后该项目的新进展将不会出现在你的关注列表里。"
        confirmText={projectFollowSubmitting ? "处理中..." : "取消关注"}
        cancelText="保留关注"
        onClose={() => {
          if (!projectFollowSubmitting) setShowUnfollowProjectConfirm(false);
        }}
        onConfirm={confirmUnfollowProject}
        danger
      />


      <ConfirmDialog
        open={Boolean(deleteMediaTarget)}
        title="删除图片"
        message="确定删除这张图片吗？删除后无法恢复。"
        confirmText={isDeletingMedia ? "删除中..." : "删除"}
        cancelText="取消"
        onClose={() => {
          if (!isDeletingMedia) setDeleteMediaTarget(null);
        }}
        onConfirm={confirmDeleteMedia}
        danger
      />
    </>
  );
}
