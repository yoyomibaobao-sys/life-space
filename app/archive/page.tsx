"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { buildLoginHref } from "@/lib/auth-return";
import { showToast } from "@/components/Toast";
import ConfirmDialog from "@/components/ConfirmDialog";
import UiIcon from "@/components/ui/UiIcon";
import ArchiveWorkspaceTemplate from "@/components/archive-ui/ArchiveWorkspaceTemplate";
import ArchiveProjectCard from "@/components/archive-ui/ArchiveProjectCard";
import { localArchiveToProjectView } from "@/components/archive-ui/localArchiveProjectView";
import ArchiveTaxonomyPanel, {
  type ArchiveTaxonomyChip,
} from "@/components/archive-ui/ArchiveTaxonomyPanel";
import ArchiveCard from "@/components/archive/ArchiveCard";
import MobileArchiveActions from "@/components/archive/MobileArchiveActions";
import ArchiveSystemNameEditor from "@/components/archive/ArchiveSystemNameEditor";
import ArchiveCategoryDropdown from "@/components/archive/ArchiveCategoryDropdown";
import ArchiveGroupDropdown from "@/components/archive/ArchiveGroupDropdown";
import {
  archiveCategoryOptions,
  getArchiveCategoryLabel,
  type ArchiveCategory,
} from "@/lib/archive-categories";
import type {
  ArchiveItem,
  GroupTagItem,
  PlantSpeciesOption,
  SortMode,
  SubTagItem,
} from "@/lib/archive-page-types";
import type { PlantSpeciesAliasSearchRow } from "@/lib/domain-types";
import { resolveMediaDisplayPairs } from "@/lib/media-urls";
import {
  buildArchiveSearchText,
  getArchiveSortTime,
} from "@/lib/archive-page-utils";
import {
  dedupeSystemNameCandidates,
  getSystemNameCandidateLabels,
  getSystemNameCandidates,
  hasExactSystemNameCandidate,
  isStrongSystemNameAliasRelationType,
  type SystemNameCandidate,
} from "@/lib/system-name-candidates";
import {
  canCreateMembershipContent,
  getMembershipPlanLabel,
  getCreateContentBlockedText,
  normalizeMembershipRpcResult,
  type MyMembership,
} from "@/lib/membership";
import { formatStorage } from "@/lib/user-profile-shared";
import { requestCloudTrash } from "@/lib/cloud-trash";
import {
  createLocalTaxonomyItem,
  deleteLocalArchive,
  deleteLocalTaxonomyItem,
  markLocalArchiveForOwner,
  renameLocalTaxonomyItem,
  updateLocalArchiveFields,
  listVisibleLocalTaxonomyItems,
  listVisibleLocalArchiveSummaries,
  markUnownedLocalArchivesForOwner,
  type LocalArchiveOwnerContext,
  type LocalArchiveSummary,
  type LocalTaxonomyItem,
} from "@/lib/local-offline-db";
import { useLanguage } from "@/lib/i18n/useLanguage";
import MobileNotificationLink from "@/components/mobile/MobileNotificationLink";
import MobilePageHeader from "@/components/mobile/MobilePageHeader";
import {
  DEFAULT_ARCHIVE_CATEGORY_DEPTHS,
  getArchiveCategoryDepth,
  getCloudArchiveCategoryDepths,
  getLocalArchiveCategoryDepths,
  type ArchiveCategoryDepths,
} from "@/lib/archive-category-settings";

type LatestArchiveRecord = {
  id: string;
  archive_id: string | null;
  note?: string | null;
  record_time?: string | null;
  primary_image_url?: string | null;
  primary_thumb_url?: string | null;
  media_count?: number | null;
};

type ArchiveMediaRow = {
  record_id?: string | null;
  url?: string | null;
  thumb_url?: string | null;
  storage_path?: string | null;
  thumb_path?: string | null;
  display_url?: string | null;
  display_thumb_url?: string | null;
};

type SpaceProfile = {
  username: string | null;
  avatar_url: string | null;
  storage_used: number | null;
  storage_limit: number | null;
};

const emptySystemNameCandidateMap: Record<ArchiveCategory, SystemNameCandidate[]> = {
  plant: [],
  system: [],
  insect_fish: [],
  other: [],
};


