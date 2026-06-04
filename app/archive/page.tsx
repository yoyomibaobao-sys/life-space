"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { showToast } from "@/components/Toast";
import ConfirmDialog from "@/components/ConfirmDialog";
import ArchiveCard from "@/components/archive/ArchiveCard";
import ArchiveFiltersPanel from "@/components/archive/ArchiveFiltersPanel";
import ArchiveGroupPanel from "@/components/archive/ArchiveGroupPanel";
import ArchiveToolbar from "@/components/archive/ArchiveToolbar";
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

  async function loadData() {
    if (loadingRef.current) return;
    loadingRef.current = true;

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const user = session?.user;
      if (!user) {
        router.push("/login");
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
        const displayName = species.common_name || species.scientific_name || "鏈懡鍚嶆鐗?;

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
      showToast("璇疯緭鍏ュ€欓€夋鐗╁悕绉?);
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
      showToast("璇烽€夋嫨妞嶇墿锛屾垨鎻愪氦涓€涓€欓€夋鐗?);
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
        showToast("淇濆瓨澶辫触");
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
      showToast("宸蹭娇鐢ㄥ€欓€夋鐗?);
      return;
    }

    const selectedSpecies = speciesList.find((item) => item.id === editingSpeciesId);
    if (!selectedSpecies) {
      showToast("璇烽€夋嫨妞嶇墿");
      return;
    }

    const speciesName = selectedSpecies.common_name || selectedSpecies.scientific_name || "鏈懡鍚嶆鐗?;

    const { error } = await supabase
      .from("archives")
      .update({ species_id: selectedSpecies.id, species_name_snapshot: speciesName })
      .eq("id", item.id);

    if (error) {
      showToast("淇濆瓨澶辫触");
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
    showToast("宸叉洿鏂版鐗?);
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
      showToast("璇蜂粠鍖归厤缁撴灉涓偣閫夊叿浣撳悕绉帮紝鎴栨柊澧炰负鍏蜂綋鍚嶇О");
      return;
    }

    const { error } = await supabase
      .from("archives")
      .update({ system_name: systemName })
      .eq("id", item.id);

    if (error) {
      showToast("淇濆瓨澶辫触");
      return;
    }

    setArchives((prev) =>
      prev.map((archive) => (archive.id === item.id ? { ...archive, system_name: systemName } : archive))
    );

    cancelSystemEditing();
    showToast("宸叉洿鏂板叿浣撳悕绉?);
  }

  function cancelSystemEditing() {
    setEditingSystemArchiveId(null);
    setEditingSystemSearch("");
    setEditingSystemName("");
    setSystemSuggestionsOpen(false);
  }

  async function createSubTag(category: ArchiveCategory) {
    const name = prompt(`鏂板${getArchiveCategoryLabel(category)}鍒嗙被`);
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
      showToast("鏂板鍒嗙被澶辫触");
      return;
    }

    if (data) {
      setSubTags((prev) => [...prev, data as SubTagItem]);
    }
  }

  async function renameSubTag(tag: SubTagItem) {
    const name = prompt("淇敼鍒嗙被鍚嶇О", tag.name);
    if (!name?.trim()) return;

    const { error } = await supabase.from("sub_tags").update({ name: name.trim() }).eq("id", tag.id);
    if (error) {
      showToast("淇敼鍒嗙被澶辫触");
      return;
    }

    setSubTags((prev) => prev.map((item) => (item.id === tag.id ? { ...item, name: name.trim() } : item)));
  }

  async function deleteSubTag(tag: SubTagItem) {
    if (!confirm("鍒犻櫎鍚庯紝璇ュ垎绫讳笅鐨勯」鐩細鍥炲埌瀵瑰簲绫诲瀷锛岀‘璁わ紵")) return;

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

    const name = prompt("鏂板鍒嗙粍");
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
      showToast("鏂板鍒嗙粍澶辫触");
      return;
    }

    if (data) {
      setGroupTags((prev) => [...prev, data as GroupTagItem]);
    }
  }

  async function renameGroupTag(tag: GroupTagItem) {
    const name = prompt("淇敼鍒嗙粍鍚嶇О", tag.name);
    if (!name?.trim()) return;

    const { error } = await supabase.from("group_tags").update({ name: name.trim() }).eq("id", tag.id);
    if (error) {
      showToast("淇敼鍒嗙粍澶辫触");
      return;
    }

    setGroupTags((prev) => prev.map((item) => (item.id === tag.id ? { ...item, name: name.trim() } : item)));
  }

  async function deleteGroupTag(tag: GroupTagItem) {
    if (!confirm("鍒犻櫎璇ュ垎缁勶紵")) return;

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

    if (isEnding && !confirm("纭灏嗚繖涓」鐩爣璁颁负宸茬粨鏉熷悧锛熶箣鍚庝粛鍙煡鐪嬶紝涔熷彲浠ユ仮澶嶃€?)) {
      return;
    }

    const { error } = await supabase.rpc(
      isEnding ? "mark_archive_ended" : "restore_archive_active",
      { p_archive_id: item.id }
    );

    if (error) {
      showToast(isEnding ? "鏍囪缁撴潫澶辫触" : "鎭㈠澶辫触");
      return;
    }

    await loadData();
    showToast(isEnding ? "宸叉爣璁颁负缁撴潫" : "宸叉仮澶嶄负杩涜涓?);
  }

  async function toggleArchivePublic(item: ArchiveItem) {
    const newValue = !item.is_public;
    const nextRecordVisibility = newValue ? "public" : "private";

    const { error } = await supabase.from("archives").update({ is_public: newValue }).eq("id", item.id);
    if (error) {
      showToast("鏇存柊鍙鐘舵€佸け璐?);
      return;
    }

    const { error: recordsError } = await supabase
      .from("records")
      .update({ visibility: nextRecordVisibility })
      .eq("archive_id", item.id);

    if (recordsError) {
      showToast("椤圭洰鐘舵€佸凡鏇存柊锛屼絾鍚屾璁板綍鍙鐘舵€佸け璐?);
      return;
    }

    setArchives((prev) =>
      prev.map((archive) => (archive.id === item.id ? { ...archive, is_public: newValue } : archive))
    );
    showToast(newValue ? "椤圭洰鍜岃褰曞凡鍏紑鍒板彂鐜? : "椤圭洰鍜岃褰曞凡璁句负浠呰嚜宸卞彲瑙?);
  }

  async function updateArchiveCategory(item: ArchiveItem, value: string) {
    if (archiveCategoryOptions.some((option) => option.value === value)) {
      await supabase.from("archives").update({ category: value, sub_tag_id: null, group_tag_id: null }).eq("id", item.id);
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

    await supabase
      .from("archives")
      .update({ category: sub.category, sub_tag_id: sub.id, group_tag_id: null })
      .eq("id", item.id);

    setArchives((prev) =>
      prev.map((archive) =>
        archive.id === item.id
          ? { ...archive, category: sub.category, sub_tag_id: sub.id, group_tag_id: null }
          : archive
      )
    );
  }

  async function updateArchiveGroupTag(item: ArchiveItem, value: string) {
    await supabase.from("archives").update({ group_tag_id: value || null }).eq("id", item.id);
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
      showToast("鍒犻櫎椤圭洰澶辫触");
      return;
    }

    if (deletedBytes > 0) {
      await subtractStorageUsed(ownerId, deletedBytes);
    }

    setDeleteArchiveTarget(null);
    showToast("椤圭洰宸插垹闄わ紝瀹归噺宸查噴鏀?);
    await loadData();
  }

  function renameArchiveTitle(item: ArchiveItem) {
    const name = prompt("淇敼鍚嶇О", item.title || "");
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
        if (!user) {
          router.push("/login");
          return;
        }

        if (!isMounted) return;
        await loadData();
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
      if (!activeSubTag && activeCategory && item.category !== activeCategory) return false;
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

  const activeArchives = filteredArchives.filter((item) => item.status !== "ended");
  const endedArchives = filteredArchives.filter((item) => item.status === "ended");

  if (!ready) return null;

  return (
    <main
      style={{
        padding: "22px 18px 42px",
        maxWidth: 1080,
        margin: "0 auto",
      }}
    >
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
            鎴戠殑绌洪棿
          </h1>
        </div>
      </section>

      <div
        style={{
          fontSize: 14,
          color: "#6f7b6a",
          marginBottom: 18,
        }}
      >
        鎴戠殑椤圭洰 {archiveCount} 涓?路 鍏紑 {publicArchiveCount} 路 绉佸瘑 {privateArchiveCount}
        {endedArchiveCount > 0 ? ` 路 宸茬粨鏉?${endedArchiveCount}` : ""}
      </div>

      <ArchiveToolbar
        onCreateArchive={(category) => {
          if (contentBlocked) {
            showToast(getCreateContentBlockedText(membership));
            return;
          }

          router.push(`/archive/new?category=${category}`);
        }}
        createDisabled={contentBlocked}
        createDisabledTitle={contentBlocked ? getCreateContentBlockedText(membership) : undefined}
        createDisabledHref={contentBlocked ? "/membership" : undefined}
      />

      <ArchiveFiltersPanel
        activeCategory={activeCategory}
        activeSubTag={activeSubTag}
        visibleGroupTagCount={visibleGroupTags.length}
        plantSubTags={plantSubTags}
        methodFacilitySubTags={methodFacilitySubTags}
        insectFishSubTags={insectFishSubTags}
        otherSubTags={otherSubTags}
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

      <section
        style={{
          margin: "0 0 16px",
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <input
          value={searchKeyword}
          onChange={(event) => setSearchKeyword(event.target.value)}
          placeholder="鎼滅储椤圭洰銆佽褰曟垨鏍囩"
          style={{
            flex: "1 1 260px",
            minWidth: 0,
            border: "1px solid #dfe7d9",
            borderRadius: 999,
            padding: "10px 14px",
            fontSize: 14,
            outline: "none",
            background: "#fff",
          }}
        />

        <label
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            color: "#777",
            fontSize: 14,
          }}
        >
          鎺掑簭锛?
          <select
            value={sortMode}
            onChange={(event) => setSortMode(event.target.value as SortMode)}
            style={{
              border: "1px solid #dfe7d9",
              borderRadius: 999,
              padding: "9px 12px",
              fontSize: 14,
              background: "#fff",
              color: "#3d4a3d",
              cursor: "pointer",
            }}
          >
            <option value="updated">鏈€杩戞洿鏂?/option>
            <option value="created">鏂板缓椤哄簭</option>
            <option value="name">鎸夊悕瀛?/option>
          </select>
        </label>
      </section>

      <section>
        {activeArchives.length === 0 && endedArchives.length === 0 ? (
          <div
            style={{
              border: "1px dashed #d9e6d0",
              borderRadius: 18,
              padding: 26,
              textAlign: "center",
              color: "#7a857a",
              background: "#fcfdfb",
            }}
          >
            杩樻病鏈夋壘鍒伴」鐩€?
          </div>
        ) : (
          activeArchives.map((item) => (
            <ArchiveCard
              key={item.id}
              item={item}
              ended={false}
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
                setEditingPlantSearch(species.display_name || species.common_name || species.scientific_name || "鏈懡鍚嶆鐗?);
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
          ))
        )}
      </section>

      {endedArchives.length > 0 && (
        <section style={{ marginTop: activeArchives.length > 0 ? 26 : 0 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginBottom: 10,
              color: "#777",
            }}
          >
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>宸茬粨鏉?/h2>
            <span style={{ fontSize: 13 }}>杩欎簺椤圭洰宸茬粡鍛婁竴娈佃惤锛屼粛鐒朵繚瀛樺湪浣犵殑绌洪棿閲屻€?/span>
          </div>

          {endedArchives.map((item) => (
            <ArchiveCard
              key={item.id}
              item={item}
              ended
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
                setEditingPlantSearch(species.display_name || species.common_name || species.scientific_name || "鏈懡鍚嶆鐗?);
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
          ))}
        </section>
      )}
      <ConfirmDialog
        open={Boolean(deleteArchiveTarget)}
        title="鍒犻櫎椤圭洰"
        message={`纭畾鍒犻櫎鈥?{deleteArchiveTarget?.title || "杩欎釜椤圭洰"}鈥濆悧锛熼」鐩唴鐨勮褰曚細涓€璧峰垹闄わ紝鍒犻櫎鍚庢棤娉曟仮澶嶃€俙}
        confirmText={deletingArchiveId ? "鍒犻櫎涓?.." : "鍒犻櫎"}
        cancelText="鍙栨秷"
        danger
        onClose={() => {
          if (!deletingArchiveId) setDeleteArchiveTarget(null);
        }}
        onConfirm={confirmDeleteArchive}
      />

    </main>
  );
}

