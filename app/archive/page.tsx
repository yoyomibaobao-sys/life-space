"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { showToast } from "@/components/Toast";
import ConfirmDialog from "@/components/ConfirmDialog";
import ArchiveWorkspaceTemplate from "@/components/archive-ui/ArchiveWorkspaceTemplate";
import ArchiveProjectCard from "@/components/archive-ui/ArchiveProjectCard";
import { localArchiveToProjectView } from "@/components/archive-ui/localArchiveProjectView";
import ArchiveCard from "@/components/archive/ArchiveCard";
import ArchiveFiltersPanel from "@/components/archive/ArchiveFiltersPanel";
import ArchiveGroupPanel from "@/components/archive/ArchiveGroupPanel";
import {
  archiveCategoryOptions,
  getArchiveCategoryLabel,
  getDefaultSystemNames,
  isNonPlantArchiveCategory,
  type ArchiveCategory,
} from "@/lib/archive-categories";
import type {
  ArchiveItem,
  GroupTagItem,
  PlantSpeciesOption,
  SortMode,
  SubTagItem,
} from "@/lib/archive-page-types";
import type { MediaItem, PlantSpeciesAliasSearchRow } from "@/lib/domain-types";
import { attachMediaDisplayUrls, resolveMediaDisplayPairs } from "@/lib/media-urls";
import {
  buildArchiveSearchText,
  getArchiveSortTime,
} from "@/lib/archive-page-utils";
import {
  getCreateContentBlockedText,
  normalizeMembershipRpcResult,
  type MyMembership,
} from "@/lib/membership";
import {
  removeMediaFilesFromStorage,
  subtractStorageUsed,
  sumMediaSizeBytes,
} from "@/lib/storage-usage";
import {
  listVisibleLocalArchiveSummaries,
  markUnownedLocalArchivesForOwner,
  type LocalArchiveOwnerContext,
  type LocalArchiveSummary,
} from "@/lib/local-offline-db";

type LatestArchiveRecord = {
  id: string;
  archive_id: string | null;
  note?: string | null;
  record_time?: string | null;
  primary_image_url?: string | null;
  primary_thumb_url?: string | null;
  media_count?: number | null;
};


