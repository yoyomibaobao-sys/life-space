"use client";
import { saveRecentArchiveBrowse } from "@/lib/recent-browse";
import { use, useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { compressImageFile, createImageThumbnailFile } from "@/lib/image-compression";
import { uploadMediaStorageObject } from "@/lib/media-storage-upload";
import { showToast } from "@/components/Toast";
import ArchiveAddRecordSection from "@/components/archive-detail/ArchiveAddRecordSection";
import ArchiveCycleTimeline from "@/components/archive-detail/ArchiveCycleTimeline";
import ArchiveDetailHeader from "@/components/archive-detail/ArchiveDetailHeader";
import ArchiveLightbox from "@/components/archive-detail/ArchiveLightbox";
import ArchivePrivateState from "@/components/archive-detail/ArchivePrivateState";
import ArchiveRecordCard from "@/components/archive-detail/ArchiveRecordCard";
import SystemNameSelector from "@/components/archive/SystemNameSelector";
import ConfirmDialog from "@/components/ConfirmDialog";
import {
  archiveCategoryOptions,
  getArchiveCategoryLabel,
  getDefaultSystemNames,
  isNonPlantArchiveCategory,
  type ArchiveCategory,
} from "@/lib/archive-categories";
import {
  getSystemNameCandidates,
  isStrongSystemNameAliasRelationType,
  type SystemNameCandidate,
} from "@/lib/system-name-candidates";
import type {
  ArchiveDetailArchive,
  ArchiveCycle,
  ArchiveMode,
  LightboxImage,
  PlantSpeciesLite,
  RecordItem,
  RecordQueryRow,
  RecordTagRow,
  RelatedTagCountRow,
} from "@/lib/archive-detail-types";
import type { PlantSpeciesOption } from "@/lib/archive-page-types";
import type { MediaItem, PlantSpeciesAliasSearchRow } from "@/lib/domain-types";
import { formatLocalCycleDate } from "@/lib/archive-cycle-dates";
import { getArchiveCycleTerminology } from "@/lib/archive-cycle-terminology";
import {
  buildMediaList,
  formatDate,
  formatDateTime,
  getDayNumber,
  getDisplayName,
} from "@/lib/archive-detail-utils";
import {
  canCreateMembershipContent,
  getCreateContentBlockedText,
  getStorageLimitExceededText,
  normalizeMembershipRpcResult,
} from "@/lib/membership";
import {
  cancelStorageUploadReservation,
  reconcileMediaUploadCommit,
  reserveStorageUpload,
  settleStorageUploadReservation,
} from "@/lib/storage-usage";
import {
  isStorageUploadMaintenance,
  STORAGE_UPLOAD_MAINTENANCE_MESSAGE,
} from "@/lib/storage-upload-maintenance";
import { attachMediaDisplayUrls } from "@/lib/media-urls";
import { requestCloudTrash } from "@/lib/cloud-trash";
import { readImageCapturedAt } from "@/lib/photo-metadata";
import {
  limitRecordPhotoBatch,
  MAX_RECORD_PHOTOS_PER_ADD,
} from "@/lib/record-photo-batches";
import {
  isMissingDatabaseColumn,
  withoutCapturedAt,
} from "@/lib/supabase-schema-compat";

export default function ArchiveDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  if (id === "new") return null;

  return <Content id={id} />;
}

type MobileArchiveEditableField =
  | "title"
  | "category"
  | "name"
  | "source"
  | "note"
  | "archiveSummary";