export default function ArchivePage() {
  const router = useRouter();
  const { language, t } = useLanguage();
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
  const [editingLocalSystemArchiveId, setEditingLocalSystemArchiveId] = useState<string | null>(null);
  const [editingLocalSystemName, setEditingLocalSystemName] = useState("");
  const [editingLocalSystemSearch, setEditingLocalSystemSearch] = useState("");
  const [savingLocalSystemArchiveId, setSavingLocalSystemArchiveId] = useState<string | null>(null);
  const [plantSuggestionsOpen, setPlantSuggestionsOpen] = useState(false);
  const [systemSuggestionsOpen, setSystemSuggestionsOpen] = useState(false);
  const [localSystemSuggestionsOpen, setLocalSystemSuggestionsOpen] = useState(false);
  const [systemNameCandidateMap, setSystemNameCandidateMap] =
    useState<Record<ArchiveCategory, SystemNameCandidate[]>>(emptySystemNameCandidateMap);

  const [activeCategory, setActiveCategory] = useState<ArchiveCategory | null>(null);
  const [activeSubTag, setActiveSubTag] = useState<string | null>(null);
  const [activeGroupTag, setActiveGroupTag] = useState<string | null>(null);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("updated");
  const [deleteArchiveTarget, setDeleteArchiveTarget] = useState<ArchiveItem | null>(null);
  const [deletingArchiveId, setDeletingArchiveId] = useState<string | null>(null);
  const [membership, setMembership] = useState<MyMembership | null>(null);
  const [experienceCardCount, setExperienceCardCount] = useState(0);
  const [spaceProfile, setSpaceProfile] = useState<SpaceProfile | null>(null);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [currentOwnerContext, setCurrentOwnerContext] = useState<LocalArchiveOwnerContext | null>(null);
  const [activeSource, setActiveSource] = useState<ArchiveSourceFilter>("all");
  const [localArchives, setLocalArchives] = useState<LocalArchiveSummary[]>([]);
  const [localTaxonomyItems, setLocalTaxonomyItems] = useState<LocalTaxonomyItem[]>([]);
  const [localLoading, setLocalLoading] = useState(true);
  const [localError, setLocalError] = useState("");
  const [localUnownedCount, setLocalUnownedCount] = useState(0);
  const [localHiddenOwnedByOtherCount, setLocalHiddenOwnedByOtherCount] = useState(0);
  const [localOwnershipPromptDismissed, setLocalOwnershipPromptDismissed] = useState(false);
  const [markingLocalOwner, setMarkingLocalOwner] = useState(false);
  const [cloudCategoryDepths, setCloudCategoryDepths] = useState<ArchiveCategoryDepths>({
    ...DEFAULT_ARCHIVE_CATEGORY_DEPTHS,
  });
  const [localCategoryDepths, setLocalCategoryDepths] = useState<ArchiveCategoryDepths>({
    ...DEFAULT_ARCHIVE_CATEGORY_DEPTHS,
  });

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
      const [result, taxonomyItems] = await Promise.all([
        listVisibleLocalArchiveSummaries(ownerContext),
        listVisibleLocalTaxonomyItems(ownerContext),
      ]);
      setLocalArchives(result.archives);
      setLocalTaxonomyItems(taxonomyItems);
      setLocalUnownedCount(result.unownedCount);
      setLocalHiddenOwnedByOtherCount(result.hiddenOwnedByOtherCount);
      setLocalError("");
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : t.archive_workspace.read_local_failed);
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
      setLocalCategoryDepths(getLocalArchiveCategoryDepths(user?.id));

      if (!user) {
        setArchives([]);
        setGroupTags([]);
        setSubTags([]);
        setSpeciesList([]);
        setMembership(null);
        setExperienceCardCount(0);
        setSpaceProfile(null);
        return;
      }

      try {
        setCloudCategoryDepths(await getCloudArchiveCategoryDepths(user.id));
      } catch (settingsError) {
        console.error("load archive category settings error:", settingsError);
        setCloudCategoryDepths({ ...DEFAULT_ARCHIVE_CATEGORY_DEPTHS });
      }

      const [
        { data: archivesData },
        { data: groupTagsData },
        { data: subTagsData },
        { data: speciesData },
        { data: aliasData },
        { data: archiveFollowRows },
        membershipResult,
        experienceCardCountResult,
        profileResult,
      ] = await Promise.all([
        supabase.from("archives").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
        supabase.from("group_tags").select("*").eq("user_id", user.id),
        supabase.from("sub_tags").select("*").eq("user_id", user.id),
        supabase
          .from("plant_species")
          .select("id, common_name, scientific_name, slug, category, is_active")
          .eq("is_active", true)
          .order("common_name", { ascending: true }),
        supabase
          .from("plant_species_aliases")
          .select("species_id, alias_name, normalized_name, alias_type, relation_type, plant_species!inner(is_active)")
          .eq("plant_species.is_active", true),
        supabase.from("archive_follows").select("archive_id"),
        supabase.rpc("get_my_membership"),
        supabase
          .from("experience_cards")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id),
        supabase
          .from("profiles")
          .select("username, avatar_url, storage_used, storage_limit")
          .eq("id", user.id)
          .maybeSingle(),
      ]);

      const aliasesBySpecies = new Map<string, string[]>();
      ((aliasData || []) as PlantSpeciesAliasSearchRow[]).forEach((alias) => {
        if (!isStrongSystemNameAliasRelationType(alias.relation_type)) return;
        const list = aliasesBySpecies.get(alias.species_id) || [];
        if (alias.alias_name) list.push(alias.alias_name);
        if (alias.normalized_name && alias.normalized_name !== alias.alias_name) {
          list.push(alias.normalized_name);
        }
        aliasesBySpecies.set(alias.species_id, list);
      });

      const speciesRows: PlantSpeciesOption[] = ((speciesData || []) as PlantSpeciesOption[]).map((species) => {
        const aliases = Array.from(new Set(aliasesBySpecies.get(species.id) || []));
        const displayName =
          species.common_name ||
          species.scientific_name ||
          t.archive_workspace.unnamed_plant;

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
      const archiveItems = (archivesData || []) as ArchiveItem[];
      const latestRecordMap = new Map<string, LatestArchiveRecord>();
      let latestRecords: LatestArchiveRecord[] = [];
      let mediaRows: ArchiveMediaRow[] = [];

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
          latestRecords = (latestRecordRows || []) as LatestArchiveRecord[];
          const latestRecordIds = latestRecords.map((record) => record.id).filter(Boolean);

          if (latestRecordIds.length > 0) {
            const { data: recordMediaRows, error: mediaError } = await supabase
              .from("media")
              .select("record_id, url, thumb_url, storage_path, thumb_path, sort_order, created_at")
              .in("record_id", latestRecordIds)
              .order("sort_order", { ascending: true })
              .order("created_at", { ascending: true });

            if (mediaError) {
              console.error("load latest archive record thumbnails error:", mediaError);
            } else {
              mediaRows = (recordMediaRows || []) as ArchiveMediaRow[];
            }
          }
        }
      }

      const archiveSourceCount = archiveItems.length;
      const latestRecordSourceCount = latestRecords.length;
      const displayPairs = await resolveMediaDisplayPairs(supabase, [
        ...archiveItems.map((item) => ({
          url: item.cover_image_url,
          path: item.cover_image_path,
          thumb_path: item.cover_thumb_path,
        })),
        ...latestRecords.map((record) => ({ url: record.primary_image_url })),
        ...mediaRows,
      ]);
      const archiveCoverPairs = displayPairs.slice(0, archiveSourceCount);
      const latestRecordPairs = displayPairs.slice(
        archiveSourceCount,
        archiveSourceCount + latestRecordSourceCount
      );
      const displayMediaRows = mediaRows.map((media, index) => ({
        ...media,
        ...displayPairs[archiveSourceCount + latestRecordSourceCount + index],
      }));
      const mediaByRecordId = new Map<string, ArchiveMediaRow[]>();
      displayMediaRows.forEach((media) => {
        if (!media.record_id) return;
        const list = mediaByRecordId.get(media.record_id) || [];
        list.push(media);
        mediaByRecordId.set(media.record_id, list);
      });

      latestRecords.forEach((record, index) => {
        if (!record.archive_id || latestRecordMap.has(record.archive_id)) return;
        const mediaList = mediaByRecordId.get(record.id) || [];
        const matchedPrimary = mediaList.find(
          (media) => media.url && record.primary_image_url && media.url === record.primary_image_url
        );
        const firstThumb = mediaList.find((media) => media.display_thumb_url);
        const firstImage = mediaList.find((media) => media.display_url);
        latestRecordMap.set(record.archive_id, {
          ...record,
          primary_image_url:
            matchedPrimary?.display_url ||
            firstImage?.display_url ||
            latestRecordPairs[index]?.display_url ||
            null,
          primary_thumb_url:
            matchedPrimary?.display_thumb_url || firstThumb?.display_thumb_url || null,
        });
      });

      const enrichedArchives: ArchiveItem[] = archiveItems.map((item, index) => {
        const latestRecord = latestRecordMap.get(item.id);

        return {
          ...item,
          display_cover_image_url:
            archiveCoverPairs[index]?.display_url || null,
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
      if (experienceCardCountResult.error) {
        console.error(
          "load my experience card count error:",
          experienceCardCountResult.error
        );
      } else {
        setExperienceCardCount(Number(experienceCardCountResult.count || 0));
      }
      setSpaceProfile((profileResult.data as SpaceProfile | null) || null);
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
      showToast(t.archive_workspace.enter_candidate_name);
      return;
    }

    setEditingSpeciesId("");
    setEditingPendingSpeciesName(pendingName);
    setEditingPlantSearch(pendingName);
    setPlantSuggestionsOpen(false);
  }

  function getSystemNameCandidateOptions(
    category: ArchiveCategory | null,
    keyword = "",
    currentValue?: string | null,
    limit = 8
  ) {
    if (!category) return [];

    const candidates = dedupeSystemNameCandidates(
      systemNameCandidateMap[category] || [],
      currentValue
    );
    const normalizedKeyword = keyword.trim().toLowerCase();

    return candidates
      .filter((candidate) => {
        if (!normalizedKeyword) return true;
        return String(candidate.searchText || candidate.label)
          .toLowerCase()
          .includes(normalizedKeyword);
      })
      .slice(0, limit);
  }

  function toPlantSpeciesOption(candidate: SystemNameCandidate): PlantSpeciesOption {
    return {
      id: candidate.plantId || candidate.id || candidate.label,
      common_name: candidate.label,
      scientific_name: candidate.description || null,
      slug: candidate.plantSlug || null,
      category: null,
      is_active: true,
      aliases: candidate.aliases || [],
      display_name: candidate.label,
      search_text: candidate.searchText || candidate.label.toLowerCase(),
    };
  }

  const plantSearchResults = useMemo(() => {
    return getSystemNameCandidateOptions("plant", editingPlantSearch, null, 8).map(
      toPlantSpeciesOption
    );
  }, [editingPlantSearch, systemNameCandidateMap]);

  const hasExactPlantMatch = useMemo(() => {
    return hasExactSystemNameCandidate(
      getSystemNameCandidateOptions("plant", "", null, 300),
      editingPlantSearch
    );
  }, [editingPlantSearch, systemNameCandidateMap]);

  async function savePlantSelection(item: ArchiveItem) {
    const pendingName = editingPendingSpeciesName.trim();

    if (!editingSpeciesId && !pendingName) {
      showToast(t.archive_workspace.select_plant_or_candidate);
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
          language_code: language,
          status: "pending",
        },
      ]);

      const { error } = await supabase
        .from("archives")
        .update({ species_id: null, species_name_snapshot: pendingName })
        .eq("id", item.id);

      if (error) {
        showToast(t.archive_workspace.save_failed);
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
      showToast(t.archive_workspace.candidate_selected);
      return;
    }

    const selectedSpecies = speciesList.find((item) => item.id === editingSpeciesId);
    if (!selectedSpecies) {
      showToast(t.archive_workspace.select_plant);
      return;
    }

    const speciesName =
      selectedSpecies.common_name ||
      selectedSpecies.scientific_name ||
      t.archive_workspace.unnamed_plant;

    const { error } = await supabase
      .from("archives")
      .update({ species_id: selectedSpecies.id, species_name_snapshot: speciesName })
      .eq("id", item.id);

    if (error) {
      showToast(t.archive_workspace.save_failed);
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
    showToast(t.archive_workspace.plant_updated);
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
    return getSystemNameCandidateLabels(
      getSystemNameCandidateOptions(
        category,
        keyword,
        editingSystemName || editingSystemSearch,
        6
      )
    );
  }

  function hasExactSystemNameMatch(category: ArchiveCategory | null) {
    return hasExactSystemNameCandidate(
      getSystemNameCandidateOptions(
        category,
        "",
        editingSystemName || editingSystemSearch,
        300
      ),
      editingSystemSearch
    );
  }

  async function saveSystemSelection(item: ArchiveItem) {
    const systemName = editingSystemName.trim();
    if (!systemName) {
      showToast(t.archive_workspace.select_specific_name);
      return;
    }

    const { error } = await supabase
      .from("archives")
      .update({ system_name: systemName })
      .eq("id", item.id);

    if (error) {
      showToast(t.archive_workspace.save_failed);
      return;
    }

    setArchives((prev) =>
      prev.map((archive) => (archive.id === item.id ? { ...archive, system_name: systemName } : archive))
    );

    cancelSystemEditing();
    showToast(t.archive_workspace.specific_name_updated);
  }

  function cancelSystemEditing() {
    setEditingSystemArchiveId(null);
    setEditingSystemSearch("");
    setEditingSystemName("");
    setSystemSuggestionsOpen(false);
  }

  async function createSubTag(category: ArchiveCategory) {
    const name = prompt(
      `${t.archive_workspace.add_category_prompt_prefix}${getArchiveCategoryLabel(
        category,
        language
      )}${t.archive_workspace.add_category_prompt_suffix}`
    );
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
      showToast(t.archive_workspace.add_category_failed);
      return;
    }

    if (data) {
      setSubTags((prev) => [...prev, data as SubTagItem]);
    }
  }

  async function renameSubTag(tag: SubTagItem, suppliedName?: string) {
    const name = suppliedName ?? prompt(t.archive_workspace.rename_category_prompt, tag.name);
    if (!name?.trim() || name.trim() === tag.name) return;

    const { error } = await supabase.from("sub_tags").update({ name: name.trim() }).eq("id", tag.id);
    if (error) {
      showToast(t.archive_workspace.rename_category_failed);
      return;
    }

    setSubTags((prev) => prev.map((item) => (item.id === tag.id ? { ...item, name: name.trim() } : item)));
  }

  async function deleteSubTag(tag: SubTagItem) {
    if (!confirm(t.archive_workspace.delete_category_confirm)) return;

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

    const name = prompt(t.archive_workspace.add_group_prompt);
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
      showToast(t.archive_workspace.add_group_failed);
      return;
    }

    if (data) {
      setGroupTags((prev) => [...prev, data as GroupTagItem]);
    }
  }

  async function renameGroupTag(tag: GroupTagItem, suppliedName?: string) {
    const name = suppliedName ?? prompt(t.archive_workspace.rename_group_prompt, tag.name);
    if (!name?.trim() || name.trim() === tag.name) return;

    const { error } = await supabase.from("group_tags").update({ name: name.trim() }).eq("id", tag.id);
    if (error) {
      showToast(t.archive_workspace.rename_group_failed);
      return;
    }

    setGroupTags((prev) => prev.map((item) => (item.id === tag.id ? { ...item, name: name.trim() } : item)));
  }

  async function deleteGroupTag(tag: GroupTagItem) {
    if (!confirm(t.archive_workspace.delete_group_confirm)) return;

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

    if (isEnding && !confirm(t.archive.end_project_message)) {
      return;
    }

    const { error } = await supabase.rpc(
      isEnding ? "mark_archive_ended" : "restore_archive_active",
      { p_archive_id: item.id }
    );

    if (error) {
      showToast(isEnding ? t.archive.end_failed : t.archive.restore_failed);
      return;
    }

    await loadData();
    showToast(isEnding ? t.archive.marked_ended : t.archive.restored_ongoing);
  }

  async function toggleArchivePublic(item: ArchiveItem) {
    const newValue = !item.is_public;
    const nextRecordVisibility = newValue ? "public" : "private";

    const { error } = await supabase.from("archives").update({ is_public: newValue }).eq("id", item.id);
    if (error) {
      showToast(t.archive_workspace.visibility_update_failed);
      return;
    }

    if (!newValue) {
      const { error: recordsError } = await supabase
        .from("records")
        .update({ visibility: nextRecordVisibility })
        .eq("archive_id", item.id);

      if (recordsError) {
        showToast(t.archive_workspace.record_sync_failed);
        return;
      }
    }

    setArchives((prev) =>
      prev.map((archive) => (archive.id === item.id ? { ...archive, is_public: newValue } : archive))
    );
    showToast(
      newValue
        ? t.archive.project_shell_public_old_private
        : t.archive.project_and_records_private
    );
  }

  async function updateArchiveCategory(item: ArchiveItem, value: string) {
    if (archiveCategoryOptions.some((option) => option.value === value)) {
      const { error } = await supabase
        .from("archives")
        .update({ category: value, sub_tag_id: null, group_tag_id: null })
        .eq("id", item.id);

      if (error) {
        showToast(t.archive_workspace.category_update_failed);
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
      showToast(t.archive_workspace.category_update_failed);
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
      showToast(t.archive_workspace.group_update_failed);
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
    const trashed = await requestCloudTrash("archives", deleteArchiveTarget.id);
    setDeletingArchiveId(null);

    if (!trashed) {
      showToast(t.archive.trash_failed);
      return;
    }

    const deletedArchiveId = deleteArchiveTarget.id;
    setDeleteArchiveTarget(null);
    setArchives((current) => current.filter((archive) => archive.id !== deletedArchiveId));
    showToast(t.archive.moved_to_trash);
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
      showToast(
        markedCount > 0
          ? t.archive_workspace.marked_as_mine
          : t.archive_workspace.no_unowned_projects
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : t.archive_workspace.ownership_failed);
    } finally {
      setMarkingLocalOwner(false);
    }
  }

  async function markSingleLocalArchiveAsMine(archive: LocalArchiveSummary) {
    if (!currentOwnerContext?.userId) {
      showToast(t.archive_workspace.login_to_mark);
      return;
    }

    try {
      await markLocalArchiveForOwner(archive.id, {
        userId: currentOwnerContext.userId,
        email: currentOwnerContext.email || null,
      });
      await loadLocalArchives(currentOwnerContext);
      showToast(t.archive_workspace.marked_as_mine);
    } catch (err) {
      showToast(err instanceof Error ? err.message : t.archive_workspace.ownership_failed);
    }
  }

  function renameArchiveTitle(item: ArchiveItem) {
    const name = prompt(t.archive_workspace.rename_project_prompt, item.title || "");
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

  useEffect(() => {
    let isCancelled = false;

    async function loadSystemNameCandidateMap() {
      const categories: ArchiveCategory[] = ["plant", "system", "insect_fish", "other"];
      const entries = await Promise.all(
        categories.map(async (category) => {
          const candidates = await getSystemNameCandidates({
            category,
            mode: "cloud",
            supabase,
            userId: currentOwnerContext?.userId || null,
            cloudExistingNames: archives
              .filter((archive) => archive.category === category)
              .map((archive) => archive.system_name || archive.species_display_name || archive.species_name_snapshot),
            localExistingNames: localArchives
              .filter((archive) => archive.category === category)
              .map((archive) => archive.system_name || archive.species_name),
            plantSpeciesRows: category === "plant" ? speciesList : undefined,
            limit: 300,
          });

          return [category, candidates] as const;
        })
      );

      if (!isCancelled) {
        setSystemNameCandidateMap({
          ...emptySystemNameCandidateMap,
          ...(Object.fromEntries(entries) as Record<ArchiveCategory, SystemNameCandidate[]>),
        });
      }
    }

    void loadSystemNameCandidateMap();

    return () => {
      isCancelled = true;
    };
  }, [archives, currentOwnerContext?.userId, localArchives, speciesList]);

  const archiveCount = archives.length;
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
  const contentBlocked = !canCreateMembershipContent(membership);
  const membershipLabel = getMembershipPlanLabel(membership?.plan, language);
  const storageUsedBytes = Math.max(0, Number(spaceProfile?.storage_used || 0));
  const storageLimitBytes = Math.max(
    0,
    Number(membership?.storage_limit_bytes || spaceProfile?.storage_limit || 0)
  );
  const storageUsagePercent = storageLimitBytes > 0
    ? Math.min(100, (storageUsedBytes / storageLimitBytes) * 100)
    : 0;
  const storageTotalLabel = storageLimitBytes > 0
    ? formatStorage(storageLimitBytes)
    : "—";

  const activeCloudDepth = getArchiveCategoryDepth(cloudCategoryDepths, activeCategory);
  const activeLocalDepth = getArchiveCategoryDepth(localCategoryDepths, activeCategory);
  const cloudSubcategoryChips: ArchiveTaxonomyChip[] = activeCategory && activeCloudDepth >= 2
    ? subTags
        .filter((tag) => tag.category === activeCategory)
        .map((tag) => ({ id: tag.id, label: tag.name }))
    : [];
  const currentSubTag = subTags.find((tag) => tag.id === activeSubTag) || null;
  const visibleGroupTags = activeCloudDepth >= 3 && activeSubTag && currentSubTag
    ? groupTags.filter((tag) => tag.sub_tag_id === activeSubTag)
    : [];
  const cloudGroupChips: ArchiveTaxonomyChip[] = visibleGroupTags.map((tag) => ({
    id: tag.id,
    label: tag.name,
  }));

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
  const localSubTags = useMemo<ArchiveTaxonomyChip[]>(() => {
    if (!activeCategory || activeLocalDepth < 2) return [];

    return localTaxonomyItems
      .filter(
        (item) =>
          item.kind === "subcategory" &&
          item.category === activeCategory &&
          item.label
      )
      .map((item) => ({ id: item.label, label: item.label }))
      .filter((item, index, list) => list.findIndex((other) => other.id === item.id) === index)
      .sort((a, b) => a.label.localeCompare(b.label, "zh-CN"));
  }, [activeCategory, activeLocalDepth, localTaxonomyItems]);
  const localGroupTags = useMemo<ArchiveTaxonomyChip[]>(() => {
    if (!activeCategory || !activeSubTag || activeLocalDepth < 3) return [];

    return localTaxonomyItems
      .filter(
        (item) =>
          item.kind === "group" &&
          item.category === activeCategory &&
          item.subcategory === activeSubTag &&
          item.label
      )
      .map((item) => ({ id: item.label, label: item.label }))
      .filter((item, index, list) => list.findIndex((other) => other.id === item.id) === index)
      .sort((a, b) => a.label.localeCompare(b.label, "zh-CN"));
  }, [activeCategory, activeLocalDepth, activeSubTag, localTaxonomyItems]);
  const localSubTagItems = useMemo<SubTagItem[]>(
    () =>
      localTaxonomyItems
        .filter((item) => item.kind === "subcategory" && item.category && item.label)
        .map((item) => ({
          id: item.label,
          name: item.label,
          category: item.category as ArchiveCategory,
        }))
        .filter((item, index, list) => list.findIndex((other) => other.id === item.id && other.category === item.category) === index),
    [localTaxonomyItems]
  );
  const localGroupTagItems = useMemo<GroupTagItem[]>(
    () =>
      localTaxonomyItems
        .filter((item) => item.kind === "group" && item.category && item.subcategory && item.label)
        .map((item) => ({
          id: item.label,
          name: item.label,
          sub_tag_id: item.subcategory || "",
        }))
        .filter((item, index, list) => list.findIndex((other) => other.id === item.id && other.sub_tag_id === item.sub_tag_id) === index),
    [localTaxonomyItems]
  );

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
      router.push(buildLoginHref("/archive"));
      return;
    }

    if (contentBlocked) {
      showToast(getCreateContentBlockedText(membership, language));
      return;
    }

    router.push(`/archive/new?category=${category}`);
  }

  async function createLocalSubcategory(category: ArchiveCategory) {
    const name = prompt(
      `${t.archive_workspace.add_local_subcategory_prefix}${getArchiveCategoryLabel(
        category,
        language
      )}${t.archive_workspace.add_local_subcategory_suffix}`
    );
    if (!name?.trim()) return;

    try {
      await createLocalTaxonomyItem(
        { kind: "subcategory", category, label: name },
        currentOwnerContext
      );
      await loadLocalArchives(currentOwnerContext);
      showToast(t.archive_workspace.local_subcategory_added);
    } catch (error) {
      showToast(
        error instanceof Error
          ? error.message
          : t.archive_workspace.local_subcategory_add_failed
      );
    }
  }

  async function deleteLocalSubcategory(chip: ArchiveTaxonomyChip) {
    if (!activeCategory) return;
    if (!confirm(t.archive_workspace.local_subcategory_delete_confirm)) return;

    try {
      await deleteLocalTaxonomyItem(
        { kind: "subcategory", category: activeCategory, label: chip.label },
        currentOwnerContext
      );
      updateFilterWithoutJump(() => {
        if (activeSubTag === chip.id) {
          setActiveSubTag(null);
          setActiveGroupTag(null);
        }
      });
      await loadLocalArchives(currentOwnerContext);
      showToast(t.archive_workspace.local_subcategory_deleted);
    } catch (error) {
      showToast(
        error instanceof Error
          ? error.message
          : t.archive_workspace.local_subcategory_delete_failed
      );
    }
  }

  async function renameLocalSubcategory(chip: ArchiveTaxonomyChip, suppliedName?: string) {
    if (!activeCategory) return;
    const name = suppliedName ?? prompt(t.archive_workspace.local_subcategory_rename_prompt, chip.label);
    const cleanName = name?.trim();
    if (!cleanName || cleanName === chip.label) return;

    try {
      await renameLocalTaxonomyItem(
        {
          kind: "subcategory",
          category: activeCategory,
          oldLabel: chip.label,
          newLabel: cleanName,
        },
        currentOwnerContext
      );
      updateFilterWithoutJump(() => {
        if (activeSubTag === chip.id) {
          setActiveSubTag(cleanName);
          setActiveGroupTag(null);
        }
      });
      await loadLocalArchives(currentOwnerContext);
      showToast(t.archive_workspace.local_subcategory_renamed);
    } catch (error) {
      showToast(
        error instanceof Error
          ? error.message
          : t.archive_workspace.local_subcategory_rename_failed
      );
    }
  }

  async function createLocalGroup() {
    if (!activeCategory || !activeSubTag) return;
    const name = prompt(t.archive_workspace.add_local_group);
    if (!name?.trim()) return;

    try {
      await createLocalTaxonomyItem(
        {
          kind: "group",
          category: activeCategory,
          subcategory: activeSubTag,
          label: name,
        },
        currentOwnerContext
      );
      await loadLocalArchives(currentOwnerContext);
      showToast(t.archive_workspace.local_group_added);
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : t.archive_workspace.local_group_add_failed
      );
    }
  }

  async function deleteLocalGroup(chip: ArchiveTaxonomyChip) {
    if (!activeCategory || !activeSubTag) return;
    if (!confirm(t.archive_workspace.local_group_delete_confirm)) return;

    try {
      await deleteLocalTaxonomyItem(
        {
          kind: "group",
          category: activeCategory,
          subcategory: activeSubTag,
          label: chip.label,
        },
        currentOwnerContext
      );
      updateFilterWithoutJump(() => {
        if (activeGroupTag === chip.id) setActiveGroupTag(null);
      });
      await loadLocalArchives(currentOwnerContext);
      showToast(t.archive_workspace.local_group_deleted);
    } catch (error) {
      showToast(
        error instanceof Error
          ? error.message
          : t.archive_workspace.local_group_delete_failed
      );
    }
  }

  async function renameLocalGroup(chip: ArchiveTaxonomyChip, suppliedName?: string) {
    if (!activeCategory || !activeSubTag) return;
    const name = suppliedName ?? prompt(t.archive_workspace.local_group_rename_prompt, chip.label);
    const cleanName = name?.trim();
    if (!cleanName || cleanName === chip.label) return;

    try {
      await renameLocalTaxonomyItem(
        {
          kind: "group",
          category: activeCategory,
          subcategory: activeSubTag,
          oldLabel: chip.label,
          newLabel: cleanName,
        },
        currentOwnerContext
      );
      updateFilterWithoutJump(() => {
        if (activeGroupTag === chip.id) setActiveGroupTag(cleanName);
      });
      await loadLocalArchives(currentOwnerContext);
      showToast(t.archive_workspace.local_group_renamed);
    } catch (error) {
      showToast(
        error instanceof Error
          ? error.message
          : t.archive_workspace.local_group_rename_failed
      );
    }
  }

  async function renameLocalArchiveTitle(archive: LocalArchiveSummary) {
    const name = prompt(t.archive_workspace.rename_local_project, archive.title || "");
    const cleanName = name?.trim();
    if (!cleanName || cleanName === archive.title) return;

    try {
      await updateLocalArchiveFields(
        archive.id,
        { title: cleanName },
        currentOwnerContext
      );
      await loadLocalArchives(currentOwnerContext);
      showToast(t.archive_workspace.local_project_renamed);
    } catch (error) {
      showToast(
        error instanceof Error
          ? error.message
          : t.archive_workspace.local_project_rename_failed
      );
    }
  }

  async function renameLocalArchiveSystemName(archive: LocalArchiveSummary) {
    const systemName = archive.system_name || archive.species_name || "";
    setEditingLocalSystemArchiveId(archive.id);
    setEditingLocalSystemName(systemName);
    setEditingLocalSystemSearch(systemName);
    setLocalSystemSuggestionsOpen(false);
  }

  function cancelLocalArchiveSystemNameEditing() {
    setEditingLocalSystemArchiveId(null);
    setEditingLocalSystemName("");
    setEditingLocalSystemSearch("");
    setLocalSystemSuggestionsOpen(false);
  }

  async function saveLocalArchiveSystemName(archive: LocalArchiveSummary) {
    const cleanName = editingLocalSystemName.trim();
    if (!cleanName) {
      showToast(t.archive.system_name_empty);
      return;
    }
    if (savingLocalSystemArchiveId) return;

    setSavingLocalSystemArchiveId(archive.id);
    try {
      await updateLocalArchiveFields(
        archive.id,
        { system_name: cleanName },
        currentOwnerContext
      );
      cancelLocalArchiveSystemNameEditing();
      await loadLocalArchives(currentOwnerContext);
      showToast(t.archive_workspace.local_system_name_updated);
    } catch (error) {
      showToast(
        error instanceof Error
          ? error.message
          : t.archive_workspace.local_system_name_update_failed
      );
    } finally {
      setSavingLocalSystemArchiveId(null);
    }
  }

  async function updateLocalArchiveCategoryValue(archive: LocalArchiveSummary, value: string) {
    const categoryOption = archiveCategoryOptions.find((option) => option.value === value);
    const subcategoryOption = localSubTagItems.find((item) => item.id === value);
    if (!categoryOption && !subcategoryOption) return;

    try {
      await updateLocalArchiveFields(
        archive.id,
        categoryOption
          ? {
              category: categoryOption.value,
              subcategory: null,
              group_name: null,
            }
          : {
              category: subcategoryOption?.category,
              subcategory: subcategoryOption?.name || null,
              group_name: null,
            },
        currentOwnerContext
      );
      await loadLocalArchives(currentOwnerContext);
      showToast(t.archive_workspace.local_category_updated);
    } catch (error) {
      showToast(
        error instanceof Error
          ? error.message
          : t.archive_workspace.local_category_update_failed
      );
    }
  }

  async function updateLocalArchiveGroupValue(archive: LocalArchiveSummary, value: string) {
    try {
      await updateLocalArchiveFields(
        archive.id,
        { group_name: value || null },
        currentOwnerContext
      );
      await loadLocalArchives(currentOwnerContext);
      showToast(t.archive_workspace.local_group_updated);
    } catch (error) {
      showToast(
        error instanceof Error
          ? error.message
          : t.archive_workspace.local_group_update_failed
      );
    }
  }

  async function deleteLocalArchiveFromList(archive: LocalArchiveSummary) {
    if (
      !confirm(t.archive_workspace.delete_local_confirm)
    ) {
      return;
    }

    try {
      await deleteLocalArchive(archive.id);
      await loadLocalArchives(currentOwnerContext);
      showToast(t.archive_workspace.local_project_deleted);
    } catch (error) {
      showToast(
        error instanceof Error
          ? error.message
          : t.archive_workspace.local_project_delete_failed
      );
    }
  }

  async function toggleLocalArchiveEnded(archive: LocalArchiveSummary) {
    const nextEnded = archive.status !== "ended";
    try {
      await updateLocalArchiveFields(
        archive.id,
        {
          status: nextEnded ? "ended" : "active",
          ended_at: nextEnded ? new Date().toISOString() : null,
        },
        currentOwnerContext,
      );
      await loadLocalArchives(currentOwnerContext);
      showToast(
        nextEnded
          ? t.archive.marked_ended
          : t.archive.restored_ongoing,
      );
    } catch (error) {
      showToast(
        error instanceof Error
          ? error.message
          : t.archive.local_update_failed,
      );
    }
  }

  const createDisabled =
    activeSource !== "local" &&
    Boolean(currentOwnerContext?.userId) &&
    contentBlocked;

  const createDisabledText = createDisabled
    ? getCreateContentBlockedText(membership, language)
    : undefined;

  const workspaceFiltersSlot =
    activeSource === "cloud" ? (
      <ArchiveTaxonomyPanel
        activeCategory={activeCategory}
        activeSubcategoryId={activeSubTag}
        activeGroupId={activeGroupTag}
        subcategories={cloudSubcategoryChips}
        groups={cloudGroupChips}
        mobileMode={isMobileViewport}
        showSubcategoryRow={activeCloudDepth >= 2}
        showGroupRow={activeCloudDepth >= 3}
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
        onResetSubcategory={() =>
          updateFilterWithoutJump(() => {
            setActiveSubTag(null);
            setActiveGroupTag(null);
          })
        }
        onSelectSubcategory={(chip) =>
          updateFilterWithoutJump(() => {
            const tag = subTags.find((item) => item.id === chip.id);
            if (tag) setActiveCategory(tag.category);
            setActiveSubTag(chip.id);
            setActiveGroupTag(null);
          })
        }
        onRenameSubcategory={(chip, nextName) => {
          const tag = subTags.find((item) => item.id === chip.id);
          if (tag) return renameSubTag(tag, nextName);
        }}
        onDeleteSubcategory={(chip) => {
          const tag = subTags.find((item) => item.id === chip.id);
          if (tag) deleteSubTag(tag);
        }}
        onCreateSubcategory={createSubTag}
        onResetGroup={() =>
          updateFilterWithoutJump(() => {
            setActiveGroupTag(null);
          })
        }
        onSelectGroup={(chip) =>
          updateFilterWithoutJump(() => {
            setActiveGroupTag(activeGroupTag === chip.id ? null : chip.id);
          })
        }
        onRenameGroup={(chip, nextName) => {
          const tag = groupTags.find((item) => item.id === chip.id);
          if (tag) return renameGroupTag(tag, nextName);
        }}
        onDeleteGroup={(chip) => {
          const tag = groupTags.find((item) => item.id === chip.id);
          if (tag) deleteGroupTag(tag);
        }}
        onCreateGroup={createGroupTag}
      />
    ) : activeSource === "local" ? (
      <ArchiveTaxonomyPanel
        activeCategory={activeCategory}
        activeSubcategoryId={activeSubTag}
        activeGroupId={activeGroupTag}
        subcategories={localSubTags}
        groups={localGroupTags}
        mobileMode={isMobileViewport}
        showSubcategoryRow={activeLocalDepth >= 2}
        showGroupRow={activeLocalDepth >= 3}
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
        onResetSubcategory={() =>
          updateFilterWithoutJump(() => {
            setActiveSubTag(null);
            setActiveGroupTag(null);
          })
        }
        onSelectSubcategory={(chip) =>
          updateFilterWithoutJump(() => {
            setActiveSubTag(chip.id);
            setActiveGroupTag(null);
          })
        }
        onRenameSubcategory={renameLocalSubcategory}
        onDeleteSubcategory={deleteLocalSubcategory}
        onCreateSubcategory={createLocalSubcategory}
        onResetGroup={() =>
          updateFilterWithoutJump(() => {
            setActiveGroupTag(null);
          })
        }
        onSelectGroup={(chip) =>
          updateFilterWithoutJump(() => {
            setActiveGroupTag(activeGroupTag === chip.id ? null : chip.id);
          })
        }
        onRenameGroup={renameLocalGroup}
        onDeleteGroup={deleteLocalGroup}
        onCreateGroup={createLocalGroup}
      />
    ) : (
      <ArchiveTaxonomyPanel
        activeCategory={activeCategory}
        activeSubcategoryId={null}
        activeGroupId={null}
        subcategories={[]}
        groups={[]}
        mobileMode={isMobileViewport}
        showSubcategoryRow={false}
        showGroupRow={false}
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
        onResetSubcategory={() => undefined}
        onSelectSubcategory={() => undefined}
        onResetGroup={() => undefined}
        onSelectGroup={() => undefined}
      />
    );

  const workspaceNoticeSlot = (
    <>
      {activeSource === "local" ? (
        <div style={localOtherOwnerNoticeStyle}>
          {t.archive_workspace.local_taxonomy_notice}
        </div>
      ) : null}
      {showLocalArchives && currentOwnerContext?.userId && localUnownedCount > 0 && !localOwnershipPromptDismissed ? (
        <div style={localOwnershipNoticeStyle}>
          <span>
            {t.archive_workspace.unowned_local_notice}
          </span>
          <div style={localOwnershipActionRowStyle}>
            <button
              type="button"
              onClick={markLocalArchivesAsMine}
              disabled={markingLocalOwner}
              style={localOwnershipPrimaryButtonStyle}
            >
              {markingLocalOwner
                ? t.archive_workspace.marking
                : t.archive_workspace.mark_as_mine}
            </button>
            <button
              type="button"
              onClick={() => setLocalOwnershipPromptDismissed(true)}
              style={localOwnershipSecondaryButtonStyle}
            >
              {t.archive_workspace.dismiss}
            </button>
          </div>
        </div>
      ) : null}
      {showLocalArchives && localHiddenOwnedByOtherCount > 0 ? (
        <div style={localOtherOwnerNoticeStyle}>
          {t.archive_workspace.other_owner_notice}
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
        categoryDepths={cloudCategoryDepths}
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
          setEditingPlantSearch(
            species.display_name ||
              species.common_name ||
              species.scientific_name ||
              t.archive_workspace.unnamed_plant
          );
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
    <>
    <MobilePageHeader
      title={t.archive_workspace.my_space}
      titleText={t.archive_workspace.my_space}
      fallbackHref="/discover"
      showBack={false}
      ariaLabel={t.nav.back}
    />
    <main
      style={{
        padding: isMobileViewport ? "8px 8px 24px" : "22px 18px 42px",
        maxWidth: 1080,
        margin: "0 auto",
      }}
    >
      <section style={personalSpaceIdentityStyle(isMobileViewport)}>
        {isMobileViewport ? (
          <>
            <div style={personalSpaceIdentityLinkStyle}>
              <Link href="/profile" style={personalSpaceAvatarLinkStyle}>
              {spaceProfile?.avatar_url ? (
                <img
                  src={spaceProfile.avatar_url}
                  alt={spaceProfile.username || t.archive_workspace.personal_info}
                  style={{ ...personalSpaceAvatarStyle, width: 34, height: 34 }}
                />
              ) : (
                <span style={{ ...personalSpaceAvatarFallbackStyle, width: 34, height: 34 }}>
                  <UiIcon name="user" size={17} />
                </span>
              )}
              </Link>
              <span style={personalSpaceMobileIdentityTextStyle}>
                <span style={personalSpaceMobileNameRowStyle}>
                  <Link href="/profile" style={personalSpaceMobileUsernameStyle}>
                    {spaceProfile?.username || t.nav.username_unset}
                  </Link>
                  <span style={personalSpaceMobileMembershipStyle}>{membershipLabel}</span>
                </span>
                <span
                  style={personalSpaceStorageRowStyle}
                  aria-label={`${language === "en" ? "Storage total" : "总空间"} ${storageTotalLabel}`}
                >
                  <span style={personalSpaceStorageTrackStyle}>
                    <span
                      style={{
                        ...personalSpaceStorageFillStyle,
                        width: `${storageUsagePercent}%`,
                      }}
                    />
                  </span>
                  <span style={personalSpaceStorageTotalStyle}>{storageTotalLabel}</span>
                </span>
              </span>
            </div>
            <div style={personalSpaceMobileActionsStyle}>
              <Link href="/experience-cards" style={personalSpaceInlineEntryStyle}>
                {t.archive_workspace.experience_cards} {experienceCardCount}
              </Link>
              <MobileNotificationLink />
            </div>
          </>
        ) : (
          <>
            <div style={personalSpaceIdentityMainStyle}>
              {spaceProfile?.avatar_url ? (
                <img
                  src={spaceProfile.avatar_url}
                  alt={spaceProfile.username || t.archive_workspace.my_space}
                  style={personalSpaceAvatarStyle}
                />
              ) : (
                <span style={personalSpaceAvatarFallbackStyle}>
                  <UiIcon name="user" size={20} />
                </span>
              )}
              <div style={{ minWidth: 0 }}>
                <h1 style={personalSpaceTitleStyle}>{t.archive_workspace.my_space}</h1>
                <div style={personalSpaceUsernameStyle}>
                  {spaceProfile?.username || t.nav.username_unset}
                </div>
              </div>
            </div>
            <Link href="/experience-cards" style={personalInfoLinkStyle}>
              {t.archive_workspace.experience_cards} {experienceCardCount}
            </Link>
          </>
        )}
      </section>

      <ArchiveWorkspaceTemplate<ArchiveSourceFilter>
        sourceOptions={[
          {
            value: "all",
            label: t.archive_workspace.all,
            count: archiveCount + localArchives.length,
          },
          { value: "cloud", label: t.archive_workspace.cloud_space, count: archiveCount },
          { value: "local", label: t.archive_workspace.local, count: localArchives.length },
        ]}
        activeSource={activeSource}
        onSelectSource={handleSelectSource}
        onCreateArchive={handleCreateFromWorkspace}
        createDisabled={createDisabled}
        createDisabledTitle={createDisabledText}
        createDisabledHref={createDisabled ? "/membership" : undefined}
        showCreateToolbar={!isMobileViewport}
        sourceTrailingSlot={isMobileViewport ? (
          <Link href="/archive/new" style={personalSpaceCreateProjectStyle}>
            +{t.nav.project}
          </Link>
        ) : null}
        filtersSlot={workspaceFiltersSlot}
        noticeSlot={workspaceNoticeSlot}
      >
        {showCloudArchives ? (
          !currentOwnerContext?.userId ? (
            <div style={emptyPanelStyle}>
              {t.archive_workspace.login_cloud_hint}
            </div>
          ) : activeArchives.length === 0 && endedArchives.length === 0 ? (
            <div style={emptyPanelStyle}>
              {archiveCount === 0
                ? t.archive_workspace.no_cloud_projects
                : t.archive_workspace.no_cloud_matches}
            </div>
          ) : (
            <>
              {activeArchives.map((item) => renderCloudArchiveCard(item, false))}
              {endedArchives.length > 0 ? (
                <section style={{ marginTop: activeArchives.length > 0 ? 26 : 0 }}>
                  <div style={endedSectionHeaderStyle}>
                    <h2 style={endedSectionTitleStyle}>{t.archive_workspace.ended}</h2>
                    <span style={endedSectionTextStyle}>{t.archive_workspace.ended_hint}</span>
                  </div>
                  {endedArchives.map((item) => renderCloudArchiveCard(item, true))}
                </section>
              ) : null}
            </>
          )
        ) : null}

        {showLocalArchives ? (
          localLoading ? (
            <div style={emptyPanelStyle}>{t.archive_workspace.reading_local}</div>
          ) : localError ? (
            <div style={emptyPanelStyle}>{localError}</div>
          ) : localArchives.length === 0 ? (
            isMobileViewport ? null : (
              <div style={emptyPanelStyle}>{t.archive_workspace.no_local_projects}</div>
            )
          ) : filteredLocalArchives.length === 0 ? (
            <div style={emptyPanelStyle}>{t.archive_workspace.no_local_matches}</div>
          ) : (
            filteredLocalArchives.map((archive) => {
              const project = localArchiveToProjectView(
                archive,
                currentOwnerContext,
                language,
                getArchiveCategoryDepth(localCategoryDepths, archive.category),
              );
              const availableLocalGroups = archive.subcategory
                ? localGroupTagItems.filter((tag) => tag.sub_tag_id === archive.subcategory)
                : [];

              return (
                <ArchiveProjectCard
                  key={archive.id}
                  project={isMobileViewport ? project : { ...project, href: undefined }}
                  mobileMode={isMobileViewport}
                  systemNameEditorSlot={
                    editingLocalSystemArchiveId === archive.id ? (
                      <span
                        onClick={(event) => event.stopPropagation()}
                        style={localInlineEditWrapStyle}
                      >
                        <ArchiveSystemNameEditor
                          value={editingLocalSystemSearch}
                          selectedValue={editingLocalSystemName}
                          options={getSystemNameCandidateLabels(
                            getSystemNameCandidateOptions(
                              archive.category,
                              editingLocalSystemSearch,
                              archive.system_name || archive.species_name,
                              8
                            )
                          )}
                          suggestionsOpen={localSystemSuggestionsOpen}
                          hasExactMatch={hasExactSystemNameCandidate(
                            getSystemNameCandidateOptions(
                              archive.category,
                              "",
                              archive.system_name || archive.species_name,
                              300
                            ),
                            editingLocalSystemSearch
                          )}
                          onChange={(value) => {
                            setEditingLocalSystemSearch(value);
                            setEditingLocalSystemName("");
                            setLocalSystemSuggestionsOpen(true);
                          }}
                          onSelect={(name) => {
                            setEditingLocalSystemName(name);
                            setEditingLocalSystemSearch(name);
                            setLocalSystemSuggestionsOpen(false);
                          }}
                          onSave={() => void saveLocalArchiveSystemName(archive)}
                          onCancel={cancelLocalArchiveSystemNameEditing}
                        />
                      </span>
                    ) : undefined
                  }
                  selectControls={
                    !isMobileViewport ? (
                      <>
                        <ArchiveCategoryDropdown
                          value={archive.subcategory || archive.category}
                          subTags={localSubTagItems}
                          compact
                          onChange={(nextValue) => updateLocalArchiveCategoryValue(archive, nextValue)}
                        />
                        {archive.subcategory && availableLocalGroups.length > 0 ? (
                          <ArchiveGroupDropdown
                            value={archive.group_name || ""}
                            groupTags={availableLocalGroups}
                            compact
                            onChange={(nextValue) => updateLocalArchiveGroupValue(archive, nextValue)}
                          />
                        ) : null}
                      </>
                    ) : undefined
                  }
                  actionSlot={
                    isMobileViewport ? (
                      <MobileArchiveActions
                        category={archive.category}
                        subTagId={archive.subcategory}
                        groupTagId={archive.group_name}
                        subTags={localSubTagItems}
                        groupTags={localGroupTagItems}
                        categoryDepths={localCategoryDepths}
                        onChangeCategory={(value) => {
                          void updateLocalArchiveCategoryValue(archive, value);
                        }}
                        onChangeGroup={(value) => {
                          void updateLocalArchiveGroupValue(archive, value);
                        }}
                        ended={archive.status === "ended"}
                        onToggleEnded={() => void toggleLocalArchiveEnded(archive)}
                        extraActions={[
                          {
                            label: t.archive.transfer_to_cloud,
                            onClick: () => router.push(`/local/archive/${archive.id}?transfer=1`),
                          },
                          ...(!archive.local_owner_user_id && currentOwnerContext?.userId
                            ? [{
                                label: t.archive_workspace.mark_ownership,
                                onClick: () => void markSingleLocalArchiveAsMine(archive),
                              }]
                            : []),
                          {
                            label: t.archive_workspace.delete_local_project,
                            onClick: () => void deleteLocalArchiveFromList(archive),
                            danger: true,
                          },
                        ]}
                      />
                    ) : undefined
                  }
                  actionRailSlot={
                    !isMobileViewport ? (
                    <>
                      {!archive.local_owner_user_id && currentOwnerContext?.userId ? (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            void markSingleLocalArchiveAsMine(archive);
                          }}
                          style={localProjectRailButtonStyle}
                        >
                          {t.archive_workspace.mark_ownership}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          renameLocalArchiveTitle(archive);
                        }}
                        style={localProjectRailButtonStyle}
                      >
                        {t.archive_workspace.edit}
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          deleteLocalArchiveFromList(archive);
                        }}
                        style={localProjectRailDangerButtonStyle}
                      >
                        {t.archive_workspace.delete}
                      </button>
                    </>
                    ) : undefined
                  }
                  onClick={isMobileViewport ? undefined : () => router.push(`/local/archive/${archive.id}`)}
                  onEditTitle={() => renameLocalArchiveTitle(archive)}
                  onEditSystemName={() => renameLocalArchiveSystemName(archive)}
                />
              );
            })
          )
        ) : null}
      </ArchiveWorkspaceTemplate>
      <ConfirmDialog
        open={Boolean(deleteArchiveTarget)}
        title={t.archive_workspace.move_to_trash}
        message={t.archive_workspace.trash_message}
        confirmText={
          deletingArchiveId
            ? t.archive_workspace.moving_to_trash
            : t.archive_workspace.move_to_trash
        }
        cancelText={t.archive_workspace.cancel}
        danger
        confirmDisabled={Boolean(deletingArchiveId)}
        cancelDisabled={Boolean(deletingArchiveId)}
        onClose={() => {
          if (!deletingArchiveId) setDeleteArchiveTarget(null);
        }}
        onConfirm={confirmDeleteArchive}
      />
    </main>
    </>
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
  const { language, t } = useLanguage();

  return (
    <section style={workspaceFilterPanelStyle}>
      <div style={workspaceChipRowStyle}>
        <button type="button" onClick={onReset} style={workspacePillStyle(!activeCategory, language === "en")}>
          {t.archive_workspace.all}
        </button>
        {archiveCategoryOptions.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onSelectCategory(option.value)}
            style={workspacePillStyle(activeCategory === option.value, language === "en")}
          >
            {getArchiveCategoryLabel(option.value, language)}
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
  const { language, t } = useLanguage();

  return (
    <>
      <MainCategoryFilters
        activeCategory={activeCategory}
        onReset={onReset}
        onSelectCategory={onSelectCategory}
      />

      {activeCategory ? (
        <section style={workspaceFilterPanelStyle}>
          <div style={workspaceFilterLabelStyle}>{t.archive_workspace.local_subcategories}</div>
          <div style={workspaceChipRowStyle}>
            <button
              type="button"
              onClick={() => onSelectCategory(activeCategory)}
              style={workspacePillStyle(!activeSubTag, language === "en")}
            >
              {t.archive_workspace.all_subcategories}
            </button>
            {subTags.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => onSelectSubTag(tag)}
                style={workspacePillStyle(activeSubTag === tag, language === "en")}
              >
                {tag}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {activeCategory && activeSubTag ? (
        <section style={workspaceFilterPanelStyle}>
          <div style={workspaceFilterLabelStyle}>{t.archive_workspace.local_groups}</div>
          <div style={workspaceChipRowStyle}>
            <button
              type="button"
              onClick={() => onSelectGroup("")}
              style={workspacePillStyle(!activeGroupTag, language === "en")}
            >
              {t.archive_workspace.all_groups}
            </button>
            {groupTags.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => onSelectGroup(tag)}
                style={workspacePillStyle(activeGroupTag === tag, language === "en")}
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

function personalSpaceIdentityStyle(mobile: boolean): CSSProperties {
  return {
    position: "static",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: mobile ? 8 : 14,
    marginBottom: mobile ? 8 : 12,
    marginTop: 0,
    marginLeft: 0,
    marginRight: 0,
    padding: mobile
      ? "7px 2px"
      : "0 0 10px",
    borderBottom: "1px solid #edf1ea",
    background: "transparent",
  };
}

const personalSpaceIdentityLinkStyle: CSSProperties = {
  minWidth: 0,
  flex: 1,
  display: "flex",
  alignItems: "center",
  gap: 9,
  color: "#253725",
};

const personalSpaceAvatarLinkStyle: CSSProperties = {
  display: "inline-flex",
  flexShrink: 0,
  textDecoration: "none",
};

const personalSpaceMobileUsernameStyle: CSSProperties = {
  display: "block",
  minWidth: 0,
  overflow: "hidden",
  color: "#253725",
  fontSize: 16,
  fontWeight: 850,
  lineHeight: 1.15,
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  textDecoration: "none",
};

const personalSpaceMobileIdentityTextStyle: CSSProperties = {
  minWidth: 0,
  flex: 1,
  display: "grid",
  gap: 3,
};

const personalSpaceMobileNameRowStyle: CSSProperties = {
  minWidth: 0,
  display: "flex",
  alignItems: "baseline",
  gap: 6,
};

const personalSpaceMobileMembershipStyle: CSSProperties = {
  flexShrink: 0,
  color: "#6e7f69",
  fontSize: 11,
  fontWeight: 700,
  whiteSpace: "nowrap",
};

const personalSpaceStorageRowStyle: CSSProperties = {
  minWidth: 0,
  display: "flex",
  alignItems: "center",
  gap: 6,
};

const personalSpaceStorageTrackStyle: CSSProperties = {
  width: 76,
  maxWidth: 76,
  flex: "0 1 76px",
  height: 6,
  overflow: "hidden",
  borderRadius: 999,
  background: "#e3ebe0",
};

const personalSpaceStorageFillStyle: CSSProperties = {
  display: "block",
  height: "100%",
  borderRadius: 999,
  background: "linear-gradient(90deg, #78a96e, #3f7d3d)",
};

const personalSpaceStorageTotalStyle: CSSProperties = {
  color: "#7a8675",
  fontSize: 10,
  fontWeight: 700,
  whiteSpace: "nowrap",
};

const personalSpaceInlineEntryStyle: CSSProperties = {
  minHeight: 32,
  display: "inline-flex",
  alignItems: "center",
  color: "#4f604d",
  fontSize: 13,
  fontWeight: 700,
  lineHeight: 1.2,
  whiteSpace: "nowrap",
  textDecoration: "none",
};

const personalSpaceMobileActionsStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 3,
  flexShrink: 0,
};

const personalSpaceCreateProjectStyle: CSSProperties = {
  minHeight: 34,
  display: "inline-flex",
  alignItems: "center",
  padding: "0 10px",
  border: "1px solid #d8e5d4",
  borderRadius: 999,
  background: "#f4f9f1",
  color: "#3e703c",
  textDecoration: "none",
  fontSize: 13,
  fontWeight: 750,
  whiteSpace: "nowrap",
};

const personalSpaceIdentityMainStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  minWidth: 0,
};

const personalSpaceAvatarStyle: CSSProperties = {
  width: 42,
  height: 42,
  borderRadius: 999,
  objectFit: "cover",
  background: "#edf3ea",
  flexShrink: 0,
};

const personalSpaceAvatarFallbackStyle: CSSProperties = {
  width: 42,
  height: 42,
  display: "grid",
  placeItems: "center",
  borderRadius: 999,
  background: "#edf3ea",
  color: "#587155",
  flexShrink: 0,
};

const personalSpaceTitleStyle: CSSProperties = {
  margin: 0,
  color: "#1f2d1f",
  fontSize: 20,
  fontWeight: 700,
};

const personalSpaceUsernameStyle: CSSProperties = {
  marginTop: 2,
  overflow: "hidden",
  color: "#768272",
  fontSize: 13,
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const personalInfoLinkStyle: CSSProperties = {
  flexShrink: 0,
  minHeight: 34,
  display: "inline-flex",
  alignItems: "center",
  padding: "0 11px",
  border: "1px solid #dfe7dc",
  borderRadius: 999,
  color: "#526d50",
  textDecoration: "none",
  fontSize: 13,
  fontWeight: 750,
};

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

function workspacePillStyle(active: boolean, compactEnglish = false): CSSProperties {
  return {
    border: active ? "1px solid #3f7d3d" : "1px solid #cfe3c8",
    background: active ? "#3f7d3d" : "#f8fbf5",
    color: active ? "#fff" : "#335033",
    borderRadius: 999,
    padding: compactEnglish ? "7px 8px" : "7px 14px",
    fontSize: compactEnglish ? 12 : 15,
    fontWeight: 700,
    cursor: "pointer",
    lineHeight: compactEnglish ? 1.1 : 1.3,
    overflowWrap: compactEnglish ? "anywhere" : undefined,
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

const localInlineEditWrapStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  minWidth: 0,
  maxWidth: 320,
};

const localInlineEditInputStyle: CSSProperties = {
  width: 120,
  height: 28,
  border: "1px solid #d9e4d3",
  borderRadius: 8,
  background: "#fff",
  color: "#263326",
  padding: "0 8px",
  fontSize: 13,
  outline: "none",
};

const localInlineEditButtonStyle: CSSProperties = {
  border: "1px solid #cbdcc4",
  borderRadius: 999,
  background: "#f7fbf4",
  color: "#44633b",
  fontSize: 12,
  fontWeight: 800,
  padding: "5px 8px",
  cursor: "pointer",
};

const localInlineEditCancelStyle: CSSProperties = {
  border: "none",
  background: "transparent",
  color: "#7a8376",
  fontSize: 12,
  fontWeight: 700,
  padding: "5px 2px",
  cursor: "pointer",
};

const localProjectRailButtonStyle: CSSProperties = {
  border: "none",
  background: "transparent",
  color: "#8a8f84",
  cursor: "pointer",
  fontSize: 12,
  padding: 0,
  whiteSpace: "nowrap",
};

const localProjectRailDangerButtonStyle: CSSProperties = {
  ...localProjectRailButtonStyle,
  color: "#d66",
};

type ArchiveSourceFilter = "all" | "cloud" | "local";