export default function ArchivePage() {
  const router = useRouter();
  const loadingRef = useRef(false);

  const [ready, setReady] = useState(false);
  const [archives, setArchives] = useState<ArchiveItem[]>([]);
  const [groupTags, setGroupTags] = useState<GroupTagItem[]>([]);
  const [subTags, setSubTags] = useState<SubTagItem[]>([]);
  const [speciesList, setSpeciesList] = useState<PlantSpeciesOption[]>([]);

  const [editingPlantArchiveId, setEditingPlantArchiveId] = useState<string | null>(null);
  const [editingSpeciesId, setEditingSpeciesId] = useState("");
  const [editingPendingSpeciesName, setEditingPendingSpeciesName] = useState("");
  const [editingPlantSearch, setEditingPlantSearch] = useState("");
  const [editingSystemArchiveId, setEditingSystemArchiveId] = useState<string | null>(null);
  const [editingSystemSearch, setEditingSystemSearch] = useState("");
  const [editingSystemName, setEditingSystemName] = useState("");
  const [plantSuggestionsOpen, setPlantSuggestionsOpen] = useState(false);
  const [systemSuggestionsOpen, setSystemSuggestionsOpen] = useState(false);

  const [activeCategory, setActiveCategory] = useState<ArchiveCategory | null>(null);
  const [activeSubTag, setActiveSubTag] = useState<string | null>(null);
  const [activeGroupTag, setActiveGroupTag] = useState<string | null>(null);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("updated");
  const [deleteArchiveTarget, setDeleteArchiveTarget] = useState<ArchiveItem | null>(null);
  const [deletingArchiveId, setDeletingArchiveId] = useState<string | null>(null);
  const [membership, setMembership] = useState<MyMembership | null>(null);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [currentOwnerContext, setCurrentOwnerContext] = useState<LocalArchiveOwnerContext | null>(null);
  const [activeSource, setActiveSource] = useState<ArchiveSourceFilter>("all");
  const [localArchives, setLocalArchives] = useState<LocalArchiveSummary[]>([]);
  const [localLoading, setLocalLoading] = useState(true);
  const [localError, setLocalError] = useState("");
  const [localUnownedCount, setLocalUnownedCount] = useState(0);
  const [localHiddenOwnedByOtherCount, setLocalHiddenOwnedByOtherCount] = useState(0);
  const [localOwnershipPromptDismissed, setLocalOwnershipPromptDismissed] = useState(false);
  const [markingLocalOwner, setMarkingLocalOwner] = useState(false);

  useEffect(() => {
    function updateViewportMode() {
      setIsMobileViewport(window.innerWidth < 760);
    }

    updateViewportMode();
    window.addEventListener("resize", updateViewportMode);

    return () => window.removeEventListener("resize", updateViewportMode);
  }, []);

  function shouldIgnoreCardNavigation(target: EventTarget | null) {
    if (!(target instanceof HTMLElement)) return false;

    return Boolean(
      target.closest('button, input, textarea, select, a, [data-no-card-nav="true"]')
    );
  }

  function updateFilterWithoutJump(action: () => void) {
    const scrollY = typeof window !== "undefined" ? window.scrollY : 0;
    action();
    requestAnimationFrame(() => {
      window.scrollTo({ top: scrollY });
    });
  }

  async function loadLocalArchives(ownerContext: LocalArchiveOwnerContext | null = currentOwnerContext) {
    setLocalLoading(true);
    try {
      const result = await listVisibleLocalArchiveSummaries(ownerContext);
      setLocalArchives(result.archives);
      setLocalUnownedCount(result.unownedCount);
      setLocalHiddenOwnedByOtherCount(result.hiddenOwnedByOtherCount);
      setLocalError("");
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "读取本地离线项目失败");
    } finally {
      setLocalLoading(false);
    }
  }

  async function loadData() {
    if (loadingRef.current) return;
    loadingRef.current = true;

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const user = session?.user;
      const ownerContext = user
        ? { userId: user.id, email: user.email || null }
        : null;
      setCurrentOwnerContext(ownerContext);

      if (!user) {
        setArchives([]);
        setGroupTags([]);
        setSubTags([]);
        setSpeciesList([]);
        setMembership(null);
        return;
      }

      const [
        { data: archivesData },
        { data: groupTagsData },
        { data: subTagsData },
        { data: speciesData },
        { data: aliasData },
        { data: archiveFollowRows },
        membershipResult,
      ] = await Promise.all([
        supabase.from("archives").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
        supabase.from("group_tags").select("*").eq("user_id", user.id),
        supabase.from("sub_tags").select("*").eq("user_id", user.id),
        supabase
          .from("plant_species")
          .select("id, common_name, scientific_name, slug, category, is_active")
          .eq("is_active", true)
          .order("common_name", { ascending: true }),
        supabase.from("plant_species_aliases").select("species_id, alias_name, normalized_name"),
        supabase.from("archive_follows").select("archive_id"),
        supabase.rpc("get_my_membership"),
      ]);

      const aliasesBySpecies = new Map<string, string[]>();
      ((aliasData || []) as PlantSpeciesAliasSearchRow[]).forEach((alias) => {
        const list = aliasesBySpecies.get(alias.species_id) || [];
        if (alias.alias_name) list.push(alias.alias_name);
        if (alias.normalized_name && alias.normalized_name !== alias.alias_name) {
          list.push(alias.normalized_name);
        }
        aliasesBySpecies.set(alias.species_id, list);
      });

      const speciesRows: PlantSpeciesOption[] = ((speciesData || []) as PlantSpeciesOption[]).map((species) => {
        const aliases = Array.from(new Set(aliasesBySpecies.get(species.id) || []));
        const displayName = species.common_name || species.scientific_name || "未命名植物";

        return {
          ...species,
          aliases,
          display_name: displayName,
          search_text: [
            displayName,
            species.common_name,
            species.scientific_name,
            species.slug,
            ...aliases,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase(),
        };
      });

      const speciesMap = new Map(speciesRows.map((item) => [item.id, item.display_name]));
      const archiveIds = ((archivesData || []) as ArchiveItem[]).map((item) => item.id).filter(Boolean);
      const archiveIdSet = new Set(archiveIds);
      const followerCountMap = new Map<string, number>();
      ((archiveFollowRows || []) as { archive_id?: string | null }[])
        .filter((row) => row.archive_id && archiveIdSet.has(row.archive_id))
        .forEach((row) => {
          const archiveId = String(row.archive_id);
          followerCountMap.set(archiveId, (followerCountMap.get(archiveId) || 0) + 1);
        });
      const latestRecordMap = new Map<string, LatestArchiveRecord>();
      const archiveCoverPairs = await resolveMediaDisplayPairs(
        supabase,
        ((archivesData || []) as ArchiveItem[]).map((item) => ({
          url: item.cover_image_url,
        }))
      );

      if (archiveIds.length > 0) {
        const { data: latestRecordRows, error: latestRecordError } = await supabase
          .from("records")
          .select("id, archive_id, note, record_time, primary_image_url, media_count")
          .eq("user_id", user.id)
          .in("archive_id", archiveIds)
          .order("record_time", { ascending: false });

        if (latestRecordError) {
          console.error("load latest archive records error:", latestRecordError);
        } else {
          const latestRecords = (latestRecordRows || []) as LatestArchiveRecord[];
          const latestRecordIds = latestRecords.map((record) => record.id).filter(Boolean);
          const thumbByRecordId = new Map<string, string>();
          const primaryImageByRecordId = new Map<string, string>();
          const primaryImagePairs = await resolveMediaDisplayPairs(
            supabase,
            latestRecords.map((record) => ({ url: record.primary_image_url }))
          );

          if (latestRecordIds.length > 0) {
            const { data: mediaRows, error: mediaError } = await supabase
              .from("media")
              .select("record_id, url, thumb_url, storage_path, thumb_path, sort_order, created_at")
              .in("record_id", latestRecordIds)
              .order("sort_order", { ascending: true })
              .order("created_at", { ascending: true });

            if (mediaError) {
              console.error("load latest archive record thumbnails error:", mediaError);
            } else {
              const mediaByRecordId = new Map<string, Array<{
                record_id?: string | null;
                url?: string | null;
                thumb_url?: string | null;
                storage_path?: string | null;
                thumb_path?: string | null;
                display_url?: string | null;
                display_thumb_url?: string | null;
              }>>();

              const displayMediaRows = await attachMediaDisplayUrls(
                supabase,
                (mediaRows || []) as Array<{
                  record_id?: string | null;
                  url?: string | null;
                  thumb_url?: string | null;
                  storage_path?: string | null;
                  thumb_path?: string | null;
                }>
              );

              displayMediaRows.forEach((media) => {
                if (!media.record_id) return;
                const list = mediaByRecordId.get(media.record_id) || [];
                list.push(media);
                mediaByRecordId.set(media.record_id, list);
              });

              latestRecords.forEach((record) => {
                const mediaList = mediaByRecordId.get(record.id) || [];
                const matchedPrimary = mediaList.find(
                  (media) => media.url && record.primary_image_url && media.url === record.primary_image_url
                );
                const firstThumb = mediaList.find((media) => media.display_thumb_url || media.thumb_url);
                const firstImage = mediaList.find((media) => media.display_url || media.url);
                const thumbUrl =
                  matchedPrimary?.display_thumb_url ||
                  matchedPrimary?.thumb_url ||
                  firstThumb?.display_thumb_url ||
                  firstThumb?.thumb_url ||
                  null;
                const imageUrl =
                  matchedPrimary?.display_url ||
                  matchedPrimary?.url ||
                  firstImage?.display_url ||
                  firstImage?.url ||
                  null;
                if (thumbUrl) thumbByRecordId.set(record.id, thumbUrl);
                if (imageUrl) primaryImageByRecordId.set(record.id, imageUrl);
              });
            }
          }

          latestRecords.forEach((record, index) => {
            if (!record.archive_id || latestRecordMap.has(record.archive_id)) return;
            latestRecordMap.set(record.archive_id, {
              ...record,
              primary_image_url:
                primaryImageByRecordId.get(record.id) ||
                primaryImagePairs[index]?.display_url ||
                record.primary_image_url ||
                null,
              primary_thumb_url: thumbByRecordId.get(record.id) || null,
            });
          });
        }
      }

      const enrichedArchives: ArchiveItem[] = ((archivesData || []) as ArchiveItem[]).map((item, index) => {
        const latestRecord = latestRecordMap.get(item.id);

        return {
          ...item,
          display_cover_image_url:
            archiveCoverPairs[index]?.display_url || item.cover_image_url || null,
          status: item.status || "active",
          latest_record_note: latestRecord?.note || null,
          latest_record_time: latestRecord?.record_time || item.last_record_time || null,
          latest_record_primary_image_url: latestRecord?.primary_image_url || null,
          latest_record_primary_thumb_url: latestRecord?.primary_thumb_url || null,
          latest_record_media_count: latestRecord?.media_count || 0,
          follower_count: followerCountMap.get(item.id) || 0,
          species_display_name:
            item.category === "plant"
              ? item.species_name_snapshot || (item.species_id ? speciesMap.get(item.species_id) : null) || null
              : null,
        };
      });

      setArchives(enrichedArchives);
      setGroupTags((groupTagsData || []) as GroupTagItem[]);
      setSubTags((subTagsData || []) as SubTagItem[]);
      setSpeciesList(speciesRows);
      if (membershipResult.error) {
        console.error("load membership error:", membershipResult.error);
        setMembership(null);
      } else {
        setMembership(normalizeMembershipRpcResult(membershipResult.data));
      }
    } finally {
      loadingRef.current = false;
    }
  }

  function beginEditPlant(item: ArchiveItem) {
    setEditingPlantArchiveId(item.id);
    setEditingSpeciesId(item.species_id || "");
    setEditingPendingSpeciesName("");
    setEditingPlantSearch(item.species_display_name || item.species_name_snapshot || "");
    setPlantSuggestionsOpen(false);
  }

  function submitPendingSpeciesName(name?: string) {
    const pendingName = (name ?? editingPlantSearch).trim();
    if (!pendingName) {
      showToast("请输入候选植物名称");
      return;
    }

    setEditingSpeciesId("");
    setEditingPendingSpeciesName(pendingName);
    setEditingPlantSearch(pendingName);
    setPlantSuggestionsOpen(false);
  }

  const plantSearchResults = useMemo(() => {
    const keyword = editingPlantSearch.trim().toLowerCase();
    if (!keyword) return speciesList.slice(0, 8);
    return speciesList.filter((species) => species.search_text.includes(keyword)).slice(0, 8);
  }, [editingPlantSearch, speciesList]);

  const hasExactPlantMatch = useMemo(() => {
    const keyword = editingPlantSearch.trim().toLowerCase();
    if (!keyword) return false;

    return speciesList.some((species) => {
      const names = [
        species.display_name,
        species.common_name,
        species.scientific_name,
        species.slug,
        ...(Array.isArray(species.aliases) ? species.aliases : []),
      ];

      return names
        .filter(Boolean)
        .some((name) => String(name).trim().toLowerCase() === keyword);
    });
  }, [editingPlantSearch, speciesList]);

  async function savePlantSelection(item: ArchiveItem) {
    const pendingName = editingPendingSpeciesName.trim();

    if (!editingSpeciesId && !pendingName) {
      showToast("请选择植物，或提交一个候选植物");
      return;
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();
    const user = session?.user;

    if (pendingName) {
      await supabase.from("plant_species_pending").insert([
        {
          user_id: user?.id || null,
          submitted_name: pendingName,
          language_code: "zh",
          status: "pending",
        },
      ]);

      const { error } = await supabase
        .from("archives")
        .update({ species_id: null, species_name_snapshot: pendingName })
        .eq("id", item.id);

      if (error) {
        showToast("保存失败");
        return;
      }

      setArchives((prev) =>
        prev.map((archive) =>
          archive.id === item.id
            ? {
                ...archive,
                species_id: null,
                species_name_snapshot: pendingName,
                species_display_name: pendingName,
              }
            : archive
        )
      );

      cancelPlantEditing();
      showToast("已使用候选植物");
      return;
    }

    const selectedSpecies = speciesList.find((item) => item.id === editingSpeciesId);
    if (!selectedSpecies) {
      showToast("请选择植物");
      return;
    }

    const speciesName = selectedSpecies.common_name || selectedSpecies.scientific_name || "未命名植物";

    const { error } = await supabase
      .from("archives")
      .update({ species_id: selectedSpecies.id, species_name_snapshot: speciesName })
      .eq("id", item.id);

    if (error) {
      showToast("保存失败");
      return;
    }

    setArchives((prev) =>
      prev.map((archive) =>
        archive.id === item.id
          ? {
              ...archive,
              species_id: selectedSpecies.id,
              species_name_snapshot: speciesName,
              species_display_name: speciesName,
            }
          : archive
      )
    );

    cancelPlantEditing();
    showToast("已更新植物");
  }

  function cancelPlantEditing() {
    setEditingPlantArchiveId(null);
    setEditingSpeciesId("");
    setEditingPendingSpeciesName("");
    setEditingPlantSearch("");
    setPlantSuggestionsOpen(false);
  }

  function beginEditSystem(item: ArchiveItem) {
    setEditingSystemArchiveId(item.id);
    setEditingSystemSearch(item.system_name || "");
    setEditingSystemName(item.system_name || "");
    setSystemSuggestionsOpen(false);
  }

  function getSystemNameOptions(category: ArchiveCategory | null, keyword = editingSystemSearch) {
    if (!isNonPlantArchiveCategory(category)) return [];

    const normalizedKeyword = keyword.trim().toLowerCase();
    const names = new Set<string>();
    getDefaultSystemNames(category).forEach((name) => names.add(name));
    archives.forEach((archive) => {
      if (archive.category === category && archive.system_name) {
        names.add(archive.system_name);
      }
    });

    const allNames = Array.from(names);
    if (!normalizedKeyword) return allNames.slice(0, 6);
    return allNames.filter((name) => name.toLowerCase().includes(normalizedKeyword)).slice(0, 6);
  }

  function hasExactSystemNameMatch(category: ArchiveCategory | null) {
    if (!isNonPlantArchiveCategory(category)) return false;

    const keyword = editingSystemSearch.trim().toLowerCase();
    if (!keyword) return false;

    const names = new Set<string>();
    getDefaultSystemNames(category).forEach((name) => names.add(name));
    archives.forEach((archive) => {
      if (archive.category === category && archive.system_name) {
        names.add(archive.system_name);
      }
    });

    return Array.from(names).some((name) => name.trim().toLowerCase() === keyword);
  }

  async function saveSystemSelection(item: ArchiveItem) {
    const systemName = editingSystemName.trim();
    if (!systemName) {
      showToast("请从匹配结果中点选具体名称，或新增为具体名称");
      return;
    }

    const { error } = await supabase
      .from("archives")
      .update({ system_name: systemName })
      .eq("id", item.id);

    if (error) {
      showToast("保存失败");
      return;
    }

    setArchives((prev) =>
      prev.map((archive) => (archive.id === item.id ? { ...archive, system_name: systemName } : archive))
    );

    cancelSystemEditing();
    showToast("已更新具体名称");
  }

  function cancelSystemEditing() {
    setEditingSystemArchiveId(null);
    setEditingSystemSearch("");
    setEditingSystemName("");
    setSystemSuggestionsOpen(false);
  }

  async function createSubTag(category: ArchiveCategory) {
    const name = prompt(`新增${getArchiveCategoryLabel(category)}分类`);
    if (!name?.trim()) return;

    const {
      data: { session },
    } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) return;

    const { data, error } = await supabase
      .from("sub_tags")
      .insert([{ user_id: user.id, name: name.trim(), category }])
      .select()
      .single();

    if (error) {
      showToast("新增分类失败");
      return;
    }

    if (data) {
      setSubTags((prev) => [...prev, data as SubTagItem]);
    }
  }

  async function renameSubTag(tag: SubTagItem) {
    const name = prompt("修改分类名称", tag.name);
    if (!name?.trim()) return;

    const { error } = await supabase.from("sub_tags").update({ name: name.trim() }).eq("id", tag.id);
    if (error) {
      showToast("修改分类失败");
      return;
    }

    setSubTags((prev) => prev.map((item) => (item.id === tag.id ? { ...item, name: name.trim() } : item)));
  }

  async function deleteSubTag(tag: SubTagItem) {
    if (!confirm("删除后，该分类下的项目会回到对应类型，确认？")) return;

    await supabase.from("archives").update({ sub_tag_id: null, group_tag_id: null }).eq("sub_tag_id", tag.id);
    await supabase.from("group_tags").delete().eq("sub_tag_id", tag.id);
    await supabase.from("sub_tags").delete().eq("id", tag.id);

    setArchives((prev) =>
      prev.map((item) =>
        item.sub_tag_id === tag.id ? { ...item, sub_tag_id: null, group_tag_id: null } : item
      )
    );
    setGroupTags((prev) => prev.filter((item) => item.sub_tag_id !== tag.id));
    setSubTags((prev) => prev.filter((item) => item.id !== tag.id));

    if (activeSubTag === tag.id) {
      setActiveSubTag(null);
      setActiveGroupTag(null);
    }
  }

  async function createGroupTag() {
    if (!activeSubTag) return;

    const name = prompt("新增分组");
    if (!name?.trim()) return;

    const {
      data: { session },
    } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) return;

    const { data, error } = await supabase
      .from("group_tags")
      .insert([{ user_id: user.id, name: name.trim(), sub_tag_id: activeSubTag }])
      .select()
      .single();

    if (error) {
      showToast("新增分组失败");
      return;
    }

    if (data) {
      setGroupTags((prev) => [...prev, data as GroupTagItem]);
    }
  }

  async function renameGroupTag(tag: GroupTagItem) {
    const name = prompt("修改分组名称", tag.name);
    if (!name?.trim()) return;

    const { error } = await supabase.from("group_tags").update({ name: name.trim() }).eq("id", tag.id);
    if (error) {
      showToast("修改分组失败");
      return;
    }

    setGroupTags((prev) => prev.map((item) => (item.id === tag.id ? { ...item, name: name.trim() } : item)));
  }

  async function deleteGroupTag(tag: GroupTagItem) {
    if (!confirm("删除该分组？")) return;

    await supabase.from("archives").update({ group_tag_id: null }).eq("group_tag_id", tag.id);
    await supabase.from("group_tags").delete().eq("id", tag.id);

    setArchives((prev) =>
      prev.map((item) => (item.group_tag_id === tag.id ? { ...item, group_tag_id: null } : item))
    );
    setGroupTags((prev) => prev.filter((item) => item.id !== tag.id));

    if (activeGroupTag === tag.id) {
      setActiveGroupTag(null);
    }
  }

  async function updateArchiveStatus(item: ArchiveItem, nextStatus: "active" | "ended") {
    const isEnding = nextStatus === "ended";

    if (isEnding && !confirm("确认将这个项目标记为已结束吗？之后仍可查看，也可以恢复。")) {
      return;
    }

    const { error } = await supabase.rpc(
      isEnding ? "mark_archive_ended" : "restore_archive_active",
      { p_archive_id: item.id }
    );

    if (error) {
      showToast(isEnding ? "标记结束失败" : "恢复失败");
      return;
    }

    await loadData();
    showToast(isEnding ? "已标记为结束" : "已恢复为进行中");
  }

  async function toggleArchivePublic(item: ArchiveItem) {
    const newValue = !item.is_public;
    const nextRecordVisibility = newValue ? "public" : "private";

    const { error } = await supabase.from("archives").update({ is_public: newValue }).eq("id", item.id);
    if (error) {
      showToast("更新可见状态失败");
      return;
    }

    if (!newValue) {
      const { error: recordsError } = await supabase
        .from("records")
        .update({ visibility: nextRecordVisibility })
        .eq("archive_id", item.id);

      if (recordsError) {
        showToast("记录同步失败");
        return;
      }
    }

    setArchives((prev) =>
      prev.map((archive) => (archive.id === item.id ? { ...archive, is_public: newValue } : archive))
    );
    showToast(newValue ? "项目壳已公开，旧记录不会自动公开" : "项目和记录仅自己可见");
  }

  async function updateArchiveCategory(item: ArchiveItem, value: string) {
    if (archiveCategoryOptions.some((option) => option.value === value)) {
      const { error } = await supabase
        .from("archives")
        .update({ category: value, sub_tag_id: null, group_tag_id: null })
        .eq("id", item.id);

      if (error) {
        showToast("更新分类失败");
        return;
      }

      setArchives((prev) =>
        prev.map((archive) =>
          archive.id === item.id
            ? { ...archive, category: value as ArchiveCategory, sub_tag_id: null, group_tag_id: null }
            : archive
        )
      );
      return;
    }

    const sub = subTags.find((tag) => String(tag.id) === value);
    if (!sub) return;

    const { error } = await supabase
      .from("archives")
      .update({ category: sub.category, sub_tag_id: sub.id, group_tag_id: null })
      .eq("id", item.id);

    if (error) {
      showToast("更新分类失败");
      return;
    }

    setArchives((prev) =>
      prev.map((archive) =>
        archive.id === item.id
          ? { ...archive, category: sub.category, sub_tag_id: sub.id, group_tag_id: null }
          : archive
      )
    );
  }

  async function updateArchiveGroupTag(item: ArchiveItem, value: string) {
    const { error } = await supabase
      .from("archives")
      .update({ group_tag_id: value || null })
      .eq("id", item.id);

    if (error) {
      showToast("更新分组失败");
      return;
    }

    setArchives((prev) =>
      prev.map((archive) => (archive.id === item.id ? { ...archive, group_tag_id: value || null } : archive))
    );
  }

  async function deleteArchive(item: ArchiveItem) {
    setDeleteArchiveTarget(item);
  }

  async function confirmDeleteArchive() {
    if (!deleteArchiveTarget || deletingArchiveId) return;

    setDeletingArchiveId(deleteArchiveTarget.id);

    const { data: recordRows } = await supabase
      .from("records")
      .select("id")
      .eq("archive_id", deleteArchiveTarget.id);
    const recordIds = (recordRows || []).map((record) => record.id).filter(Boolean);
    let mediaItems: MediaItem[] = [];

    if (recordIds.length > 0) {
      const { data: mediaRows } = await supabase
        .from("media")
        .select("id, url, storage_path, thumb_path, size_mb, size_bytes, user_id")
        .in("record_id", recordIds);
      mediaItems = (mediaRows || []) as MediaItem[];
      await removeMediaFilesFromStorage(mediaItems);
    }

    const deletedBytes = sumMediaSizeBytes(mediaItems);
    const ownerId = deleteArchiveTarget.user_id || mediaItems.find((media) => media.user_id)?.user_id;

    const { error } = await supabase.from("archives").delete().eq("id", deleteArchiveTarget.id);
    setDeletingArchiveId(null);

    if (error) {
      showToast("删除项目失败");
      return;
    }

    if (deletedBytes > 0) {
      await subtractStorageUsed(ownerId, deletedBytes);
    }

    setDeleteArchiveTarget(null);
    showToast("项目已删除");
    await loadData();
  }

  async function markLocalArchivesAsMine() {
    if (!currentOwnerContext?.userId || markingLocalOwner) return;

    setMarkingLocalOwner(true);
    try {
      const markedCount = await markUnownedLocalArchivesForOwner({
        userId: currentOwnerContext.userId,
        email: currentOwnerContext.email || null,
      });
      await loadLocalArchives(currentOwnerContext);
      showToast(markedCount > 0 ? "已标记为我的本地项目" : "没有需要标记的本地项目");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "标记本地项目失败");
    } finally {
      setMarkingLocalOwner(false);
    }
  }

  function renameArchiveTitle(item: ArchiveItem) {
    const name = prompt("修改名称", item.title || "");
    if (!name?.trim()) return;

    supabase.from("archives").update({ title: name.trim() }).eq("id", item.id).then(() => {
      loadData();
    });
  }

  useEffect(() => {
    let isMounted = true;

    async function safeLoad() {
      try {
        const { data } = await supabase.auth.getUser();
        const user = data.user;
        const ownerContext = user
          ? { userId: user.id, email: user.email || null }
          : null;
        const sourceParam = new URLSearchParams(window.location.search).get("source");

        if (sourceParam === "local" || sourceParam === "cloud") {
          setActiveSource(sourceParam);
        }

        if (!isMounted) return;
        setCurrentOwnerContext(ownerContext);
        await Promise.all([loadData(), loadLocalArchives(ownerContext)]);
      } catch (error) {
        console.error("loadData error:", error);
      } finally {
        if (isMounted) setReady(true);
      }
    }

    safeLoad();

    return () => {
      isMounted = false;
    };
  }, []);

  const archiveCount = archives.length;
  const publicArchiveCount = archives.filter((item) => item.is_public).length;
  const privateArchiveCount = archiveCount - publicArchiveCount;
  const endedArchiveCount = archives.filter((item) => item.status === "ended").length;
  const archiveCategoryCounts = useMemo(() => {
    const counts: Record<ArchiveCategory, number> = {
      plant: 0,
      system: 0,
      insect_fish: 0,
      other: 0,
    };

    archives.forEach((item) => {
      const category =
        item.category === "plant" ||
        item.category === "system" ||
        item.category === "insect_fish" ||
        item.category === "other"
          ? item.category
          : "other";
      counts[category] += 1;
    });

    return counts;
  }, [archives]);
  const localArchiveCategoryCounts = useMemo(() => {
    const counts: Record<ArchiveCategory, number> = {
      plant: 0,
      system: 0,
      insect_fish: 0,
      other: 0,
    };

    localArchives.forEach((item) => {
      counts[item.category] += 1;
    });

    return counts;
  }, [localArchives]);
  const visibleCategoryCounts = useMemo(() => {
    const counts: Record<ArchiveCategory, number> = {
      plant: 0,
      system: 0,
      insect_fish: 0,
      other: 0,
    };

    (Object.keys(counts) as ArchiveCategory[]).forEach((category) => {
      counts[category] =
        (activeSource === "local" ? 0 : archiveCategoryCounts[category]) +
        (activeSource === "cloud" ? 0 : localArchiveCategoryCounts[category]);
    });

    return counts;
  }, [activeSource, archiveCategoryCounts, localArchiveCategoryCounts]);
  const sourceTotalCount =
    (activeSource === "local" ? 0 : archiveCount) +
    (activeSource === "cloud" ? 0 : localArchives.length);
  const contentBlocked = membership?.can_create_content === false;

  const plantSubTags = subTags.filter((tag) => tag.category === "plant");
  const methodFacilitySubTags = subTags.filter((tag) => tag.category === "system");
  const insectFishSubTags = subTags.filter((tag) => tag.category === "insect_fish");
  const otherSubTags = subTags.filter((tag) => tag.category === "other");

  const currentSubTag = subTags.find((tag) => tag.id === activeSubTag) || null;
  const visibleGroupTags = activeSubTag && currentSubTag
    ? groupTags.filter((tag) => tag.sub_tag_id === activeSubTag)
    : [];

  const subTagNameMap = new Map(subTags.map((tag) => [tag.id, tag.name]));
  const groupTagNameMap = new Map(groupTags.map((tag) => [tag.id, tag.name]));

  const filteredArchives = useMemo(() => {
    const keyword = searchKeyword.trim().toLowerCase();

    const filtered = archives.filter((item) => {
      if (activeGroupTag && item.group_tag_id !== activeGroupTag) return false;
      if (activeSubTag && item.sub_tag_id !== activeSubTag) return false;
      if (
        !activeSubTag &&
        activeCategory &&
        item.category !== activeCategory
      ) {
        return false;
      }
      if (!keyword) return true;

      return buildArchiveSearchText(item, subTagNameMap, groupTagNameMap).includes(keyword);
    });

    const sorted = [...filtered];

    if (sortMode === "name") {
      const collator = new Intl.Collator("zh-CN");
      return sorted.sort((a, b) => collator.compare(a.title || "", b.title || ""));
    }

    if (sortMode === "updated") {
      return sorted.sort((a, b) => getArchiveSortTime(b, "updated") - getArchiveSortTime(a, "updated"));
    }

    return sorted.sort((a, b) => getArchiveSortTime(b, "created") - getArchiveSortTime(a, "created"));
  }, [
    archives,
    activeCategory,
    activeSubTag,
    activeGroupTag,
    searchKeyword,
    sortMode,
    subTagNameMap,
    groupTagNameMap,
  ]);

  const filteredLocalArchives = useMemo(() => {
    const keyword = searchKeyword.trim().toLowerCase();
    const filtered = localArchives.filter((item) => {
      if (activeCategory && item.category !== activeCategory) return false;
      if (activeSubTag && item.subcategory !== activeSubTag) return false;
      if (activeGroupTag && item.group_name !== activeGroupTag) return false;
      if (!keyword) return true;

      return [
        item.title,
        item.system_name,
        item.species_name,
        item.subcategory,
        item.group_name,
        item.note,
        item.latest_record_note,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(keyword);
    });
    const sorted = [...filtered];

    if (sortMode === "name") {
      const collator = new Intl.Collator("zh-CN");
      return sorted.sort((a, b) => collator.compare(a.title || "", b.title || ""));
    }

    if (sortMode === "updated") {
      return sorted.sort(
        (a, b) =>
          new Date(b.updated_at || b.created_at).getTime() -
          new Date(a.updated_at || a.created_at).getTime()
      );
    }

    return sorted.sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }, [
    localArchives,
    activeCategory,
    activeSubTag,
    activeGroupTag,
    searchKeyword,
    sortMode,
  ]);

  const activeArchives = filteredArchives.filter((item) => item.status !== "ended");
  const endedArchives = filteredArchives.filter((item) => item.status === "ended");
  const showCloudArchives = activeSource !== "local";
  const showLocalArchives = activeSource !== "cloud";
  const localSubTags = useMemo(() => {
    if (!activeCategory) return [];

    return Array.from(
      new Set(
        localArchives
          .filter((archive) => archive.category === activeCategory && archive.subcategory)
          .map((archive) => archive.subcategory as string)
      )
    ).sort((a, b) => a.localeCompare(b, "zh-CN"));
  }, [activeCategory, localArchives]);
  const localGroupTags = useMemo(() => {
    if (!activeCategory || !activeSubTag) return [];

    return Array.from(
      new Set(
        localArchives
          .filter(
            (archive) =>
              archive.category === activeCategory &&
              archive.subcategory === activeSubTag &&
              archive.group_name
          )
          .map((archive) => archive.group_name as string)
      )
    ).sort((a, b) => a.localeCompare(b, "zh-CN"));
  }, [activeCategory, activeSubTag, localArchives]);

  function handleSelectSource(nextSource: ArchiveSourceFilter) {
    updateFilterWithoutJump(() => {
      setActiveSource(nextSource);
      setActiveSubTag(null);
      setActiveGroupTag(null);
    });
  }

  function handleCreateFromWorkspace(category: ArchiveCategory) {
    if (activeSource === "local" || (!currentOwnerContext?.userId && activeSource !== "cloud")) {
      router.push(`/local/archive/new?category=${category}`);
      return;
    }

    if (!currentOwnerContext?.userId) {
      router.push("/login");
      return;
    }

    if (contentBlocked) {
      showToast(getCreateContentBlockedText(membership));
      return;
    }

    router.push(`/archive/new?category=${category}`);
  }

  const createDisabled =
    activeSource !== "local" &&
    Boolean(currentOwnerContext?.userId) &&
    contentBlocked;

  const createDisabledText = createDisabled
    ? getCreateContentBlockedText(membership)
    : undefined;

  const workspaceFiltersSlot =
    activeSource === "cloud" ? (
      <>
        <ArchiveFiltersPanel
          activeCategory={activeCategory}
          activeSubTag={activeSubTag}
          visibleGroupTagCount={visibleGroupTags.length}
          plantSubTags={plantSubTags}
          methodFacilitySubTags={methodFacilitySubTags}
          insectFishSubTags={insectFishSubTags}
          otherSubTags={otherSubTags}
          mobileMode={isMobileViewport}
          onReset={() =>
            updateFilterWithoutJump(() => {
              setActiveCategory(null);
              setActiveSubTag(null);
              setActiveGroupTag(null);
            })
          }
          onSelectCategory={(category) =>
            updateFilterWithoutJump(() => {
              setActiveCategory(category);
              setActiveSubTag(null);
              setActiveGroupTag(null);
            })
          }
          onSelectSubTag={(category, id) =>
            updateFilterWithoutJump(() => {
              setActiveCategory(category);
              setActiveSubTag(id);
              setActiveGroupTag(null);
            })
          }
          onRenameSubTag={renameSubTag}
          onDeleteSubTag={deleteSubTag}
          onCreateSubTag={createSubTag}
        />
        <ArchiveGroupPanel
          activeGroupTag={activeGroupTag}
          activeSubTag={activeSubTag}
          visibleGroupTags={visibleGroupTags}
          mobileMode={isMobileViewport}
          onReset={() =>
            updateFilterWithoutJump(() => {
              setActiveGroupTag(null);
            })
          }
          onToggleGroupTag={(id) =>
            updateFilterWithoutJump(() => {
              setActiveGroupTag(activeGroupTag === id ? null : id);
            })
          }
          onRenameGroupTag={renameGroupTag}
          onDeleteGroupTag={deleteGroupTag}
          onCreateGroupTag={createGroupTag}
        />
      </>
    ) : activeSource === "local" ? (
      <LocalArchiveFilters
        activeCategory={activeCategory}
        activeSubTag={activeSubTag}
        activeGroupTag={activeGroupTag}
        subTags={localSubTags}
        groupTags={localGroupTags}
        onReset={() =>
          updateFilterWithoutJump(() => {
            setActiveCategory(null);
            setActiveSubTag(null);
            setActiveGroupTag(null);
          })
        }
        onSelectCategory={(category) =>
          updateFilterWithoutJump(() => {
            setActiveCategory(category);
            setActiveSubTag(null);
            setActiveGroupTag(null);
          })
        }
        onSelectSubTag={(name) =>
          updateFilterWithoutJump(() => {
            setActiveSubTag(name);
            setActiveGroupTag(null);
          })
        }
        onSelectGroup={(name) =>
          updateFilterWithoutJump(() => {
            setActiveGroupTag(name ? (activeGroupTag === name ? null : name) : null);
          })
        }
      />
    ) : (
      <MainCategoryFilters
        activeCategory={activeCategory}
        onReset={() =>
          updateFilterWithoutJump(() => {
            setActiveCategory(null);
            setActiveSubTag(null);
            setActiveGroupTag(null);
          })
        }
        onSelectCategory={(category) =>
          updateFilterWithoutJump(() => {
            setActiveCategory(category);
            setActiveSubTag(null);
            setActiveGroupTag(null);
          })
        }
      />
    );

  const workspaceNoticeSlot = (
    <>
      {activeSource === "local" ? (
        <div style={localOtherOwnerNoticeStyle}>
          本地子分类和分组只保存在这台设备，不会自动创建或影响云空间分类。
        </div>
      ) : null}
      {showLocalArchives && currentOwnerContext?.userId && localUnownedCount > 0 && !localOwnershipPromptDismissed ? (
        <div style={localOwnershipNoticeStyle}>
          <span>
            发现本机有未归属的本地离线项目。这些内容仍只保存在这台设备，不会自动上传云端。
          </span>
          <div style={localOwnershipActionRowStyle}>
            <button
              type="button"
              onClick={markLocalArchivesAsMine}
              disabled={markingLocalOwner}
              style={localOwnershipPrimaryButtonStyle}
            >
              {markingLocalOwner ? "标记中..." : "标记为我的本地项目"}
            </button>
            <button
              type="button"
              onClick={() => setLocalOwnershipPromptDismissed(true)}
              style={localOwnershipSecondaryButtonStyle}
            >
              暂不处理
            </button>
          </div>
        </div>
      ) : null}
      {showLocalArchives && localHiddenOwnedByOtherCount > 0 ? (
        <div style={localOtherOwnerNoticeStyle}>
          这台设备上有已归属其他账号的本地离线项目。
        </div>
      ) : null}
    </>
  );

  function renderCloudArchiveCard(item: ArchiveItem, ended = false) {
    return (
      <ArchiveCard
        key={item.id}
        item={item}
        ended={ended}
        mobileMode={isMobileViewport}
        subTags={subTags}
        groupTags={groupTags}
        editingPlantArchiveId={editingPlantArchiveId}
        editingSpeciesId={editingSpeciesId}
        editingPendingSpeciesName={editingPendingSpeciesName}
        editingPlantSearch={editingPlantSearch}
        plantSuggestionsOpen={plantSuggestionsOpen}
        plantSearchResults={plantSearchResults}
        hasExactPlantMatch={hasExactPlantMatch}
        editingSystemArchiveId={editingSystemArchiveId}
        editingSystemSearch={editingSystemSearch}
        editingSystemName={editingSystemName}
        systemSuggestionsOpen={systemSuggestionsOpen}
        systemNameOptions={getSystemNameOptions(item.category)}
        hasExactSystemNameMatch={hasExactSystemNameMatch(item.category)}
        onNavigate={(id) => router.push(`/archive/${id}`)}
        shouldIgnoreCardNavigation={shouldIgnoreCardNavigation}
        onRenameTitle={renameArchiveTitle}
        onBeginEditPlant={beginEditPlant}
        onPlantSearchChange={(value) => {
          setEditingPlantSearch(value);
          setEditingPendingSpeciesName("");
          setEditingSpeciesId("");
          setPlantSuggestionsOpen(true);
        }}
        onSelectPlantSpecies={(species) => {
          setEditingSpeciesId(species.id);
          setEditingPendingSpeciesName("");
          setEditingPlantSearch(species.display_name || species.common_name || species.scientific_name || "未命名植物");
          setPlantSuggestionsOpen(false);
        }}
        onSubmitPendingSpecies={() => submitPendingSpeciesName()}
        onSavePlantSelection={savePlantSelection}
        onCancelPlantEditing={cancelPlantEditing}
        onBeginEditSystem={beginEditSystem}
        onSystemSearchChange={(value) => {
          setEditingSystemSearch(value);
          setEditingSystemName("");
          setSystemSuggestionsOpen(true);
        }}
        onSelectSystemName={(name) => {
          setEditingSystemName(name);
          setEditingSystemSearch(name);
          setSystemSuggestionsOpen(false);
        }}
        onSaveSystemSelection={saveSystemSelection}
        onCancelSystemEditing={cancelSystemEditing}
        onUpdateArchiveStatus={updateArchiveStatus}
        onTogglePublic={toggleArchivePublic}
        onUpdateArchiveCategory={updateArchiveCategory}
        onUpdateArchiveGroupTag={updateArchiveGroupTag}
        onDeleteArchive={deleteArchive}
      />
    );
  }

  if (!ready) return null;

  return (
    <main
      style={{
        padding: isMobileViewport ? "14px 12px 24px" : "22px 18px 42px",
        maxWidth: 1080,
        margin: "0 auto",
      }}
    >
      {!isMobileViewport ? (
        <section
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 16,
            marginBottom: 10,
          }}
        >
          <div>
            <h1
              style={{
                margin: 0,
                fontSize: 26,
                color: "#1f2d1f",
                fontWeight: 700,
              }}
            >
              我的空间
            </h1>
          </div>
        </section>
      ) : null}

      <ArchiveWorkspaceTemplate<ArchiveSourceFilter>
        statsText={
          !isMobileViewport ? (
            <>
              我的项目 {archiveCount + localArchives.length} 个 · 云空间 {archiveCount} · 本地离线 {localArchives.length} · 公开 {publicArchiveCount} · 仅自己可见 {privateArchiveCount}
              {endedArchiveCount > 0 ? " · 已结束 " + endedArchiveCount : ""}
            </>
          ) : undefined
        }
        sourceOptions={[
          { value: "all", label: "全部", count: archiveCount + localArchives.length },
          { value: "cloud", label: "云空间", count: archiveCount },
          { value: "local", label: "本地离线", count: localArchives.length },
        ]}
        activeSource={activeSource}
        onSelectSource={handleSelectSource}
        onCreateArchive={handleCreateFromWorkspace}
        createDisabled={createDisabled}
        createDisabledTitle={createDisabledText}
        createDisabledHref={createDisabled ? "/membership" : undefined}
        filtersSlot={workspaceFiltersSlot}
        noticeSlot={workspaceNoticeSlot}
      >
        {showCloudArchives ? (
          !currentOwnerContext?.userId ? (
            <div style={emptyPanelStyle}>
              登录后可查看云空间项目；本地离线项目仍可在这台设备上查看。
            </div>
          ) : activeArchives.length === 0 && endedArchives.length === 0 ? (
            <div style={emptyPanelStyle}>
              {archiveCount === 0 ? "还没有云空间项目，请先新建项目" : "没有找到云空间项目"}
            </div>
          ) : (
            <>
              {activeArchives.map((item) => renderCloudArchiveCard(item, false))}
              {endedArchives.length > 0 ? (
                <section style={{ marginTop: activeArchives.length > 0 ? 26 : 0 }}>
                  <div style={endedSectionHeaderStyle}>
                    <h2 style={endedSectionTitleStyle}>已结束</h2>
                    <span style={endedSectionTextStyle}>这些项目已经告一段落，仍然保存在你的空间里。</span>
                  </div>
                  {endedArchives.map((item) => renderCloudArchiveCard(item, true))}
                </section>
              ) : null}
            </>
          )
        ) : null}

        {showLocalArchives ? (
          localLoading ? (
            <div style={emptyPanelStyle}>正在读取本地离线项目...</div>
          ) : localError ? (
            <div style={emptyPanelStyle}>{localError}</div>
          ) : localArchives.length === 0 ? (
            <div style={emptyPanelStyle}>还没有可查看的本地离线项目。</div>
          ) : filteredLocalArchives.length === 0 ? (
            <div style={emptyPanelStyle}>当前筛选下没有本地离线项目。</div>
          ) : (
            filteredLocalArchives.map((archive) => (
              <ArchiveProjectCard
                key={archive.id}
                project={localArchiveToProjectView(archive, currentOwnerContext)}
                mobileMode={isMobileViewport}
              />
            ))
          )
        ) : null}
      </ArchiveWorkspaceTemplate>
      <ConfirmDialog
        open={Boolean(deleteArchiveTarget)}
        title="删除项目"
        message={`确定删除“${deleteArchiveTarget?.title || "这个项目"}”吗？项目内的记录会一起删除，删除后无法恢复。`}
        confirmText={deletingArchiveId ? "删除中..." : "删除"}
        cancelText="取消"
        danger
        onClose={() => {
          if (!deletingArchiveId) setDeleteArchiveTarget(null);
        }}
        onConfirm={confirmDeleteArchive}
      />
    </main>
  );
}