function Content({ id }: { id: string }) {
  const router = useRouter();
  const [archive, setArchive] = useState<ArchiveDetailArchive | null>(null);
  const [species, setSpecies] = useState<PlantSpeciesLite | null>(null);
  const [records, setRecords] = useState<RecordItem[]>([]);
  const [cycles, setCycles] = useState<ArchiveCycle[]>([]);
  const [cycleBusy, setCycleBusy] = useState(false);
  const [me, setMe] = useState<string | null | undefined>(undefined);
  const [username, setUsername] = useState("用户");
  const [sameTagCounts, setSameTagCounts] = useState<Record<string, number>>({});
  const [archiveSubcategoryLabel, setArchiveSubcategoryLabel] = useState<string | null>(null);
  const [archiveGroupLabel, setArchiveGroupLabel] = useState<string | null>(null);
  const [archiveProfileSystemNameCandidateList, setArchiveProfileSystemNameCandidates] =
    useState<SystemNameCandidate[]>([]);
  const [isProjectFollowed, setIsProjectFollowed] = useState(false);
  const [lightboxImages, setLightboxImages] = useState<LightboxImage[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [lightboxRecord, setLightboxRecord] = useState<RecordItem | null>(null);
  const [deleteMediaTarget, setDeleteMediaTarget] = useState<{
    recordId: string;
    mediaId: string;
  } | null>(null);
  const [isDeletingMedia, setIsDeletingMedia] = useState(false);
  const deletingMediaIdsRef = useRef(new Set<string>());
  const [showUnfollowProjectConfirm, setShowUnfollowProjectConfirm] = useState(false);
  const [projectFollowSubmitting, setProjectFollowSubmitting] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [mobileDetailTab, setMobileDetailTab] = useState<"profile" | "records">("records");
  const [mobileAddRecordOpen, setMobileAddRecordOpen] = useState(false);
  const [mobileArchiveEditingField, setMobileArchiveEditingField] =
    useState<MobileArchiveEditableField | null>(null);
  const [mobileArchiveTitle, setMobileArchiveTitle] = useState("");
  const [mobileArchiveCategory, setMobileArchiveCategory] = useState<ArchiveCategory>("plant");
  const [mobileArchiveName, setMobileArchiveName] = useState("");
  const [mobileArchiveSource, setMobileArchiveSource] = useState("");
  const [mobileArchiveNote, setMobileArchiveNote] = useState("");
  const [mobileArchiveSummary, setMobileArchiveSummary] = useState("");
  const [mobileArchiveSavingField, setMobileArchiveSavingField] =
    useState<MobileArchiveEditableField | null>(null);
  const [mobileArchiveError, setMobileArchiveError] = useState("");
  const [mobileSpeciesList, setMobileSpeciesList] = useState<PlantSpeciesOption[]>([]);
  const [mobileSelectedSpeciesId, setMobileSelectedSpeciesId] = useState("");
  const [mobilePlantSuggestionsOpen, setMobilePlantSuggestionsOpen] = useState(false);
  const [mobileSystemSuggestionsOpen, setMobileSystemSuggestionsOpen] = useState(false);
  const [deleteArchiveDialogOpen, setDeleteArchiveDialogOpen] = useState(false);
  const [archiveStatusConfirmOpen, setArchiveStatusConfirmOpen] = useState(false);
  const [isDeletingArchive, setIsDeletingArchive] = useState(false);

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
      setArchiveSubcategoryLabel(null);
      setArchiveGroupLabel(null);

      if (archiveData.sub_tag_id) {
        const { data: subTagData } = await supabase
          .from("sub_tags")
          .select("name")
          .eq("id", archiveData.sub_tag_id)
          .maybeSingle();
        setArchiveSubcategoryLabel(subTagData?.name || null);
      }

      if (archiveData.group_tag_id) {
        const { data: groupTagData } = await supabase
          .from("group_tags")
          .select("name")
          .eq("id", archiveData.group_tag_id)
          .maybeSingle();
        setArchiveGroupLabel(groupTagData?.name || null);
      }

      if (!archiveData.is_public && !isOwnerView) {
        setCycles([]);
        setRecords([]);
        return;
      }
saveRecentArchiveBrowse({
  id: archiveData.id,
  title: archiveData.title,
  systemName: archiveData.system_name || archiveData.species_name_snapshot || null,
  category: archiveData.category,
  userId: archiveData.user_id,
});

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
          .select(
            "id, common_name, scientific_name, family, slug, category, sub_category, growth_type, entry_type, is_active, sort_order"
          )
          .eq("id", archiveData.species_id)
          .maybeSingle();
        setSpecies((speciesData || null) as PlantSpeciesLite | null);
      } else {
        setSpecies(null);
      }

      const { data: profile } = await supabase
        .from("public_profiles")
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

      const { data: cycleRows, error: cycleError } = await supabase
        .from("archive_cycles")
        .select("id, archive_id, cycle_no, status, started_at, ended_at, created_at, updated_at")
        .eq("archive_id", archiveData.id)
        .order("cycle_no", { ascending: false });

      if (cycleError) {
        console.warn("load archive cycles failed", cycleError);
        setCycles([]);
      } else {
        setCycles((cycleRows || []) as ArchiveCycle[]);
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
        const mediaRows = await attachMediaDisplayUrls(
          supabase,
          ((mediaRaw || []) as MediaItem[])
        );

        mediaRows.forEach((media) => {
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
  }, [id, reloadKey]);

  useEffect(() => {
    async function loadMobileSpeciesList() {
      const [{ data: speciesData }, { data: aliasData }] = await Promise.all([
        supabase
          .from("plant_species")
          .select("id, common_name, scientific_name, slug, category, is_active")
          .eq("is_active", true)
          .order("common_name", { ascending: true }),
        supabase
          .from("plant_species_aliases")
          .select("species_id, alias_name, normalized_name, alias_type, relation_type, plant_species!inner(is_active)")
          .eq("plant_species.is_active", true),
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

      const list: PlantSpeciesOption[] = ((speciesData || []) as PlantSpeciesOption[]).map((item) => {
        const aliases = Array.from(new Set(aliasesBySpecies.get(item.id) || []));
        const displayName = item.common_name || item.scientific_name || "未命名植物";

        return {
          ...item,
          aliases,
          display_name: displayName,
          search_text: [
            displayName,
            item.common_name,
            item.scientific_name,
            item.slug,
            ...aliases,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase(),
        };
      });

      setMobileSpeciesList(list);
    }

    void loadMobileSpeciesList();
  }, []);

  useEffect(() => {
    async function loadArchiveSystemNameCandidates() {
      if (!archive?.category) {
        setArchiveProfileSystemNameCandidates([]);
        return;
      }

      const candidates = await getSystemNameCandidates({
        category: archive.category,
        currentValue: getDisplayName(archive, species),
        mode: "cloud",
        supabase,
        userId: archive.user_id,
        includeUserArchives: true,
        limit: 200,
      });
      setArchiveProfileSystemNameCandidates(candidates);
    }

    void loadArchiveSystemNameCandidates();
  }, [
    archive?.category,
    archive?.system_name,
    archive?.species_id,
    archive?.species_name_snapshot,
    archive?.user_id,
    species,
  ]);

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

  useEffect(() => {
    function updateViewportMode() {
      setIsMobileViewport(window.innerWidth < 760);
    }

    updateViewportMode();
    window.addEventListener("resize", updateViewportMode);

    return () => window.removeEventListener("resize", updateViewportMode);
  }, []);

  useEffect(() => {
    function openAddRecordPanel() {
      setMobileDetailTab("records");
      setMobileAddRecordOpen(true);
    }

    function handleHashChange() {
      if (window.location.hash === "#add-record") {
        openAddRecordPanel();
      }
    }

    window.addEventListener("mobile-add-record-request", openAddRecordPanel);
    window.addEventListener("hashchange", handleHashChange);
    handleHashChange();

    return () => {
      window.removeEventListener("mobile-add-record-request", openAddRecordPanel);
      window.removeEventListener("hashchange", handleHashChange);
    };
  }, []);

  useEffect(() => {
    if (!archive || mobileArchiveEditingField) return;

    setMobileArchiveTitle(archive.title || "");
    setMobileArchiveCategory(normalizeArchiveCategory(archive.category));
    setMobileArchiveName(getDisplayName(archive, species) || "");
    setMobileArchiveSource(archive.source || "");
    setMobileArchiveNote(archive.note || "");
    setMobileArchiveSummary(archive.archive_summary || "");
    setMobileSelectedSpeciesId(archive.species_id || "");
    setMobileArchiveError("");
  }, [archive, species, mobileArchiveEditingField]);

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
  const cycleTerminology = getArchiveCycleTerminology(activeArchive.category);
  const isOwner = me === activeArchive.user_id;
  const mode: ArchiveMode = isOwner ? ((modeParam as ArchiveMode | null) || "owner") : "viewer";
  const activeCycles = cycles
    .filter((cycle) => cycle.status === "active")
    .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());
  const cycleOptions = [...cycles]
    .sort((a, b) => b.cycle_no - a.cycle_no)
    .map((cycle) => ({
      id: cycle.id,
      label: `${cycleTerminology.cycleLabel(cycle.cycle_no)}（${cycle.status === "active" ? "进行中" : "已结束"} · ${formatLocalCycleDate(cycle.started_at)}）`,
    }));
  const archiveDisplayName = getDisplayName(activeArchive, species);
  const latestUpdate = records[0]?.record_time || activeArchive.last_record_time || activeArchive.created_at;
  const archiveCategoryLabel = getArchiveCategoryLabel(activeArchive.category);
  const encyclopediaHref = activeArchive.category === "plant" && species?.id ? `/plant/${species.id}` : null;
  const mobileEncyclopediaHref = encyclopediaHref
    ? `${encyclopediaHref}?fromArchive=${encodeURIComponent(activeArchive.id)}`
    : null;
  const lightboxMetaText = lightboxRecord
    ? `${formatDateTime(lightboxRecord.record_time)} · 第 ${getDayNumber(
        startTime || lightboxRecord.record_time,
        lightboxRecord.record_time,
      )} 天`
    : "";
  const mobilePlantSearchKeyword = mobileArchiveName.trim().toLowerCase();
  const mobilePlantSearchResults = (
    mobilePlantSearchKeyword
      ? mobileSpeciesList.filter((item) => item.search_text?.includes(mobilePlantSearchKeyword))
      : mobileSpeciesList
  ).slice(0, 8);
  const mobileSystemNameOptions =
    mobileArchiveCategory === "system" || mobileArchiveCategory === "insect_fish"
    ? getDefaultSystemNames(mobileArchiveCategory)
        .filter((name) =>
          mobileArchiveName.trim()
            ? name.toLowerCase().includes(mobileArchiveName.trim().toLowerCase())
            : true
        )
        .slice(0, 8)
    : [];
  const archiveSystemNameUsesCandidates =
    activeArchive.category === "plant" ||
    activeArchive.category === "system" ||
    activeArchive.category === "insect_fish";

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
    const targetRecord = records.find((record) => record.id === recordId);
    const shouldPublishForHelp =
      nextStatus === "help" &&
      (!activeArchive.is_public || targetRecord?.visibility !== "public");

    if (shouldPublishForHelp) {
      const confirmed = confirm(
        "求助需要公开这条记录和相关图片。你的其他记录不会公开。确认后，这条记录会进入公开发现和求助流。"
      );

      if (!confirmed) return;

      if (!activeArchive.is_public) {
        const { error: archiveError } = await supabase
          .from("archives")
          .update({ is_public: true })
          .eq("id", activeArchive.id)
          .eq("user_id", activeArchive.user_id);

        if (archiveError) {
          showToast("公开项目壳失败，暂不能发起求助");
          return;
        }

        setArchive((prev) => (prev ? { ...prev, is_public: true } : prev));
      }
    }

    const recordPatch: { status_tag: "help" | "resolved" | null; visibility?: "public" } = {
      status_tag: nextStatus,
    };

    if (shouldPublishForHelp) {
      recordPatch.visibility = "public";
    }

    const { error } = await supabase
      .from("records")
      .update(recordPatch)
      .eq("id", recordId)
      .eq("archive_id", activeArchive.id);

    if (error) {
      showToast("更新求助状态失败");
      return;
    }

    const nextRecords = records.map((record) =>
      record.id === recordId
        ? { ...record, status_tag: nextStatus, ...(recordPatch.visibility ? { visibility: "public" } : {}) }
        : record
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
    const nextRecordVisibility = nextValue ? "public" : "private";

    const { error } = await supabase
      .from("archives")
      .update({ is_public: nextValue })
      .eq("id", activeArchive.id);

    if (error) {
      showToast("更新可见状态失败");
      return;
    }

    if (!nextValue) {
      const { error: recordsError } = await supabase
        .from("records")
        .update({ visibility: nextRecordVisibility })
        .eq("archive_id", activeArchive.id);

      if (recordsError) {
        showToast("记录同步失败");
        return;
      }

      setRecords((prev) =>
        prev.map((record) => ({
          ...record,
          visibility: nextRecordVisibility,
        }))
      );
    }

    setArchive((prev) => (prev ? { ...prev, is_public: nextValue } : prev));

    showToast(nextValue ? "项目壳已公开，旧记录不会自动公开" : "项目和记录仅自己可见");
  }

  async function applyArchiveStatus(nextStatus: "active" | "ended") {
    if (!isOwner) return;

    const isEnding = nextStatus === "ended";
    const { error } = await supabase.rpc(
      isEnding ? "mark_archive_ended" : "restore_archive_active",
      { p_archive_id: activeArchive.id }
    );

    if (error) {
      showToast(isEnding ? "标记结束失败" : "恢复失败");
      return;
    }

    setArchive((prev) => (prev ? { ...prev, status: nextStatus } : prev));
    showToast(isEnding ? "已标记为结束" : "已恢复为进行中");
  }

  async function updateArchiveStatus(nextStatus: "active" | "ended") {
    if (nextStatus === "ended") {
      setArchiveStatusConfirmOpen(true);
      return;
    }

    await applyArchiveStatus(nextStatus);
  }

  async function confirmDeleteArchive() {
    if (!isOwner || isDeletingArchive) return;

    setIsDeletingArchive(true);
    const trashed = await requestCloudTrash("archives", activeArchive.id);
    setIsDeletingArchive(false);

    if (!trashed) {
      showToast("移入回收站失败");
      return;
    }

    setDeleteArchiveDialogOpen(false);
    showToast("已移入回收站");
    router.replace("/archive");
    router.refresh();
  }

  function beginMobileArchiveEdit(field: MobileArchiveEditableField) {
    if (!isOwner) return;

    setMobileArchiveEditingField(field);
    setMobileArchiveError("");

    if (field === "name") {
      setMobileSelectedSpeciesId(activeArchive.species_id || "");
      setMobilePlantSuggestionsOpen(activeArchive.category === "plant");
      setMobileSystemSuggestionsOpen(activeArchive.category !== "plant");
    } else {
      setMobilePlantSuggestionsOpen(false);
      setMobileSystemSuggestionsOpen(false);
    }
  }

  async function saveMobileArchivePatch(
    field: MobileArchiveEditableField,
    patch: Partial<ArchiveDetailArchive>,
    successMessage = "已保存"
  ) {
    if (!isOwner || mobileArchiveSavingField) return false;

    setMobileArchiveSavingField(field);
    setMobileArchiveError("");

    const { error } = await supabase
      .from("archives")
      .update(patch)
      .eq("id", activeArchive.id)
      .eq("user_id", activeArchive.user_id);

    setMobileArchiveSavingField(null);

    if (error) {
      setMobileArchiveError("保存失败，请稍后重试");
      showToast("保存失败");
      return false;
    }

    setArchive((prev) => (prev ? { ...prev, ...patch } : prev));
    setMobileArchiveEditingField(null);
    setMobilePlantSuggestionsOpen(false);
    setMobileSystemSuggestionsOpen(false);
    showToast(successMessage);
    return true;
  }

  async function saveMobileArchiveTitle() {
    const nextTitle = mobileArchiveTitle.trim();

    if (!nextTitle) {
      setMobileArchiveError("项目名称不能为空");
      showToast("项目名称不能为空");
      return;
    }

    if (nextTitle === (activeArchive.title || "")) {
      setMobileArchiveEditingField(null);
      return;
    }

    await saveMobileArchivePatch("title", { title: nextTitle });
  }

  async function saveMobileArchiveCategory(nextCategory = mobileArchiveCategory) {
    if (nextCategory === activeArchive.category) {
      setMobileArchiveEditingField(null);
      return;
    }

    const patch: Partial<ArchiveDetailArchive> = {
      category: nextCategory,
      sub_tag_id: null,
      group_tag_id: null,
      species_id: null,
      species_name_snapshot: null,
      system_name: null,
    };

    const saved = await saveMobileArchivePatch("category", patch, "种类已更新");
    if (!saved) return;

    setSpecies(null);
    setMobileArchiveName("");
    setMobileSelectedSpeciesId("");
  }

  async function saveMobileArchiveSystemName(name = mobileArchiveName) {
    const nextName = name.trim();

    if (!nextName) {
      setMobileArchiveError("系统名不能为空");
      showToast("系统名不能为空");
      return;
    }

    if (nextName === (activeArchive.system_name || "")) {
      setMobileArchiveEditingField(null);
      setMobileSystemSuggestionsOpen(false);
      return;
    }

    await saveMobileArchivePatch("name", { system_name: nextName }, "系统名已更新");
  }

  async function saveMobileArchiveSpecies(selectedSpecies: PlantSpeciesOption) {
    const speciesName =
      selectedSpecies.display_name ||
      selectedSpecies.common_name ||
      selectedSpecies.scientific_name ||
      "未命名植物";

    setMobileArchiveName(speciesName);
    setMobileSelectedSpeciesId(selectedSpecies.id);

    const saved = await saveMobileArchivePatch(
      "name",
      {
        species_id: selectedSpecies.id,
        species_name_snapshot: speciesName,
        system_name: null,
      },
      "系统植物名已更新"
    );

    if (!saved) return;

    setSpecies({
      id: selectedSpecies.id,
      common_name: selectedSpecies.common_name || selectedSpecies.display_name || speciesName,
      scientific_name: selectedSpecies.scientific_name || null,
    });
  }

  async function saveArchiveSystemNameSelection(selection: {
    name: string;
    candidateId?: string | null;
    isNewCandidate?: boolean;
  }) {
    const nextName = selection.name.trim();

    if (!nextName) {
      const emptyText = activeArchive.category === "plant" ? "系统植物名不能为空" : "系统名不能为空";
      showToast(emptyText);
      throw new Error(emptyText);
    }

    setMobileArchiveName(nextName);

    if (activeArchive.category === "plant") {
      const selectedSpecies = selection.candidateId
        ? mobileSpeciesList.find((item) => item.id === selection.candidateId)
        : null;

      if (selectedSpecies) {
        await saveMobileArchiveSpecies(selectedSpecies);
        return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        await supabase.from("plant_species_pending").insert([
          {
            user_id: user.id,
            submitted_name: nextName,
            language_code: "zh",
            status: "pending",
          },
        ]);
      }

      const saved = await saveMobileArchivePatch(
        "name",
        {
          species_id: null,
          species_name_snapshot: nextName,
          system_name: null,
        },
        "系统植物名已更新"
      );

      if (saved) setSpecies(null);
      return;
    }

    await saveMobileArchivePatch("name", { system_name: nextName }, "系统名已更新");
  }

  async function saveMobileArchiveSource() {
    const nextSource = mobileArchiveSource.trim();
    const currentSource = activeArchive.source || "";

    if (nextSource === currentSource) {
      setMobileArchiveEditingField(null);
      return;
    }

    await saveMobileArchivePatch("source", { source: nextSource || null });
  }

  async function saveMobileArchiveNote() {
    const nextNote = mobileArchiveNote.trim();
    const currentNote = activeArchive.note || "";

    if (nextNote === currentNote) {
      setMobileArchiveEditingField(null);
      return;
    }

    await saveMobileArchivePatch("note", { note: nextNote || null });
  }

  async function saveMobileArchiveSummary() {
    const nextSummary = mobileArchiveSummary.trim();
    const currentSummary = activeArchive.archive_summary || "";

    if (nextSummary === currentSummary) {
      setMobileArchiveEditingField(null);
      return;
    }

    await saveMobileArchivePatch(
      "archiveSummary",
      { archive_summary: nextSummary || null },
    );
  }

  function handleMobileArchiveNameBlur() {
    if (activeArchive.category !== "plant") {
      void saveMobileArchiveSystemName();
      return;
    }

    if (mobileArchiveName.trim() === archiveDisplayName.trim()) {
      setMobileArchiveEditingField(null);
      setMobilePlantSuggestionsOpen(false);
      return;
    }

    void saveArchiveSystemNameSelection({
      name: mobileArchiveName,
      isNewCandidate: true,
    });
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

    const { data: membershipData, error: membershipError } =
      await supabase.rpc("get_my_membership");
    const membership = membershipError
      ? null
      : normalizeMembershipRpcResult(membershipData);

    if (!canCreateMembershipContent(membership)) {
      showToast(getCreateContentBlockedText(membership));
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

  function openLightbox(media: MediaItem[], index: number, record: RecordItem) {
    const images = buildMediaList(media, activeArchive.title || "项目");
    if (!images.length) return;
    setLightboxRecord(record);
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

  async function deleteMediaFromRecord(
    recordId: string,
    mediaId: string,
    successMessage: string | null = "已移入回收站",
  ) {
    if (deletingMediaIdsRef.current.has(mediaId)) return false;
    deletingMediaIdsRef.current.add(mediaId);

    try {
      const trashed = await requestCloudTrash("media", mediaId);

      if (!trashed) {
        showToast("移入回收站失败");
        return false;
      }

      setRecords((prev) =>
        prev.map((record) =>
          record.id === recordId
            ? {
                ...record,
                media: (record.media || []).filter(
                  (media) => media.id !== mediaId
                ),
              }
            : record
        )
      );

      if (successMessage) showToast(successMessage);
      return true;
    } finally {
      deletingMediaIdsRef.current.delete(mediaId);
    }
  }

  async function confirmDeleteMedia() {
    if (!deleteMediaTarget || isDeletingMedia) return;

    setIsDeletingMedia(true);

    const deleted = await deleteMediaFromRecord(
      deleteMediaTarget.recordId,
      deleteMediaTarget.mediaId,
    );

    if (deleted) setDeleteMediaTarget(null);
    setIsDeletingMedia(false);
  }

  async function handleAddMediaToRecord(
    recordId: string,
    files: File[],
    options: { successMessage?: string | null; emptyMessage?: string | null } = {},
  ): Promise<MediaItem[]> {
    if (!files.length) return [];
    const { accepted: acceptedFiles, rejectedCount } =
      limitRecordPhotoBatch(files);

    if (rejectedCount > 0) {
      showToast(
        `每次最多添加 ${MAX_RECORD_PHOTOS_PER_ADD} 张，本次只处理前 ${MAX_RECORD_PHOTOS_PER_ADD} 张；可以再次添加。`,
      );
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user || user.id !== activeArchive.user_id) {
      showToast("请先登录后再添加图片");
      return [];
    }

    const { data: membershipData, error: membershipError } = await supabase.rpc("get_my_membership");

    const membership = membershipError
      ? null
      : normalizeMembershipRpcResult(membershipData);

    if (!canCreateMembershipContent(membership)) {
      showToast(getCreateContentBlockedText(membership));
      return [];
    }

    if (await isStorageUploadMaintenance()) {
      showToast(STORAGE_UPLOAD_MAINTENANCE_MESSAGE);
      return [];
    }

    const preparedFiles = await Promise.all(
      acceptedFiles.map(async (originalFile) => {
        const capturedAt = await readImageCapturedAt(originalFile);
        const compressed = await compressImageFile(originalFile);
        const file = compressed.file;
        const thumbnail = await createImageThumbnailFile(file);
        const thumbFile = thumbnail.wasGenerated ? thumbnail.file : null;

        return {
          originalFile,
          compressed,
          file,
          thumbFile,
          capturedAt,
          reservedBytes: file.size + (thumbFile?.size || 0),
        };
      })
    );

    const uploadedMedia: MediaItem[] = [];

    for (const [index, item] of preparedFiles.entries()) {
      const file = item.file;
      const thumbFile = item.thumbFile;
      const safeName = file.name.replace(/[^\w.\-]+/g, "_");
      const timestamp = Date.now();
      const targetMediaId = crypto.randomUUID();
      const fileName = `${user.id}/${recordId}/${timestamp}-${index}-${safeName}`;
      const thumbSafeName = thumbFile?.name.replace(/[^\w.\-]+/g, "_") || null;
      const thumbName = thumbFile && thumbSafeName
        ? `${user.id}/${recordId}/thumbs/${timestamp}-${index}-${thumbSafeName}`
        : null;

      const reserveResult = await reserveStorageUpload({
        targetType: "media",
        targetId: targetMediaId,
        targetParentId: recordId,
        storagePath: fileName,
        storageBytes: file.size,
        thumbPath: thumbName,
        thumbBytes: thumbFile?.size || 0,
      });

      if (!reserveResult.ok) {
        if (reserveResult.message === "storage_limit_exceeded") {
          showToast(
            getStorageLimitExceededText({
              usedBytes: reserveResult.storage_used,
              limitBytes: reserveResult.storage_limit_bytes,
              uploadBytes: item.reservedBytes,
            })
          );
        } else if (reserveResult.message === "membership_inactive") {
          showToast(getCreateContentBlockedText(membership));
        } else if (reserveResult.message === "upload_maintenance") {
          showToast(STORAGE_UPLOAD_MAINTENANCE_MESSAGE);
        } else {
          showToast("容量检查失败");
        }
        break;
      }

      const reservation = {
        reservation_id: reserveResult.reservation_id,
        reservation_mode: reserveResult.reservation_mode,
        reserved_bytes: item.reservedBytes,
      } as const;

      const { error: uploadError } = await uploadMediaStorageObject(
        fileName,
        file,
        {
          contentType: file.type || "image/jpeg",
        }
      );

      if (uploadError) {
        console.error("add record media upload error:", uploadError);
        await supabase.storage
          .from("media")
          .remove([fileName, thumbName].filter((path): path is string => Boolean(path)));
        await cancelStorageUploadReservation(reservation);
        showToast(
          (await isStorageUploadMaintenance())
            ? STORAGE_UPLOAD_MAINTENANCE_MESSAGE
            : "部分图片上传失败"
        );
        continue;
      }

      let uploadedThumbPath: string | null = null;
      let uploadedThumbBytes = 0;

      if (thumbFile && thumbName) {
        const { error: thumbUploadError } = await uploadMediaStorageObject(
          thumbName,
          thumbFile,
          {
            contentType: thumbFile.type || "image/jpeg",
          }
        );

        if (thumbUploadError) {
          console.error("add record thumbnail upload error:", thumbUploadError);
          await supabase.storage.from("media").remove([thumbName]);
        } else {
          uploadedThumbPath = thumbName;
          uploadedThumbBytes = thumbFile.size;
        }
      }

      const actualBytes = file.size + uploadedThumbBytes;

      const mediaPayload = {
        id: targetMediaId,
        record_id: recordId,
        type: "image",
        url: null,
        user_id: user.id,
        size_mb: actualBytes / (1024 * 1024),
        size_bytes: actualBytes,
        storage_path: fileName,
        thumb_url: null,
        thumb_path: uploadedThumbPath,
        mime_type: file.type || "image/jpeg",
        width: item.compressed.width ?? null,
        height: item.compressed.height ?? null,
        original_filename: item.originalFile.name,
        captured_at: item.capturedAt,
        storage_class: "hot",
        ...(reservation.reservation_id
          ? { upload_reservation_id: reservation.reservation_id }
          : {}),
      };
      let mediaInsertResult = await supabase
        .from("media")
        .insert([mediaPayload])
        .select()
        .single();

      if (
        isMissingDatabaseColumn(
          mediaInsertResult.error,
          "media",
          "captured_at"
        )
      ) {
        mediaInsertResult = await supabase
          .from("media")
          .insert([withoutCapturedAt(mediaPayload)])
          .select()
          .single();
      }

      const { data: mediaRow, error: mediaError } = mediaInsertResult;
      let committedMedia = mediaRow as MediaItem | null;

      if (mediaError || !committedMedia?.id) {
        console.error("add record media insert error:", mediaError);
        const reconciliation = await reconcileMediaUploadCommit({ storagePath: fileName });

        if (reconciliation.status === "found") {
          const { data: reconciledMedia, error: reconcileReadError } = await supabase
            .from("media")
            .select("*")
            .eq("id", reconciliation.mediaId)
            .single();

          if (reconcileReadError || !reconciledMedia) {
            console.error("add record reconciled media read error:", reconcileReadError);
            showToast("图片保存状态待确认，请刷新后查看。为避免误删，已保留上传内容。");
            continue;
          }
          committedMedia = reconciledMedia as MediaItem;
        } else if (reconciliation.status === "missing") {
          await supabase.storage
            .from("media")
            .remove([fileName, uploadedThumbPath].filter((path): path is string => Boolean(path)));
          await cancelStorageUploadReservation(reservation);
          showToast("部分图片保存失败");
          continue;
        } else {
          showToast("图片保存状态待确认，请刷新后查看。为避免误删，已保留上传内容。");
          continue;
        }
      }

      await settleStorageUploadReservation({
        reservation,
        targetType: "media",
        targetId: committedMedia.id,
        legacyActualBytes: actualBytes,
      });

      const [displayMediaRow] = await attachMediaDisplayUrls(
        supabase,
        [committedMedia]
      );
      uploadedMedia.push(displayMediaRow);
    }

    if (uploadedMedia.length > 0) {
      setRecords((prev) =>
        prev.map((record) =>
          record.id === recordId
            ? { ...record, media: [...(record.media || []), ...uploadedMedia] }
            : record
        )
      );
      if (options.successMessage !== null) {
        showToast(options.successMessage ?? "图片已添加");
      }
    } else {
      if (options.emptyMessage !== null) {
        showToast(options.emptyMessage ?? "没有图片成功上传");
      }
    }

    return uploadedMedia;
  }

  async function handleReplaceMedia(
    recordId: string,
    mediaId: string,
    files: File[],
  ) {
    const uploadedMedia = await handleAddMediaToRecord(recordId, files.slice(0, 1), {
      successMessage: null,
      emptyMessage: "替换图片失败",
    });

    if (!uploadedMedia.length) return;

    const trashed = await deleteMediaFromRecord(recordId, mediaId, null);
    showToast(trashed ? "图片已替换" : "新图片已添加，旧图片移入回收站失败");
  }

  async function handleDeleteLightboxImage(image: LightboxImage, currentIndex: number) {
    if (!image.id || !lightboxRecord?.id) {
      showToast("无法定位当前图片");
      return lightboxImages.length;
    }

    const trashed = await deleteMediaFromRecord(lightboxRecord.id, image.id, null);
    if (!trashed) return lightboxImages.length;

    showToast("已移入回收站");

    const nextImages = lightboxImages.filter((item) => item.id !== image.id);
    setLightboxImages(nextImages);

    if (nextImages.length === 0) {
      setLightboxRecord(null);
      setLightboxIndex(0);
      return 0;
    }

    setLightboxIndex(Math.min(currentIndex, nextImages.length - 1));
    return nextImages.length;
  }

  function handleRecordNoteSaved(recordId: string, nextText: string) {
    setRecords((prev) =>
      prev.map((record) =>
        record.id === recordId ? { ...record, note: nextText } : record
      )
    );
  }

  function handleRecordUpdated(recordId: string, patch: Partial<RecordItem>) {
    setRecords((prev) =>
      prev.map((record) =>
        record.id === recordId ? { ...record, ...patch } : record
      )
    );

    setLightboxRecord((prev) =>
      prev?.id === recordId ? { ...prev, ...patch } : prev
    );
  }

  async function startArchiveCycle(startedAt: string) {
    if (!isOwner || cycleBusy) return;
    setCycleBusy(true);
    try {
      const nextCycleNo = cycles.reduce((max, cycle) => Math.max(max, cycle.cycle_no), 0) + 1;
      const { error } = await supabase.from("archive_cycles").insert([
        {
          archive_id: activeArchive.id,
          cycle_no: nextCycleNo,
          status: "active",
          started_at: startedAt,
          ended_at: null,
        },
      ]);

      if (error) {
        console.error("create archive cycle failed", error);
        setReloadKey((value) => value + 1);
        showToast(
          error.code === "23505"
            ? "周期状态刚刚发生变化，已重新读取，请再试一次。"
            : cycleTerminology.startFailure
        );
        return;
      }

      showToast(cycleTerminology.startSuccess(nextCycleNo));
      setReloadKey((value) => value + 1);
    } finally {
      setCycleBusy(false);
    }
  }

  async function endArchiveCycle(cycle: ArchiveCycle, endedAt: string) {
    if (!isOwner || cycleBusy || cycle.status !== "active") return;
    if (new Date(endedAt).getTime() < new Date(cycle.started_at).getTime()) {
      showToast("结束日期不能早于开始日期。");
      return;
    }

    setCycleBusy(true);
    try {
      const { error } = await supabase
        .from("archive_cycles")
        .update({ status: "ended", ended_at: endedAt })
        .eq("id", cycle.id)
        .eq("archive_id", activeArchive.id)
        .eq("status", "active");

      if (error) {
        console.error("end archive cycle failed", error);
        showToast(cycleTerminology.endFailure);
        return;
      }

      showToast(cycleTerminology.endSuccess(cycle.cycle_no));
      setReloadKey((value) => value + 1);
    } finally {
      setCycleBusy(false);
    }
  }

  async function updateArchiveCycleDates(
    cycle: ArchiveCycle,
    dates: { startedAt: string; endedAt: string | null }
  ) {
    if (!isOwner || cycleBusy) return;
    if (
      cycle.status === "ended" &&
      (!dates.endedAt || new Date(dates.endedAt).getTime() < new Date(dates.startedAt).getTime())
    ) {
      showToast("结束日期不能早于开始日期。");
      return;
    }

    setCycleBusy(true);
    try {
      const { error } = await supabase
        .from("archive_cycles")
        .update({
          started_at: dates.startedAt,
          ended_at: cycle.status === "ended" ? dates.endedAt : null,
        })
        .eq("id", cycle.id)
        .eq("archive_id", activeArchive.id)
        .eq("status", cycle.status);

      if (error) {
        console.error("update archive cycle dates failed", error);
        showToast("调整日期失败，请稍后重试。");
        return;
      }

      showToast(cycleTerminology.datesUpdated(cycle.cycle_no));
      setReloadKey((value) => value + 1);
    } finally {
      setCycleBusy(false);
    }
  }

  async function deleteArchiveCycle(cycle: ArchiveCycle) {
    if (!isOwner || cycleBusy) return false;

    setCycleBusy(true);
    try {
      const { data, error } = await supabase.rpc("delete_archive_cycle", {
        p_cycle_id: cycle.id,
      });

      if (error) {
        console.error("delete archive cycle failed", {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
        });
        showToast("删除失败，请稍后重试。");
        return false;
      }

      const movedRecordCount = Number(data || 0);
      showToast(cycleTerminology.deleteSuccess(cycle.cycle_no, movedRecordCount));
      setReloadKey((value) => value + 1);
      return true;
    } finally {
      setCycleBusy(false);
    }
  }

  async function handleRecordVisibilityChange(recordId: string, nextVisibility: string) {
    await supabase.from("records").update({ visibility: nextVisibility }).eq("id", recordId);

    setRecords((prev) =>
      prev.map((record) =>
        record.id === recordId ? { ...record, visibility: nextVisibility } : record
      )
    );
  }

  async function handleRecordCycleChange(recordId: string, cycleId: string | null) {
    if (!isOwner) return;
    const { error } = await supabase
      .from("records")
      .update({ cycle_id: cycleId })
      .eq("id", recordId)
      .eq("archive_id", activeArchive.id);

    if (error) {
      console.error("update record cycle failed", error);
      showToast(`${cycleTerminology.adjustLabel}失败，请稍后重试。`);
      return;
    }

    setRecords((current) =>
      current.map((record) =>
        record.id === recordId ? { ...record, cycle_id: cycleId } : record
      )
    );
    showToast(
      cycleId
        ? cycleTerminology.recordAssignedSuccess
        : cycleTerminology.recordUnassignedSuccess
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
        {!isMobileViewport ? (
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
              {mode === "owner" ? "← 我的项目" : "← 返回发现"}
            </Link>
          </div>
        ) : null}

        <nav
          className="mobile-app-grid-only"
          style={archiveDetailTabWrapStyle}
          aria-label="项目详情导航"
        >
          <button
            type="button"
            onClick={() => setMobileDetailTab("profile")}
            style={archiveDetailTabButtonStyle(mobileDetailTab === "profile")}
          >
            档案
          </button>
          <button
            type="button"
            onClick={() => setMobileDetailTab("records")}
            style={archiveDetailTabButtonStyle(mobileDetailTab === "records")}
          >
            记录
          </button>
        </nav>

        {!isMobileViewport ? (
          <div id="archive-profile" style={archiveDetailAnchorStyle}>
            <ArchiveDetailHeader
              mode={mode}
              archive={activeArchive}
              username={username}
              archiveDisplayName={archiveDisplayName}
              archiveCategoryLabel={archiveCategoryLabel}
              archiveSubcategoryLabel={archiveSubcategoryLabel}
              archiveGroupLabel={archiveGroupLabel}
              latestUpdate={latestUpdate}
              recordCount={activeArchive.record_count || records.length || 0}
              encyclopediaHref={encyclopediaHref}
              isProjectFollowed={isProjectFollowed}
              systemNameCandidates={archiveProfileSystemNameCandidateList}
              systemNameMode={archiveSystemNameUsesCandidates ? "candidate" : "text"}
              onToggleArchiveVisibility={toggleArchiveVisibility}
              onToggleProjectFollow={toggleProjectFollow}
              onToggleArchiveStatus={() =>
                void updateArchiveStatus(activeArchive.status === "ended" ? "active" : "ended")
              }
              onDeleteArchive={() => setDeleteArchiveDialogOpen(true)}
              onSaveTitle={async (nextTitle) => {
                setMobileArchiveTitle(nextTitle);
                await saveMobileArchivePatch("title", { title: nextTitle });
              }}
              onSaveCategory={async (nextCategory) => {
                setMobileArchiveCategory(nextCategory);
                await saveMobileArchiveCategory(nextCategory);
              }}
              onSaveSystemName={saveArchiveSystemNameSelection}
              onSaveSource={async (nextSource) => {
                setMobileArchiveSource(nextSource);
                await saveMobileArchivePatch("source", { source: nextSource || null });
              }}
              onSaveNote={async (nextNote) => {
                setMobileArchiveNote(nextNote);
                await saveMobileArchivePatch("note", { note: nextNote || null });
              }}
              onSaveArchiveSummary={async (nextSummary) => {
                setMobileArchiveSummary(nextSummary);
                await saveMobileArchivePatch(
                  "archiveSummary",
                  { archive_summary: nextSummary || null },
                );
              }}
            />
          </div>
        ) : null}

        {isMobileViewport && mobileDetailTab === "profile" ? (
          <MobileArchiveProfile
            archive={activeArchive}
            archiveDisplayName={archiveDisplayName}
            archiveCategoryLabel={archiveCategoryLabel}
            encyclopediaHref={encyclopediaHref}
            title={mobileArchiveTitle}
            category={mobileArchiveCategory}
            archiveName={mobileArchiveName}
            source={mobileArchiveSource}
            note={mobileArchiveNote}
            archiveSummary={mobileArchiveSummary}
            editingField={mobileArchiveEditingField}
            savingField={mobileArchiveSavingField}
            error={mobileArchiveError}
            isOwner={isOwner}
            plantSearchResults={mobilePlantSearchResults}
            selectedSpeciesId={mobileSelectedSpeciesId}
            plantSuggestionsOpen={mobilePlantSuggestionsOpen}
            systemNameOptions={mobileSystemNameOptions}
            systemSuggestionsOpen={mobileSystemSuggestionsOpen}
            onTitleChange={setMobileArchiveTitle}
            onCategoryChange={setMobileArchiveCategory}
            onArchiveNameChange={setMobileArchiveName}
            onSourceChange={setMobileArchiveSource}
            onNoteChange={setMobileArchiveNote}
            onArchiveSummaryChange={setMobileArchiveSummary}
            onBeginEdit={beginMobileArchiveEdit}
            onSaveTitle={saveMobileArchiveTitle}
            onSaveCategory={saveMobileArchiveCategory}
            onSaveNameBlur={handleMobileArchiveNameBlur}
            onSelectSpecies={saveMobileArchiveSpecies}
            onSaveSystemName={(value) => {
              if (activeArchive.category === "other") {
                void saveMobileArchiveSystemName(value);
                return;
              }

              void saveArchiveSystemNameSelection({
                name: value || mobileArchiveName,
                isNewCandidate: true,
              });
            }}
            onSaveSource={saveMobileArchiveSource}
            onSaveNote={saveMobileArchiveNote}
            onSaveArchiveSummary={saveMobileArchiveSummary}
            onPlantSuggestionsOpenChange={setMobilePlantSuggestionsOpen}
            onSystemSuggestionsOpenChange={setMobileSystemSuggestionsOpen}
            onToggleArchiveStatus={() =>
              void updateArchiveStatus(activeArchive.status === "ended" ? "active" : "ended")
            }
            onToggleArchiveVisibility={() => void toggleArchiveVisibility()}
            onDeleteArchive={() => setDeleteArchiveDialogOpen(true)}
          />
        ) : null}

        {mode === "owner" ? (
          <ArchiveAddRecordSection
            archiveId={activeArchive.id}
            archiveCategory={activeArchive.category}
            archiveIsPublic={activeArchive.is_public}
            activeCycles={activeCycles}
            archiveDefaultRecordVisibility={
              activeArchive.default_record_visibility === "public" ? "public" : "private"
            }
            mobileMode={isMobileViewport}
            open={!isMobileViewport || mobileAddRecordOpen}
            onClose={() => setMobileAddRecordOpen(false)}
            onRecordCreated={() => {
              setReloadKey((value) => value + 1);
              if (isMobileViewport) setMobileAddRecordOpen(false);
            }}
          />
        ) : null}

        {!isMobileViewport || mobileDetailTab === "records" ? (
        <ArchiveCycleTimeline
          cycles={cycles}
          records={records}
          category={activeArchive.category}
          mobileMode={isMobileViewport}
          canManage={mode === "owner"}
          busy={cycleBusy}
          onStartCycle={startArchiveCycle}
          onEndCycle={endArchiveCycle}
          onUpdateCycleDates={updateArchiveCycleDates}
          onDeleteCycle={deleteArchiveCycle}
          emptyState={
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
              {mode === "owner" ? "还没有记录，添加第一条记录" : "还没有公开记录"}
            </div>
          }
          renderRecord={(item, index) => {
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
                onReplaceMedia={handleReplaceMedia}
                onVisibilityChange={handleRecordVisibilityChange}
                onSetHelpStatus={setRecordHelpStatus}
                onRemoveTag={(recordId, tag) => updateRecordTagState(recordId, tag, "remove")}
                onAddTag={handleAddTag}
                onNoteSaved={handleRecordNoteSaved}
                onRecordUpdated={handleRecordUpdated}
                currentUserId={me ?? null}
                onCommentCountChange={handleCommentCountChange}
                onAddMedia={handleAddMediaToRecord}
                isMobileViewport={isMobileViewport}
                onRecordDeleted={(recordId) => {
                  setRecords((prev) => prev.filter((record) => record.id !== recordId));
                  setReloadKey((value) => value + 1);
                }}
                cycleOptions={cycleOptions}
                onCycleChange={handleRecordCycleChange}
              />
            );
          }}
        />
        ) : null}
      </main>

      {isLightboxOpen ? (
        <ArchiveLightbox
          images={lightboxImages}
          index={lightboxIndex}
          onChange={setLightboxIndex}
          isMobileViewport={isMobileViewport}
          metaText={lightboxMetaText}
          note={lightboxRecord?.note || ""}
          onDeleteCurrentImage={handleDeleteLightboxImage}
          deleteActionLabel="移入回收站"
          deleteConfirmMessage="照片将移入回收站，可以从回收站恢复。"
          onClose={() => {
            setLightboxImages([]);
            setLightboxIndex(0);
            setLightboxRecord(null);
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
        open={deleteArchiveDialogOpen}
        title="移入回收站"
        message="项目、记录和照片将移入回收站。与该项目相关的评论、点赞、关注等互动信息将立即删除，无法恢复。"
        confirmText={isDeletingArchive ? "移入中..." : "移入回收站"}
        cancelText="取消"
        confirmDisabled={isDeletingArchive}
        cancelDisabled={isDeletingArchive}
        onClose={() => {
          if (!isDeletingArchive) setDeleteArchiveDialogOpen(false);
        }}
        onConfirm={confirmDeleteArchive}
        danger
      />

      <ConfirmDialog
        open={archiveStatusConfirmOpen}
        title="结束项目"
        message="确认将这个项目标记为已结束吗？之后仍可查看，也可以恢复。"
        confirmText="确认结束"
        cancelText="取消"
        onClose={() => setArchiveStatusConfirmOpen(false)}
        onConfirm={() => {
          setArchiveStatusConfirmOpen(false);
          void applyArchiveStatus("ended");
        }}
      />

      <ConfirmDialog
        open={Boolean(deleteMediaTarget)}
        title="移入回收站"
        message="照片将移入回收站，可以从回收站恢复。"
        confirmText={isDeletingMedia ? "移入中..." : "移入回收站"}
        cancelText="取消"
        onClose={() => {
          if (!isDeletingMedia) setDeleteMediaTarget(null);
        }}
        onConfirm={confirmDeleteMedia}
        confirmDisabled={isDeletingMedia}
        cancelDisabled={isDeletingMedia}
        danger
      />
    </>
  );
}

function MobileArchiveRecordTop({
  title,
  systemName,
  href,
}: {
  title: string;
  systemName: string;
  href: string | null;
}) {
  return (
    <div style={mobileRecordTopStyle}>
      <span style={mobileRecordTopTitleStyle}>{title}</span>
      {systemName ? (
        <>
          <span style={mobileRecordTopDotStyle}>·</span>
          {href ? (
            <Link href={href} style={mobileRecordTopLinkStyle}>
              {systemName}
            </Link>
          ) : (
            <span style={mobileRecordTopSystemStyle}>{systemName}</span>
          )}
        </>
      ) : null}
    </div>
  );
}

function MobileArchiveProfile({
  archive,
  archiveDisplayName,
  archiveCategoryLabel,
  encyclopediaHref,
  title,
  category,
  archiveName,
  source,
  note,
  archiveSummary,
  editingField,
  savingField,
  error,
  isOwner,
  plantSearchResults,
  selectedSpeciesId,
  plantSuggestionsOpen,
  systemNameOptions,
  systemSuggestionsOpen,
  onTitleChange,
  onCategoryChange,
  onArchiveNameChange,
  onSourceChange,
  onNoteChange,
  onArchiveSummaryChange,
  onBeginEdit,
  onSaveTitle,
  onSaveCategory,
  onSaveNameBlur,
  onSelectSpecies,
  onSaveSystemName,
  onSaveSource,
  onSaveNote,
  onSaveArchiveSummary,
  onPlantSuggestionsOpenChange,
  onSystemSuggestionsOpenChange,
  onToggleArchiveStatus,
  onToggleArchiveVisibility,
  onDeleteArchive,
}: {
  archive: ArchiveDetailArchive;
  archiveDisplayName: string;
  archiveCategoryLabel: string;
  encyclopediaHref: string | null;
  title: string;
  category: ArchiveCategory;
  archiveName: string;
  source: string;
  note: string;
  archiveSummary: string;
  editingField: MobileArchiveEditableField | null;
  savingField: MobileArchiveEditableField | null;
  error: string;
  isOwner: boolean;
  plantSearchResults: PlantSpeciesOption[];
  selectedSpeciesId: string;
  plantSuggestionsOpen: boolean;
  systemNameOptions: string[];
  systemSuggestionsOpen: boolean;
  onTitleChange: (value: string) => void;
  onCategoryChange: (value: ArchiveCategory) => void;
  onArchiveNameChange: (value: string) => void;
  onSourceChange: (value: string) => void;
  onNoteChange: (value: string) => void;
  onArchiveSummaryChange: (value: string) => void;
  onBeginEdit: (field: MobileArchiveEditableField) => void;
  onSaveTitle: () => void;
  onSaveCategory: (value?: ArchiveCategory) => void;
  onSaveNameBlur: () => void;
  onSelectSpecies: (species: PlantSpeciesOption) => void;
  onSaveSystemName: (value?: string) => void;
  onSaveSource: () => void;
  onSaveNote: () => void;
  onSaveArchiveSummary: () => void;
  onPlantSuggestionsOpenChange: (open: boolean) => void;
  onSystemSuggestionsOpenChange: (open: boolean) => void;
  onToggleArchiveStatus: () => void;
  onToggleArchiveVisibility: () => void;
  onDeleteArchive: () => void;
}) {
  const createdAtText = formatDate(archive.created_at) || "未填写";
  const nameLabel = category === "plant" ? "系统植物名 *" : "系统名 *";
  const canEdit = isOwner && !savingField;

  return (
    <section id="archive-profile" style={mobileArchiveProfileStyle}>
      <div style={mobileArchiveProfileHeaderStyle}>
        <div style={{ fontSize: 16, fontWeight: 800, color: "#1f2d1f" }}>档案</div>
        {savingField ? <div style={mobileArchiveSavingTextStyle}>保存中...</div> : null}
      </div>

      <MobileArchiveEditableField
        label="项目名称 *"
        value={archive.title || "未命名项目"}
        editing={editingField === "title"}
        canEdit={canEdit}
        onBeginEdit={() => onBeginEdit("title")}
      >
        <input
          value={title}
          onChange={(event) => onTitleChange(event.target.value)}
          onBlur={onSaveTitle}
          autoFocus
          placeholder="未命名项目"
          style={mobileArchiveInputStyle}
        />
      </MobileArchiveEditableField>

      <MobileArchiveEditableField
        label="种类"
        value={archiveCategoryLabel || "其他"}
        editing={editingField === "category"}
        canEdit={canEdit}
        onBeginEdit={() => onBeginEdit("category")}
      >
        <select
          value={category}
          onChange={(event) => {
            const nextCategory = normalizeArchiveCategory(event.target.value);
            onCategoryChange(nextCategory);
            onSaveCategory(nextCategory);
          }}
          autoFocus
          style={mobileArchiveInputStyle}
        >
          {archiveCategoryOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </MobileArchiveEditableField>

      <MobileArchiveEditableField
        label={nameLabel}
        value={archiveDisplayName || "未填写"}
        editing={editingField === "name"}
        canEdit={canEdit}
        onBeginEdit={() => onBeginEdit("name")}
        valueHref={archive.category === "plant" && !canEdit ? encyclopediaHref : null}
      >
        {category === "plant" ? (
          <SystemNameSelector
            value={archiveName}
            onChange={(value) => {
              onArchiveNameChange(value);
              onPlantSuggestionsOpenChange(true);
            }}
            candidates={plantSearchResults.map((item) => ({
              id: item.id,
              label: item.display_name || item.common_name || item.scientific_name || "未命名植物",
              description: item.scientific_name || "",
            }))}
            selectedValue={selectedSpeciesId}
            suggestionsOpen={plantSuggestionsOpen}
            onSuggestionsOpenChange={onPlantSuggestionsOpenChange}
            onSelect={(candidate) => {
              const selected = plantSearchResults.find((item) => item.id === candidate.id);
              if (selected) onSelectSpecies(selected);
            }}
            onUseCustom={(value) => onSaveSystemName(value)}
            onBlur={onSaveNameBlur}
            autoFocus
            placeholder="输入后从系统植物中点选"
            containerStyle={mobileArchiveSuggestionWrapStyle}
            inputStyle={mobileArchiveInputStyle}
            panelStyle={mobileArchiveSuggestionListStyle}
            optionStyle={(candidate) =>
              mobileArchiveSuggestionButtonStyle(selectedSpeciesId === candidate.id)
            }
            customOptionStyle={mobileArchiveSuggestionNewButtonStyle}
            emptyStyle={mobileArchiveSuggestionEmptyStyle}
            emptyText="没有找到匹配植物"
            customActionLabel={(inputValue) => `使用“${inputValue}”作为新的系统名`}
          />
        ) : (
          <SystemNameSelector
            value={archiveName}
            onChange={(value) => {
              onArchiveNameChange(value);
              onSystemSuggestionsOpenChange(true);
            }}
            candidates={systemNameOptions.map((label) => ({ label }))}
            selectedValue={archiveName}
            suggestionsOpen={systemSuggestionsOpen}
            onSuggestionsOpenChange={onSystemSuggestionsOpenChange}
            onSelect={(candidate) => {
              onArchiveNameChange(candidate.label);
              onSaveSystemName(candidate.label);
            }}
            onUseCustom={(value) => onSaveSystemName(value)}
            onBlur={() => onSaveSystemName()}
            autoFocus
            placeholder="输入具体名称"
            containerStyle={mobileArchiveSuggestionWrapStyle}
            inputStyle={mobileArchiveInputStyle}
            panelStyle={mobileArchiveSuggestionListStyle}
            optionStyle={(candidate) =>
              mobileArchiveSuggestionButtonStyle(candidate.label === archiveName)
            }
            customOptionStyle={mobileArchiveSuggestionNewButtonStyle}
            emptyStyle={mobileArchiveSuggestionEmptyStyle}
            customActionLabel={(inputValue) => `+ 新增为具体名称：${inputValue}`}
          />
        )}
      </MobileArchiveEditableField>

      <MobileArchiveEditableField
        label="来源"
        value={source || "未填写"}
        editing={editingField === "source"}
        canEdit={canEdit}
        onBeginEdit={() => onBeginEdit("source")}
      >
        <input
          value={source}
          onChange={(event) => onSourceChange(event.target.value)}
          onBlur={onSaveSource}
          autoFocus
          placeholder="未填写"
          style={mobileArchiveInputStyle}
        />
      </MobileArchiveEditableField>

      <MobileArchiveEditableField
        label="备注"
        value={note || "未填写"}
        editing={editingField === "note"}
        canEdit={canEdit}
        onBeginEdit={() => onBeginEdit("note")}
        multiline
      >
        <textarea
          value={note}
          onChange={(event) => onNoteChange(event.target.value)}
          onBlur={onSaveNote}
          autoFocus
          placeholder="未填写"
          rows={4}
          style={mobileArchiveTextareaStyle}
        />
      </MobileArchiveEditableField>

      <MobileArchiveEditableField
        label="项目摘要"
        value={archiveSummary || "未填写"}
        editing={editingField === "archiveSummary"}
        canEdit={canEdit}
        onBeginEdit={() => onBeginEdit("archiveSummary")}
        multiline
      >
        <textarea
          value={archiveSummary}
          onChange={(event) => onArchiveSummaryChange(event.target.value)}
          onBlur={onSaveArchiveSummary}
          autoFocus
          rows={1}
          style={mobileArchiveTextareaStyle}
        />
      </MobileArchiveEditableField>

      <MobileArchiveField label="创建时间" value={createdAtText} />

      {error ? <div style={mobileArchiveErrorStyle}>{error}</div> : null}

      {isOwner ? (
        <div style={mobileArchiveActionPanelStyle}>
          <button
            type="button"
            onClick={onToggleArchiveStatus}
            style={mobileArchiveActionButtonStyle}
          >
            {archive.status === "ended" ? "恢复" : "结束"}
          </button>
          <button
            type="button"
            onClick={onToggleArchiveVisibility}
            style={mobileArchiveActionButtonStyle}
          >
            {archive.is_public ? "设为私密" : "设为公开发现"}
          </button>
          <button
            type="button"
            onClick={onDeleteArchive}
            style={mobileArchiveDangerButtonStyle}
          >
            移入回收站
          </button>
        </div>
      ) : null}
    </section>
  );
}

function MobileArchiveEditableField({
  label,
  value,
  valueHref,
  editing,
  canEdit,
  multiline = false,
  children,
  onBeginEdit,
}: {
  label: string;
  value: string;
  valueHref?: string | null;
  editing: boolean;
  canEdit: boolean;
  multiline?: boolean;
  children: ReactNode;
  onBeginEdit: () => void;
}) {
  if (editing) {
    return (
      <label style={mobileArchiveEditFieldStyle}>
        <span style={mobileArchiveLabelStyle}>{label}</span>
        {children}
      </label>
    );
  }

  const valueNode = valueHref ? (
    <Link href={valueHref} style={mobileArchiveValueLinkStyle}>
      {value}
    </Link>
  ) : (
    value
  );

  const content = (
    <>
      <span style={mobileArchiveLabelStyle}>{label}</span>
      <span style={multiline ? mobileArchiveMultilineValueStyle : mobileArchiveValueStyle}>
        {valueNode}
      </span>
    </>
  );

  if (!canEdit) {
    return <div style={mobileArchiveFieldStyle}>{content}</div>;
  }

  return (
    <button type="button" onClick={onBeginEdit} style={mobileArchiveFieldButtonStyle}>
      {content}
    </button>
  );
}

function MobileArchiveField({
  label,
  value,
  multiline = false,
}: {
  label: string;
  value: string;
  multiline?: boolean;
}) {
  return (
    <div style={mobileArchiveFieldStyle}>
      <div style={mobileArchiveLabelStyle}>{label}</div>
      <div style={multiline ? mobileArchiveMultilineValueStyle : mobileArchiveValueStyle}>
        {value}
      </div>
    </div>
  );
}

function normalizeArchiveCategory(value?: string | null): ArchiveCategory {
  if (value === "plant" || value === "system" || value === "insect_fish" || value === "other") {
    return value;
  }

  return "other";
}

const mobileRecordTopStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 5,
  minWidth: 0,
  margin: "0 0 10px",
  color: "#253325",
  fontSize: 14,
  lineHeight: 1.35,
};

const mobileRecordTopTitleStyle: CSSProperties = {
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  fontWeight: 800,
};

const mobileRecordTopDotStyle: CSSProperties = {
  color: "#9aa596",
  flexShrink: 0,
};

const mobileRecordTopSystemStyle: CSSProperties = {
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  color: "#5f6f5b",
};

const mobileRecordTopLinkStyle: CSSProperties = {
  ...mobileRecordTopSystemStyle,
  color: "#2f6a31",
  textDecoration: "none",
  fontWeight: 700,
};

const archiveDetailTabWrapStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 6,
  marginBottom: 12,
  padding: 4,
  border: "1px solid #e2ecd9",
  borderRadius: 16,
  background: "#fff",
};

function archiveDetailTabButtonStyle(active: boolean): CSSProperties {
  return {
    minHeight: 38,
    border: "none",
    borderRadius: 12,
    color: active ? "#2f6a31" : "#40583a",
    background: active ? "#e3f1dd" : "transparent",
    fontSize: 14,
    fontWeight: 800,
    cursor: "pointer",
  };
}

const archiveDetailAnchorStyle: CSSProperties = {
  scrollMarginTop: 76,
};

const mobileArchiveProfileStyle: CSSProperties = {
  border: "1px solid #e6ece1",
  borderRadius: 16,
  background: "#fff",
  padding: 14,
  marginBottom: 14,
};

const mobileArchiveRecordListStyle: CSSProperties = {
  position: "relative",
  paddingLeft: 0,
  scrollMarginTop: 64,
};

const mobileArchiveProfileHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  marginBottom: 10,
};

const mobileArchiveSavingTextStyle: CSSProperties = {
  color: "#6d7b68",
  fontSize: 12,
};

const mobileArchiveFieldStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "72px minmax(0, 1fr)",
  gap: 10,
  padding: "9px 0",
  borderTop: "1px solid #f1f3ef",
  alignItems: "start",
};

const mobileArchiveFieldButtonStyle: CSSProperties = {
  ...mobileArchiveFieldStyle,
  width: "100%",
  borderRight: "none",
  borderBottom: "none",
  borderLeft: "none",
  background: "transparent",
  textAlign: "left",
  cursor: "pointer",
  paddingRight: 0,
  paddingLeft: 0,
};

const mobileArchiveEditFieldStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "72px minmax(0, 1fr)",
  gap: 10,
  padding: "9px 0",
  borderTop: "1px solid #f1f3ef",
  alignItems: "start",
};

const mobileArchiveLabelStyle: CSSProperties = {
  color: "#7a8577",
  fontSize: 13,
  lineHeight: 1.45,
};

const mobileArchiveValueStyle: CSSProperties = {
  minWidth: 0,
  color: "#273327",
  fontSize: 14,
  lineHeight: 1.45,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const mobileArchiveValueLinkStyle: CSSProperties = {
  color: "#2f6a31",
  textDecoration: "none",
  fontWeight: 700,
};

const mobileArchiveMultilineValueStyle: CSSProperties = {
  color: "#273327",
  fontSize: 14,
  lineHeight: 1.5,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
};

const mobileArchiveInputStyle: CSSProperties = {
  width: "100%",
  minWidth: 0,
  boxSizing: "border-box",
  border: "1px solid #dfe7d9",
  borderRadius: 12,
  padding: "9px 10px",
  color: "#273327",
  fontSize: 14,
  outline: "none",
};

const mobileArchiveTextareaStyle: CSSProperties = {
  ...mobileArchiveInputStyle,
  resize: "vertical",
  lineHeight: 1.5,
};

const mobileArchiveSuggestionWrapStyle: CSSProperties = {
  position: "relative",
  minWidth: 0,
};

const mobileArchiveSuggestionListStyle: CSSProperties = {
  position: "absolute",
  top: 42,
  left: 0,
  right: 0,
  maxHeight: 220,
  overflow: "auto",
  border: "1px solid #e3eadf",
  borderRadius: 14,
  background: "#fff",
  padding: 8,
  boxShadow: "0 12px 26px rgba(27, 43, 26, 0.12)",
  zIndex: 20,
  display: "grid",
  gap: 6,
};

function mobileArchiveSuggestionButtonStyle(active: boolean): CSSProperties {
  return {
    border: active ? "1px solid #70a862" : "1px solid transparent",
    borderRadius: 10,
    background: active ? "#f0fff4" : "#f8faf7",
    color: "#263326",
    padding: "8px 9px",
    fontSize: 13,
    lineHeight: 1.45,
    textAlign: "left",
    cursor: "pointer",
  };
}

const mobileArchiveSuggestionNewButtonStyle: CSSProperties = {
  border: "1px dashed #77a86c",
  borderRadius: 10,
  background: "#fff",
  color: "#3f7a3a",
  padding: "8px 9px",
  fontSize: 13,
  textAlign: "left",
  cursor: "pointer",
};

const mobileArchiveSuggestionEmptyStyle: CSSProperties = {
  color: "#8a9587",
  fontSize: 13,
  padding: 8,
};

const mobileArchivePrimaryButtonStyle: CSSProperties = {
  border: "none",
  borderRadius: 999,
  background: "#2f6a31",
  color: "#fff",
  fontSize: 13,
  fontWeight: 800,
  padding: "7px 12px",
  cursor: "pointer",
};

const mobileArchiveSecondaryButtonStyle: CSSProperties = {
  border: "1px solid #dfe7d9",
  borderRadius: 999,
  background: "#fff",
  color: "#5f6f5b",
  fontSize: 13,
  fontWeight: 700,
  padding: "7px 12px",
  cursor: "pointer",
};

const mobileArchiveErrorStyle: CSSProperties = {
  marginTop: 8,
  color: "#b94a48",
  fontSize: 13,
};

const mobileArchiveActionPanelStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 7,
  marginTop: 10,
  paddingTop: 10,
  borderTop: "1px solid #eef2ea",
};

const mobileArchiveActionButtonStyle: CSSProperties = {
  minHeight: 34,
  border: "1px solid #dfe8da",
  borderRadius: 10,
  background: "#fbfcfa",
  color: "#40583a",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
};

const mobileArchiveDangerButtonStyle: CSSProperties = {
  ...mobileArchiveActionButtonStyle,
  border: "1px solid #ead2ce",
  background: "#fff8f6",
  color: "#b23a2d",
};