function MainCategoryFilters({
  activeCategory,
  onReset,
  onSelectCategory,
}: {
  activeCategory: ArchiveCategory | null;
  onReset: () => void;
  onSelectCategory: (category: ArchiveCategory) => void;
}) {
  return (
    <section style={workspaceFilterPanelStyle}>
      <div style={workspaceChipRowStyle}>
        <button type="button" onClick={onReset} style={workspacePillStyle(!activeCategory)}>
          全部
        </button>
        {archiveCategoryOptions.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onSelectCategory(option.value)}
            style={workspacePillStyle(activeCategory === option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </section>
  );
}

function LocalArchiveFilters({
  activeCategory,
  activeSubTag,
  activeGroupTag,
  subTags,
  groupTags,
  onReset,
  onSelectCategory,
  onSelectSubTag,
  onSelectGroup,
}: {
  activeCategory: ArchiveCategory | null;
  activeSubTag: string | null;
  activeGroupTag: string | null;
  subTags: string[];
  groupTags: string[];
  onReset: () => void;
  onSelectCategory: (category: ArchiveCategory) => void;
  onSelectSubTag: (name: string) => void;
  onSelectGroup: (name: string) => void;
}) {
  return (
    <>
      <MainCategoryFilters
        activeCategory={activeCategory}
        onReset={onReset}
        onSelectCategory={onSelectCategory}
      />

      {activeCategory ? (
        <section style={workspaceFilterPanelStyle}>
          <div style={workspaceFilterLabelStyle}>本地子分类</div>
          <div style={workspaceChipRowStyle}>
            <button
              type="button"
              onClick={() => onSelectCategory(activeCategory)}
              style={workspacePillStyle(!activeSubTag)}
            >
              全部子分类
            </button>
            {subTags.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => onSelectSubTag(tag)}
                style={workspacePillStyle(activeSubTag === tag)}
              >
                {tag}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {activeCategory && activeSubTag ? (
        <section style={workspaceFilterPanelStyle}>
          <div style={workspaceFilterLabelStyle}>本地分组</div>
          <div style={workspaceChipRowStyle}>
            <button
              type="button"
              onClick={() => onSelectGroup("")}
              style={workspacePillStyle(!activeGroupTag)}
            >
              全部分组
            </button>
            {groupTags.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => onSelectGroup(tag)}
                style={workspacePillStyle(activeGroupTag === tag)}
              >
                {tag}
              </button>
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}

const workspaceFilterPanelStyle: CSSProperties = {
  marginBottom: 12,
  padding: "12px 14px",
  border: "1px solid #edf0e8",
  borderRadius: 16,
  background: "#fff",
};

const workspaceChipRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
};

const workspaceFilterLabelStyle: CSSProperties = {
  marginBottom: 8,
  color: "#7a8675",
  fontSize: 12,
  fontWeight: 800,
};

function workspacePillStyle(active: boolean): CSSProperties {
  return {
    border: active ? "1px solid #3f7d3d" : "1px solid #cfe3c8",
    background: active ? "#3f7d3d" : "#f8fbf5",
    color: active ? "#fff" : "#335033",
    borderRadius: 999,
    padding: "7px 14px",
    fontSize: 15,
    fontWeight: 700,
    cursor: "pointer",
    lineHeight: 1.3,
  };
}

const endedSectionHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  marginBottom: 10,
  color: "#777",
};

const endedSectionTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 18,
  fontWeight: 600,
};

const endedSectionTextStyle: CSSProperties = {
  fontSize: 13,
};

const emptyPanelStyle: CSSProperties = {
  border: "1px dashed #d9e6d0",
  borderRadius: 18,
  padding: 22,
  textAlign: "center",
  color: "#7a857a",
  background: "#fcfdfb",
};

const localOwnershipNoticeStyle: CSSProperties = {
  margin: "0 0 10px",
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid #dfead7",
  background: "#f7fbf2",
  color: "#54624d",
  fontSize: 13,
  lineHeight: 1.55,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  flexWrap: "wrap",
};

const localOwnershipActionRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
};

const localOwnershipPrimaryButtonStyle: CSSProperties = {
  minHeight: 32,
  padding: "0 12px",
  borderRadius: 999,
  border: "1px solid #b7d2af",
  background: "#eef7e8",
  color: "#2f5f2d",
  fontSize: 13,
  fontWeight: 800,
  cursor: "pointer",
};

const localOwnershipSecondaryButtonStyle: CSSProperties = {
  minHeight: 32,
  padding: "0 10px",
  borderRadius: 999,
  border: "1px solid #dde5d7",
  background: "#fff",
  color: "#66735f",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
};

const localOtherOwnerNoticeStyle: CSSProperties = {
  margin: "0 0 10px",
  color: "#87917e",
  fontSize: 12,
  lineHeight: 1.5,
};

type ArchiveSourceFilter = "all" | "cloud" | "local";
