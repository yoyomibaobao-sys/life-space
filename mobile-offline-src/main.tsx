import PlantingRegionEditor from "@/components/archive/PlantingRegionEditor";
import PlantingRegionField from "@/components/archive/PlantingRegionField";
import { loadDefaultPlantingRegion, normalizePlantingRegion, type PlantingRegion } from "@/lib/planting-region";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useRef,
  type FormEvent,
} from "react";
import { createRoot } from "react-dom/client";
import {
  assertLocalOfflineAvailable,
  createLocalArchive,
  createLocalRecord,
  createLocalArchiveCycle,
  endLocalArchiveCycle,
  deleteLocalArchive,
  deleteLocalRecord,
  getLocalArchiveDetail,
  inferSingleLocalArchiveOwnerContext,
  listVisibleCloudOfflineArchiveSummaries,
  listVisibleLocalArchiveSummaries,
  markUnownedLocalArchivesForOwner,
  updateLocalArchiveFields,
  updateLocalRecordFields,
  type LocalArchive,
  type LocalArchiveDetail,
  type LocalArchiveOwnerContext,
  type LocalArchiveSummary,
  type LocalImage,
  type LocalRecordWithImages,
} from "@/lib/local-offline-db";
import {
  loadRememberedLocalOwnerContext,
  rememberLocalOwnerContext,
  type StoredLocalOwnerContext,
} from "@/lib/local-owner-context";
import { migrateLegacyLocalOrigin } from "@/lib/local-origin-migration";
import { getArchiveCategoryIcon, getArchiveCategoryLabel, type ArchiveCategory } from "@/lib/archive-categories";

import UiIcon from "@/components/ui/UiIcon";
import ArchiveProjectCard from "@/components/archive-ui/ArchiveProjectCard";
import ArchiveDetailHeaderView from "@/components/archive-ui/ArchiveDetailHeaderView";
import ArchiveRecordComposer from "@/components/archive-ui/ArchiveRecordComposer";
import type { ArchiveProjectView } from "@/components/archive-ui/types";
import { localArchiveToProjectView } from "@/components/archive-ui/localArchiveProjectView";
import SegmentedChoice from "@/components/ui/SegmentedChoice";
import RecordLocationField from "@/components/record/RecordLocationField";
import { loadDefaultRecordLocation, type RecordLocation } from "@/lib/record-location";
import { readImageCapturedAt } from "@/lib/photo-metadata";
import {
  getOfflineGuideKey,
  getOfflineGuideName,
  getOfflineGuideOverview,
  getOfflineGuideParameters,
  loadOfflineGuideDirectory,
  type OfflineGuideDirectoryEntry,
} from "@/lib/offline-guide-directory";
import type { SystemNameCandidate } from "@/lib/system-name-candidates";
import { getArchiveCycleTerminology } from "@/lib/archive-cycle-terminology";
import { localDateTimeInputToIso, toLocalDateTimeInputValue } from "@/lib/date-time";

declare const __LIFESPACE_CLOUD_ORIGIN__: string;

const CLOUD_ORIGIN = __LIFESPACE_CLOUD_ORIGIN__;
const MAX_PHOTOS = 10;

type Language = "zh" | "en";
type Screen =
  | { kind: "list" }
  | { kind: "new-project"; guide?: SystemNameCandidate }
  | { kind: "guides" }
  | { kind: "guide-detail"; guideKey: string }
  | { kind: "settings" }
  | { kind: "choose-project" }
  | { kind: "cloud"; section: "discover" | "experience" | "follow" | "market" }
  | { kind: "detail"; archiveId: string }
  | { kind: "edit-project"; archiveId: string }
  | { kind: "new-record"; archiveId: string }
  | { kind: "edit-record"; archiveId: string; recordId: string };

const text = {
  zh: {
    mySpace: "我的空间", settings: "设置", language: "语言", all: "全部", cloud: "云空间", local: "本地", project: "项目",
    home: "首页", follow: "关注", market: "集市", me: "我", guides: "指引", discover: "记录", experience: "经验",
    cloudUnavailable: "未联网", camera: "拍照", album: "从相册添加", chooseProject: "选择项目",
    guideSearch: "搜索指引名称", guideHint: "选择指引，也可以填写自定义名称", details: "详情", properties: "属性",
    guideOverview: "基础概要", basicReferences: "基础参考", createFromGuide: "按此指引新建项目",
    guideOfflineNotice: "离线可查看基础概要；完整实操、经验卡和关联项目请联网后查看。",
    guideSignInRequired: "联网登录／注册后可查看基础概要。", guideUnavailable: "这条离线指引暂时不可用。",
    ongoing: "进行中", ended: "已结束", period: "项目分期", enablePeriod: "开启分期", periodDate: "期次开始日期", status: "项目状态", visibility: "可见范围", private: "仅自己可见",
    photoLimit: "每次最多选择10张，可分多次添加", removePhoto: "移除照片",
    brand: "有时·耕作",
    offlineBody: "本机项目不会自动上传。云项目离线新增记录保存在本机，联网后可手动上传到原项目。",
    migrationWarning: "旧版本地资料暂未完成迁移。现有资料不会被删除，请稍后重新打开 App 再试。",
    reconnect: "重新连接云端",
    newProject: "新建项目",
    localProjects: "本地项目",
    offlineCopies: "缓存副本",
    offlineStatus: "本机",
    pendingUpload: "待上传",
    cloudCacheReadOnly: "云端已有内容离线只读；新记录会先保存在本机，联网后手动上传。",
    noProjects: "还没有本地项目",
    noProjectsHint: "断网时也可以先创建，内容会保存在这台设备。",
    records: "条记录",
    photos: "张照片",
    unownedTitle: "发现登录前创建的本地项目",
    unownedBody: "可以归入当前账号在本机的项目列表；这不会上传云端。",
    claim: "归入我的本地项目",
    back: "返回",
    edit: "编辑",
    remove: "删除",
    addRecord: "新建记录",
    noRecords: "暂无记录",
    projectInfo: "项目信息",
    title: "项目名称",
    category: "项目类型",
    systemName: "关联指引",
    source: "来源（选填）",
    note: "备注（选填）",
    recordNote: "记录内容",
    recordTime: "记录时间",
    selectPhotos: "照片（最多 10 张）",
    photoHint: "点击后可选择相机或相册；照片会压缩后保存在本机。",
    save: "保存",
    cancel: "取消",
    saving: "保存中…",
    loading: "正在准备空间…",
    requiredProject: "请填写项目名称和对象名称。",
    requiredRecord: "请填写记录内容，或至少选择一张照片。",
    createSuccess: "本地项目已创建",
    updateSuccess: "已保存",
    recordSuccess: "记录已保存到本机",
    deleteProjectConfirm: "确定删除这个本地项目及其全部记录和照片吗？此操作无法撤销。",
    deleteRecordConfirm: "确定删除这条本地记录及其照片吗？此操作无法撤销。",
    deleted: "已删除",
    migrated: "升级前的本地资料已保留",
    readFailed: "无法读取本地资料。",
    plant: "种植",
    system: "农设",
    insect_fish: "虫鱼",
    other: "其他",
  },
  en: {
    mySpace: "My space", settings: "Settings", language: "Language", all: "All", cloud: "Cloud", local: "Local", project: "Project",
    home: "Home", follow: "Following", market: "Market", me: "Me", guides: "Guides", discover: "Records", experience: "Experience",
    cloudUnavailable: "Offline", camera: "Camera", album: "Gallery", chooseProject: "Choose project",
    guideSearch: "Search guides", guideHint: "Choose a guide or enter your own name", details: "Details", properties: "Properties",
    guideOverview: "Basic overview", basicReferences: "Basic references", createFromGuide: "Start a project from this guide",
    guideOfflineNotice: "The basic overview is available offline. Reconnect for full practice guidance, experience cards, and related projects.",
    guideSignInRequired: "Reconnect and log in or register to view the basic overview.", guideUnavailable: "This offline guide is temporarily unavailable.",
    ongoing: "Ongoing", ended: "Ended", period: "Project periods", enablePeriod: "Enable periods", periodDate: "Period start date", status: "Project status", visibility: "Visibility", private: "Only me",
    photoLimit: "Select up to 10 at a time; add more later", removePhoto: "Remove photo",
    brand: "LifeSpace",
    offlineBody: "Local projects do not upload automatically. New records on cached cloud projects stay on this device until you choose to upload them to the original project online.",
    migrationWarning: "Previous local data has not finished migrating. Nothing was deleted; reopen the app later to retry.",
    reconnect: "Reconnect to cloud",
    newProject: "New local project",
    localProjects: "Local projects",
    offlineCopies: "Cached copies",
    offlineStatus: "On this device",
    pendingUpload: "Pending upload",
    cloudCacheReadOnly: "Existing cloud content is read-only offline. New records stay on this device until you upload them manually online.",
    noProjects: "No local projects yet",
    noProjectsHint: "You can create one offline and keep it on this device.",
    records: "records",
    photos: "photos",
    unownedTitle: "Projects created before sign-in found",
    unownedBody: "Add them to this account's local list. Nothing will be uploaded.",
    claim: "Add to my local projects",
    back: "Back",
    edit: "Edit",
    remove: "Delete",
    addRecord: "New record",
    noRecords: "No records yet",
    projectInfo: "Project details",
    title: "Project name",
    category: "Project type",
    systemName: "Variety / subject / method",
    source: "Source (optional)",
    note: "Notes (optional)",
    recordNote: "Record notes",
    recordTime: "Record time",
    selectPhotos: "Photos (up to 10)",
    photoHint: "Choose Camera or Gallery. Photos are compressed and stored on this device.",
    save: "Save",
    cancel: "Cancel",
    saving: "Saving…",
    loading: "Preparing space…",
    requiredProject: "Enter a project name and subject name.",
    requiredRecord: "Enter notes or select at least one photo.",
    createSuccess: "Local project created",
    updateSuccess: "Saved",
    recordSuccess: "Record saved on this device",
    deleteProjectConfirm: "Delete this local project and all of its records and photos? This cannot be undone.",
    deleteRecordConfirm: "Delete this local record and its photos? This cannot be undone.",
    deleted: "Deleted",
    migrated: "Local data from the previous version was preserved",
    readFailed: "Could not read local data.",
    plant: "Plants",
    system: "Methods",
    insect_fish: "Ecology",
    other: "Other",
  },
} as const;

function getLanguage(): Language {
  try {
    const value = window.localStorage.getItem("lang");
    if (value === "en" || value === "zh") return value;
  } catch {
    // Default to Chinese when browser storage is unavailable.
  }
  return navigator.language.toLowerCase().startsWith("en") ? "en" : "zh";
}

function formatDate(value: string | null | undefined, language: Language) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(language === "en" ? "en" : "zh-CN", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function toDateTimeLocal(value?: string | null) {
  return toLocalDateTimeInputValue(value || new Date());
}

function BlobImage({ image, className, alt }: {
  image?: LocalImage | null;
  className?: string;
  alt: string;
}) {
  const [url] = useState(() =>
    image?.blob ? URL.createObjectURL(image.blob) : "",
  );

  useEffect(() => {
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [url]);

  return url ? <img src={url} alt={alt} className={className} /> : null;
}

function App() {
  const [language, setLanguage] = useState<Language>(getLanguage);
  const copy = text[language];
  const [screen, setScreenState] = useState<Screen>({ kind: "cloud", section: "discover" });
  const [categoryFilter, setCategoryFilter] = useState<ArchiveCategory | "all">("all");
  const [guideQuery, setGuideQuery] = useState("");
  const [directory] = useState(loadOfflineGuideDirectory);
  function setScreen(next: Screen, replace = false) {
    window.history[replace ? "replaceState" : "pushState"]({ offlineScreen: next }, "", `#${next.kind}`);
    setScreenState(next);
    window.scrollTo({ top: 0 });
  }
  useEffect(() => {
    window.history.replaceState({ offlineScreen: { kind: "cloud", section: "discover" } }, "", "#home");
    const back = (event: PopStateEvent) => setScreenState(event.state?.offlineScreen || { kind: "cloud", section: "discover" });
    window.addEventListener("popstate", back);
    return () => window.removeEventListener("popstate", back);
  }, []);
  const [owner, setOwner] = useState<StoredLocalOwnerContext | null>(() =>
    loadRememberedLocalOwnerContext(),
  );
  const [archives, setArchives] = useState<LocalArchiveSummary[]>([]);
  const [cloudCaches, setCloudCaches] = useState<LocalArchiveSummary[]>([]);
  const [unownedCount, setUnownedCount] = useState(0);
  const [detail, setDetail] = useState<LocalArchiveDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [migrationWarning, setMigrationWarning] = useState(false);
  const [toast, setToast] = useState("");

  const ownerContext: LocalArchiveOwnerContext | null = useMemo(
    () => owner
      ? { userId: owner.userId, email: owner.email || null }
      : null,
    [owner],
  );

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  }, []);

  const loadList = useCallback(async (context?: LocalArchiveOwnerContext | null) => {
    const activeOwner = context === undefined ? ownerContext : context;
    const [result, cachedCloud] = await Promise.all([
      listVisibleLocalArchiveSummaries(activeOwner),
      listVisibleCloudOfflineArchiveSummaries(activeOwner),
    ]);
    setArchives(result.archives);
    setCloudCaches(cachedCloud);
    setUnownedCount(result.unownedCount);
  }, [ownerContext]);

  const loadDetail = useCallback(async (
    archiveId: string,
    context?: LocalArchiveOwnerContext | null,
  ) => {
    const next = await getLocalArchiveDetail(
      archiveId,
      context === undefined ? ownerContext : context,
    );
    setDetail(next);
    return next;
  }, [ownerContext]);

  useEffect(() => {
    let cancelled = false;
    async function initialize() {
      try {
        assertLocalOfflineAvailable();
        const migration = await migrateLegacyLocalOrigin();
        if (cancelled) return;
        let nextOwner = loadRememberedLocalOwnerContext();
        if (!nextOwner) {
          const inferredOwner = await inferSingleLocalArchiveOwnerContext();
          if (inferredOwner?.userId) {
            rememberLocalOwnerContext({
              userId: inferredOwner.userId,
              email: inferredOwner.email || null,
            });
            nextOwner = {
              userId: inferredOwner.userId,
              email: inferredOwner.email || null,
            };
          }
        }
        setOwner(nextOwner);
        await loadList(
          nextOwner ? { userId: nextOwner.userId, email: nextOwner.email } : null,
        );
        if (
          migration.status === "migrated" &&
          migration.archiveCount + migration.recordCount + migration.imageCount > 0
        ) {
          showToast(copy.migrated);
        }
      } catch (error) {
        console.warn("offline initialization", error);
        if (cancelled) return;
        setMigrationWarning(true);
        try {
          await loadList();
        } catch {
          showToast(copy.readFailed);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void initialize();
    return () => { cancelled = true; };
    // Initialization must run once for this offline document.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (screen.kind !== "detail" && screen.kind !== "edit-project" &&
        screen.kind !== "new-record" && screen.kind !== "edit-record") return;
    let canceled = false;
    setDetail(null);
    void getLocalArchiveDetail(screen.archiveId, ownerContext).then((next) => { if (!canceled) setDetail(next); }).catch(() => showToast(copy.readFailed));
    return () => { canceled = true; };
  }, [screen, ownerContext, showToast, copy.readFailed]);

  function goList() {
    setScreen({ kind: "list" });
    setDetail(null);
    void loadList();
  }

  function openDetail(archiveId: string) {
    setScreen({ kind: "detail", archiveId }, ["edit-project", "new-project", "new-record", "edit-record"].includes(screen.kind));
  }

  function reconnect() {
    window.location.assign(`${CLOUD_ORIGIN}/archive?source=local`);
  }

  async function claimUnowned() {
    if (!ownerContext) return;
    await markUnownedLocalArchivesForOwner({
      userId: ownerContext.userId!,
      email: ownerContext.email || null,
    });
    await loadList();
    showToast(copy.updateSuccess);
  }

  async function handleDeleteArchive(archiveId: string) {
    if (!window.confirm(copy.deleteProjectConfirm)) return;
    await deleteLocalArchive(archiveId);
    showToast(copy.deleted);
    goList();
  }

  async function handleDeleteRecord(recordId: string, archiveId: string) {
    if (!window.confirm(copy.deleteRecordConfirm)) return;
    await deleteLocalRecord(recordId);
    await loadDetail(archiveId);
    await loadList();
    showToast(copy.deleted);
  }

  function toggleLanguage() {
    const next = language === "zh" ? "en" : "zh";
    setLanguage(next);
    try { window.localStorage.setItem("lang", next); } catch { /* no-op */ }
    window.dispatchEvent(new CustomEvent("lifespace-language-change", { detail: next }));
    document.documentElement.lang = next === "zh" ? "zh-CN" : "en";
  }

  const activeGuide = screen.kind === "guide-detail"
    ? directory.find((guide) => getOfflineGuideKey(guide) === screen.guideKey)
    : undefined;
  const headerTitle = screen.kind === "cloud"
    ? screen.section === "follow"
      ? copy.follow
      : screen.section === "market"
        ? copy.market
        : copy.home
    : screen.kind === "guides" || screen.kind === "guide-detail"
      ? copy.home
      : screen.kind === "settings"
        ? copy.settings
        : copy.mySpace;
  const homeActive =
    screen.kind === "guides" ||
    screen.kind === "guide-detail" ||
    (screen.kind === "cloud" &&
      (screen.section === "discover" || screen.section === "experience"));
  const listedArchives = [...cloudCaches, ...archives];
  const personalActive = [
    "list",
    "new-project",
    "settings",
    "choose-project",
    "detail",
    "edit-project",
    "new-record",
    "edit-record",
  ].includes(screen.kind);

  if (loading) {
    return <main className="offline-shell loading">{copy.loading}</main>;
  }

  return (
    <main className="offline-shell">
      {screen.kind === "list" ? (
        <section className="offline-space-identity">
          <span className="offline-space-avatar"><UiIcon name="user" size={24} strokeWidth={1.7} /></span>
          <span className="offline-space-person">
            <strong>{owner?.email?.split("@")[0] || copy.mySpace}</strong>
            <small>{copy.offlineStatus}</small>
          </span>
          <span className="offline-space-summary">{copy.offlineCopies} {cloudCaches.length}</span>
          <button className="offline-space-menu" type="button" aria-label={copy.settings} onClick={() => setScreen({ kind: "settings" })}><UiIcon name="menu" size={21} strokeWidth={1.8} /></button>
        </section>
      ) : (
        <header className="offline-header">
          <span className="header-spacer" aria-hidden="true" />
          <div className="brand-name">{headerTitle}</div>
          <div className="header-actions">
            {!owner ? <button className="icon-button" type="button" onClick={toggleLanguage}>{language === "zh" ? "EN" : "中文"}</button> : null}
            <button className="icon-button" type="button" aria-label={copy.settings} onClick={() => setScreen({ kind: "settings" })}><UiIcon name="menu" size={20} strokeWidth={1.8} /></button>
          </div>
        </header>
      )}

      {migrationWarning ? (
        <section className="notice warning"><p>{copy.migrationWarning}</p></section>
      ) : null}

      {screen.kind === "list" ? (
        <>
          <div className="source-row">
            <button type="button" aria-pressed="true">{copy.local} {archives.length + cloudCaches.length}</button>
            <button type="button" className="add-project" onClick={() => setScreen({ kind: "new-project" })}>+{copy.project}</button>
          </div>
          <div className="category-row">{(["all", "plant", "system", "insect_fish", "other"] as const).map((category) => <button type="button" key={category} aria-pressed={categoryFilter === category} onClick={() => setCategoryFilter(category)}>{copy[category]}</button>)}</div>

          {ownerContext && unownedCount > 0 ? (
            <section className="notice warning">
              <strong>{copy.unownedTitle}</strong>
              <p>{copy.unownedBody}</p>
              <div className="action-row">
                <button className="secondary-button" type="button" onClick={() => void claimUnowned()}>
                  {copy.claim}
                </button>
              </div>
            </section>
          ) : null}

          {listedArchives.length ? (
            <div className="project-list online-project-list">
              {listedArchives.filter((archive) => categoryFilter === "all" || archive.category === categoryFilter).map((archive) => (
                <ArchiveProjectCard
                  key={archive.id}
                  project={{
                    ...localArchiveToProjectView(archive, ownerContext, language),
                    href: undefined,
                    visibilityLabel: archive.local_role === "cloud-offline-cache" ? copy.offlineCopies : copy.local,
                  }}
                  mobileMode
                  mobileShowCategoryBadge={false}
                  onClick={() => openDetail(archive.id)}
                  actionSlot={archive.pending_record_count > 0 ? <span>{copy.pendingUpload} {archive.pending_record_count}</span> : undefined}
                />
              ))}
            </div>
          ) : (
            <section className="panel empty">
              <strong>{copy.noProjects}</strong>
              {copy.noProjectsHint}
            </section>
          )}
        </>
      ) : null}

      {screen.kind === "new-project" ? (
        <ProjectForm
          language={language}
          copy={copy}
          owner={owner}
          guide={screen.guide}
          onCancel={goList}
          onSaved={async (archive) => {
            await loadList();
            showToast(copy.createSuccess);
            openDetail(archive.id);
          }}
        />
      ) : null}

      {screen.kind === "detail" && detail ? (
        <ProjectDetail
          detail={detail}
          ownerContext={ownerContext}
          onChanged={async () => { await loadDetail(detail.archive.id); await loadList(); }}
          language={language}
          copy={copy}
          onBack={goList}
          onEdit={() => setScreen({ kind: "edit-project", archiveId: detail.archive.id })}
          onAddRecord={() => setScreen({ kind: "new-record", archiveId: detail.archive.id })}
          onEditRecord={(recordId) => setScreen({ kind: "edit-record", archiveId: detail.archive.id, recordId })}
          onDelete={() => void handleDeleteArchive(detail.archive.id)}
          onDeleteRecord={(recordId) => void handleDeleteRecord(recordId, detail.archive.id)}
        />
      ) : null}

      {screen.kind === "edit-project" && detail && detail.archive.local_role !== "cloud-offline-cache" ? (
        <ProjectForm
          language={language}
          copy={copy}
          owner={owner}
          archive={detail.archive}
          onCancel={() => openDetail(detail.archive.id)}
          onSaved={async () => {
            await loadDetail(detail.archive.id);
            await loadList();
            showToast(copy.updateSuccess);
            openDetail(detail.archive.id);
          }}
        />
      ) : null}

      {screen.kind === "new-record" && detail && detail.archive.status === "active" ? (
        <RecordForm
          copy={copy}
          archive={detail.archive}
          language={language}
          onCancel={() => openDetail(detail.archive.id)}
          onSaved={async () => {
            await loadDetail(detail.archive.id);
            await loadList();
            showToast(copy.recordSuccess);
            openDetail(detail.archive.id);
          }}
        />
      ) : null}

      {screen.kind === "edit-record" && detail && (detail.archive.local_role !== "cloud-offline-cache" || detail.records.some((item) => item.id === screen.recordId && item.sync?.status === "pending-cloud-sync")) ? (
        <RecordForm
          copy={copy}
          archive={detail.archive}
          language={language}
          record={detail.records.find((item) => item.id === screen.recordId)}
          onCancel={() => openDetail(detail.archive.id)}
          onSaved={async () => {
            await loadDetail(detail.archive.id);
            await loadList();
            showToast(copy.updateSuccess);
            openDetail(detail.archive.id);
          }}
        />
      ) : null}

      {homeActive ? <div className="top-tabs home-section-tabs"><button type="button" aria-pressed={screen.kind === "cloud" && screen.section === "discover"} onClick={() => setScreen({ kind: "cloud", section: "discover" })}>{copy.discover}</button><button type="button" aria-pressed={screen.kind === "cloud" && screen.section === "experience"} onClick={() => setScreen({ kind: "cloud", section: "experience" })}>{copy.experience}</button><button type="button" aria-pressed={screen.kind === "guides" || screen.kind === "guide-detail"} onClick={() => setScreen({ kind: "guides" })}>{copy.guides}</button></div> : null}

      {screen.kind === "guides" ? <>
        <div className="field"><input type="search" value={guideQuery} onChange={(e) => setGuideQuery(e.target.value)} placeholder={copy.guideSearch} aria-label={copy.guideSearch} /></div>
        <div className="category-row">{(["all", "plant", "system", "insect_fish", "other"] as const).map((category) => <button type="button" key={category} aria-pressed={categoryFilter === category} onClick={() => setCategoryFilter(category)}>{copy[category]}</button>)}</div>
        <div className="guide-grid">{directory.filter((row) => (categoryFilter === "all" || row.category === categoryFilter) && `${row.label} ${row.nameEn || ""} ${(row.aliases || []).join(" ")} ${row.searchText || ""}`.toLowerCase().includes(guideQuery.toLowerCase())).map((guide) => <button type="button" className="guide-item" key={getOfflineGuideKey(guide)} onClick={() => setScreen({ kind: "guide-detail", guideKey: getOfflineGuideKey(guide) })}><strong>{getOfflineGuideName(guide, language)}</strong><small>{guide.category ? copy[guide.category] : ""}</small>{owner && guide.description ? <p>{guide.description}</p> : null}</button>)}</div>
      </> : null}
      {screen.kind === "guide-detail" ? <OfflineGuideDetail guide={activeGuide} owner={owner} language={language} copy={copy} onBack={() => window.history.back()} onReconnect={reconnect} onCreate={(guide) => setScreen({ kind: "new-project", guide })} /> : null}
      {screen.kind === "choose-project" ? <section className="panel"><h1>{copy.chooseProject}</h1><div className="project-list">{[...archives, ...cloudCaches].filter((archive) => archive.status === "active").map((archive) => <button type="button" className="secondary-button" key={archive.id} onClick={() => setScreen({ kind: "new-record", archiveId: archive.id })}>{archive.title}</button>)}</div><div className="action-row"><button type="button" className="primary-button" onClick={() => setScreen({ kind: "new-project" })}>{copy.newProject}</button></div></section> : null}
      {screen.kind === "settings" ? <section className="panel"><h1>{copy.settings}</h1><div className="property-row"><span>{copy.language}</span><SegmentedChoice label={copy.language} value={language} options={[{ value: "zh", label: "中文" }, { value: "en", label: "English" }]} onChange={toggleLanguage} /></div><p className="project-meta">{copy.offlineBody}</p><button type="button" className="secondary-button" onClick={reconnect}>{copy.reconnect}</button></section> : null}
      {screen.kind === "cloud" ? <section className="network-offline" role="status" aria-live="polite">{copy.cloudUnavailable}</section> : null}
      <nav className="bottom-nav" aria-label={language === "zh" ? "主导航" : "Main navigation"}>
        <button type="button" aria-current={homeActive ? "page" : undefined} onClick={() => setScreen({ kind: "cloud", section: "discover" })}><UiIcon name="home" size={17} strokeWidth={1.7} /><span>{copy.home}</span></button>
        <button type="button" aria-current={screen.kind === "cloud" && screen.section === "follow" ? "page" : undefined} onClick={() => setScreen({ kind: "cloud", section: "follow" })}><UiIcon name="follow" size={17} strokeWidth={1.7} /><span>{copy.follow}</span></button>
        <button type="button" className="quick-add" aria-label={copy.addRecord} onClick={() => setScreen(screen.kind === "detail" && detail && detail.archive.status === "active" ? { kind: "new-record", archiveId: detail.archive.id } : { kind: "choose-project" })}><UiIcon name="plus" size={25} strokeWidth={2.2} /></button>
        <button type="button" aria-current={screen.kind === "cloud" && screen.section === "market" ? "page" : undefined} onClick={() => setScreen({ kind: "cloud", section: "market" })}><UiIcon name="store" size={17} strokeWidth={1.7} /><span>{copy.market}</span></button>
        <button type="button" aria-current={personalActive ? "page" : undefined} onClick={goList}><UiIcon name="user" size={17} strokeWidth={1.7} /><span>{copy.me}</span></button>
      </nav>
      {toast ? <div className="toast" role="status">{toast}</div> : null}
    </main>
  );
}

type OfflineCopy = typeof text.zh | typeof text.en;

function OfflineGuideDetail({
  guide,
  owner,
  language,
  copy,
  onBack,
  onReconnect,
  onCreate,
}: {
  guide?: OfflineGuideDirectoryEntry;
  owner: StoredLocalOwnerContext | null;
  language: Language;
  copy: OfflineCopy;
  onBack: () => void;
  onReconnect: () => void;
  onCreate: (guide: OfflineGuideDirectoryEntry) => void;
}) {
  if (!guide) {
    return (
      <>
        <div className="back-row"><button className="back-button" type="button" onClick={onBack}>← {copy.back}</button></div>
        <section className="panel empty"><strong>{copy.guideUnavailable}</strong></section>
      </>
    );
  }

  const name = getOfflineGuideName(guide, language);
  const parameters = owner ? getOfflineGuideParameters(guide, language) : [];

  return (
    <>
      <div className="detail-heading">
        <button className="back-button" type="button" onClick={onBack} aria-label={copy.back}><UiIcon name="arrow-left" size={22} /></button>
        <h1>{name}</h1>
        <span />
      </div>
      <section className="panel guide-hero">
        <span className="guide-category">{guide.category ? copy[guide.category] : copy.other}</span>
        <h1>{name}</h1>
        <button type="button" className="primary-button" onClick={() => onCreate(guide)}>{copy.createFromGuide}</button>
      </section>
      {!owner ? (
        <section className="notice guide-access-notice">
          <strong>{copy.guideSignInRequired}</strong>
          <div className="action-row"><button type="button" className="secondary-button" onClick={onReconnect}>{copy.reconnect}</button></div>
        </section>
      ) : (
        <>
          <section className="panel guide-overview">
            <h2>{copy.guideOverview}</h2>
            <p>{getOfflineGuideOverview(guide, language)}</p>
          </section>
          {parameters.length ? (
            <section className="panel">
              <h2>{copy.basicReferences}</h2>
              <div className="guide-parameter-grid">
                {parameters.map((parameter) => (
                  <article className="guide-parameter" key={`${parameter.label}:${parameter.value}`}>
                    <small>{parameter.label}</small>
                    <strong>{parameter.value}</strong>
                    {parameter.note ? <p>{parameter.note}</p> : null}
                  </article>
                ))}
              </div>
            </section>
          ) : null}
          <section className="notice guide-access-notice"><p>{copy.guideOfflineNotice}</p></section>
        </>
      )}
    </>
  );
}

function ProjectForm({
  language,
  copy,
  owner,
  archive,
  guide,
  onCancel,
  onSaved,
}: {
  language: Language;
  copy: OfflineCopy;
  owner: StoredLocalOwnerContext | null;
  archive?: LocalArchive;
  guide?: SystemNameCandidate;
  onCancel: () => void;
  onSaved: (archive: LocalArchive) => void | Promise<void>;
}) {
  const [title, setTitle] = useState(archive?.title || guide?.label || "");
  const [category, setCategory] = useState<ArchiveCategory>(archive?.category || guide?.category || "plant");
  const [systemName, setSystemName] = useState(archive?.system_name || archive?.species_name || guide?.label || "");
  const [directory] = useState(loadOfflineGuideDirectory);
  const [selectedGuide, setSelectedGuide] = useState<SystemNameCandidate | undefined>(guide);
  const [source, setSource] = useState(archive?.source || "");
  const [plantingRegion, setPlantingRegion] = useState<PlantingRegion | null>(archive ? archive.planting_region || null : loadDefaultPlantingRegion(owner?.userId));
  const [note, setNote] = useState(archive?.note || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim() || !systemName.trim()) {
      setError(copy.requiredProject);
      return;
    }
    const normalizedRegion = normalizePlantingRegion(plantingRegion);
    const hasRegionDraft = plantingRegion && Object.values(plantingRegion).some((value) => value.trim());
    if (category === "plant" && (!archive || archive.planting_region || hasRegionDraft) && !normalizedRegion) {
      setError(language === "en" ? "Enter the planting country and city / district." : "请填写项目实际种植的国家及城市／区县。");
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (archive) {
        const updated = await updateLocalArchiveFields(
          archive.id,
          {
            title,
            category,
            system_name: systemName,
            species_name: category === "plant" ? systemName : null,
            plant_id: selectedGuide?.plantId || (systemName === (archive.system_name || archive.species_name) ? archive.plant_id : null),
            plant_slug: selectedGuide?.plantSlug || (systemName === (archive.system_name || archive.species_name) ? archive.plant_slug : null),
            source,
            planting_region: normalizedRegion,
            note,
          },
          owner ? { userId: owner.userId, email: owner.email } : null,
        );
        await onSaved(updated);
      } else {
        const created = await createLocalArchive({
          title,
          category,
          system_name: systemName,
          species_name: category === "plant" ? systemName : null,
          plant_id: selectedGuide?.plantId || null,
          plant_slug: selectedGuide?.plantSlug || null,
          source,
          planting_region: normalizedRegion,
          note,
          local_owner_user_id: owner?.userId || null,
          local_owner_email: owner?.email || null,
          local_owner_marked_at: owner ? new Date().toISOString() : null,
        });
        await onSaved(created);
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : copy.readFailed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="back-row"><button className="back-button" type="button" onClick={onCancel}>← {copy.back}</button></div>
      <section className="panel">
        <div className="section-title"><h1>{archive ? copy.edit : copy.newProject}</h1></div>
        <form className="form" onSubmit={submit}>
          <div className="field"><label>{copy.title}</label><input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} /></div>
          <div className="field">
            <label>{copy.category}</label>
            <select value={category} onChange={(event) => setCategory(event.target.value as ArchiveCategory)}>
              <option value="plant">{copy.plant}</option>
              <option value="system">{copy.system}</option>
              <option value="insect_fish">{copy.insect_fish}</option>
              <option value="other">{copy.other}</option>
            </select>
          </div>
          <div className="field"><label>{copy.systemName}</label><input value={systemName} onChange={(event) => { setSystemName(event.target.value); setSelectedGuide(undefined); }} maxLength={160} placeholder={copy.guideSearch} /><small>{copy.guideHint}</small>
            <div className="guide-suggestions">{directory.filter((candidate) => candidate.category === category && candidate.label.toLowerCase().includes(systemName.toLowerCase())).slice(0, 10).map((candidate) => <button type="button" key={`${candidate.category}:${candidate.label}`} onClick={() => { setSystemName(candidate.label); setSelectedGuide(candidate); if (!title) setTitle(candidate.label); }}>{candidate.label}</button>)}</div>
          </div>
          {category === "plant" ? <PlantingRegionField value={plantingRegion} onChange={setPlantingRegion} language={language} required={!archive} /> : null}
          <div className="field"><label>{copy.source}</label><input value={source} onChange={(event) => setSource(event.target.value)} maxLength={240} /></div>
          <div className="field"><label>{copy.note}</label><textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={4000} /></div>
          {error ? <section className="notice warning"><p>{error}</p></section> : null}
          <div className="submit-row">
            <button className="secondary-button" type="button" onClick={onCancel}>{copy.cancel}</button>
            <button className="primary-button" type="submit" disabled={busy}>{busy ? copy.saving : copy.save}</button>
          </div>
        </form>
      </section>
    </>
  );
}

function ProjectDetail({ detail, language, copy, ownerContext, onChanged, onBack, onEdit, onAddRecord, onEditRecord, onDelete, onDeleteRecord }: {
  detail: LocalArchiveDetail; language: Language; copy: OfflineCopy; ownerContext: LocalArchiveOwnerContext | null;
  onChanged: () => Promise<void>; onBack: () => void; onEdit: () => void; onAddRecord: () => void;
  onEditRecord: (recordId: string) => void; onDelete: () => void; onDeleteRecord: (recordId: string) => void;
}) {
  const [tab, setTab] = useState("details");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [periodDate, setPeriodDate] = useState(toDateTimeLocal().slice(0, 10));
  const [filter, setFilter] = useState("all");
  const [lightbox, setLightbox] = useState<LocalImage | null>(null);
  const archive = detail.archive;
  const isCloudCache = archive.local_role === "cloud-offline-cache";
  const periods = getArchiveCycleTerminology(archive.category, language);
  const projectView: ArchiveProjectView = {
    id: archive.id,
    mode: "local",
    title: archive.title,
    category: archive.category,
    categoryLabel: getArchiveCategoryLabel(archive.category, language),
    categoryIcon: getArchiveCategoryIcon(archive.category),
    systemName: archive.system_name || archive.species_name || "",
    subcategoryLabel: archive.subcategory || null,
    groupLabel: archive.group_name || null,
    visibilityLabel: isCloudCache ? copy.offlineCopies : copy.local,
    visibilityTone: "neutral",
    storageLabel: copy.local,
    storageTone: "device",
    recordCount: detail.records.length,
    latestTime: detail.records[0]?.record_time || archive.updated_at,
    ended: archive.status === "ended",
  };
  async function change(work: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true); setError("");
    try { await work(); await onChanged(); } catch (e) { setError(e instanceof Error ? e.message : copy.readFailed); } finally { setBusy(false); }
  }
  return <>
    <div className="back-row"><button className="back-button" type="button" onClick={onBack} aria-label={copy.back}>← {copy.back}</button></div>
    <ArchiveDetailHeaderView
      project={projectView}
      hint={isCloudCache ? copy.cloudCacheReadOnly : undefined}
      showSystemNameInTitle
    />
    <div className="top-tabs"><button type="button" aria-pressed={tab === "details"} onClick={() => setTab("details")}>{copy.details}</button><button type="button" aria-pressed={tab === "properties"} onClick={() => setTab("properties")}>{copy.properties}</button></div>
    {error ? <section className="notice warning" role="alert"><p>{error}</p></section> : null}
    {tab === "properties" ? <>
      {archive.category === "plant" ? <PlantingRegionEditor key={archive.id} language={language} value={archive.planting_region} canEdit={!busy && !isCloudCache} onSave={async (region) => {
        await updateLocalArchiveFields(archive.id, { planting_region: region }, ownerContext);
        await onChanged();
      }} /> : null}
      <section className="panel property-list">
        <div className="property-row"><span>{copy.title}</span><strong>{archive.title}</strong></div>
        <div className="property-row"><span>{copy.systemName}</span><strong>{archive.system_name || archive.species_name || "—"}</strong></div>
        <div className="property-row"><span>{copy.category}</span><span>{copy[archive.category]}</span></div>
        <div className="property-row"><span>{copy.source}</span><span>{archive.source || "—"}</span></div>
        <div className="property-row"><span>{copy.note}</span><span>{archive.note || "—"}</span></div>
        <div className="property-row"><span>{copy.status}</span><SegmentedChoice label={copy.status} value={archive.status} disabled={busy || isCloudCache} options={[{ value: "active", label: copy.ongoing }, { value: "ended", label: copy.ended }]} onChange={(status) => void change(() => updateLocalArchiveFields(archive.id, { status, ended_at: status === "ended" ? new Date().toISOString() : null }, ownerContext))} /></div>
        <div className="property-row"><span>{copy.visibility}</span><span>{copy.private}</span></div>
        {!isCloudCache ? <button type="button" className="secondary-button" onClick={onEdit}>{copy.edit}</button> : null}
      </section>
      <section className="panel"><h2>{copy.period}</h2><label className="property-row"><span>{copy.enablePeriod}</span><input type="checkbox" role="switch" checked={Boolean(archive.cycle_enabled)} disabled={busy || isCloudCache} onChange={(e) => void change(() => updateLocalArchiveFields(archive.id, { cycle_enabled: e.target.checked }, ownerContext))} /></label>
        {archive.cycle_enabled ? <div className="form">
          {(archive.cycles || []).map((cycle) => <div className="property-row" key={cycle.id}><div><strong>{cycle.display_name || periods.cycleLabel(cycle.cycle_no)}</strong><small className="project-meta">{formatDate(cycle.started_at, language)}</small></div>{cycle.status === "active" && !isCloudCache ? <button type="button" className="secondary-button" disabled={busy} onClick={() => { if (window.confirm(periods.endDialogMessage)) void change(() => endLocalArchiveCycle(archive.id, cycle.id, new Date().toISOString(), ownerContext)); }}>{periods.endAction}</button> : cycle.status === "ended" ? <span>{copy.ended}</span> : null}</div>)}
          <label className="field">{copy.periodDate}<input type="date" value={periodDate} onChange={(e) => setPeriodDate(e.target.value)} /></label>
          {!isCloudCache ? <button type="button" className="primary-button" disabled={busy || !periodDate || archive.status === "ended"} onClick={() => void change(() => createLocalArchiveCycle(archive.id, new Date(`${periodDate}T00:00:00`).toISOString(), ownerContext))}>{periods.newAction}</button> : null}
        </div> : null}
      </section>
      {!isCloudCache ? <button className="danger-button" type="button" disabled={busy} onClick={onDelete}>{copy.remove}</button> : null}
    </> : <>
      <div className="record-toolbar"><span className="project-meta">{copy[archive.category]} · {isCloudCache ? copy.offlineCopies : copy.local}</span>{archive.status === "active" ? <button type="button" className="primary-button" onClick={onAddRecord}>{copy.addRecord}</button> : null}</div>
      {archive.cycle_enabled ? <label className="field period-filter"><select aria-label={periods.assignLabel} value={filter} onChange={(e) => setFilter(e.target.value)}><option value="all">{copy.all}</option><option value="none">{periods.unassignedOption}</option>{(archive.cycles || []).map((cycle) => <option value={cycle.id} key={cycle.id}>{cycle.display_name || periods.cycleLabel(cycle.cycle_no)}</option>)}</select></label> : null}
      <div className="record-list">{detail.records.filter((record) => !archive.cycle_enabled || filter === "all" || (filter === "none" ? !record.cycle_id : record.cycle_id === filter)).map((record) => <article className="record-card" key={record.id}>
        <div className="record-meta">{formatDate(record.record_time, language)}</div>
        {record.images.length ? <div className={`photo-grid ${record.images.length === 1 ? "single-photo" : ""}`}>{record.images.map((image) => <button type="button" className="photo-view" key={image.id} aria-label={language === "zh" ? "查看照片" : "View photo"} onClick={() => setLightbox(image)}><BlobImage image={image} alt="" /></button>)}</div> : null}
        {record.note ? <p className="record-note">{record.note}</p> : null}
        {record.location ? <p className="project-meta">{record.location.label || `${record.location.latitude?.toFixed(4)}, ${record.location.longitude?.toFixed(4)}`}</p> : null}
        {record.sync?.status === "pending-cloud-sync" ? <div className="record-actions"><span className="project-meta">{copy.pendingUpload}</span><button className="link-button" type="button" onClick={() => onEditRecord(record.id)}>{copy.edit}</button><button className="link-button danger" type="button" onClick={() => onDeleteRecord(record.id)}>{copy.remove}</button></div> : !isCloudCache ? <div className="record-actions"><button className="link-button" type="button" onClick={() => onEditRecord(record.id)}>{copy.edit}</button><button className="link-button danger" type="button" onClick={() => onDeleteRecord(record.id)}>{copy.remove}</button></div> : null}
      </article>)}</div>
      {!detail.records.length ? <section className="panel empty">{copy.noRecords}</section> : null}
    </>}
    {lightbox ? <dialog className="photo-lightbox" open aria-label={language === "zh" ? "照片" : "Photo"} onCancel={() => setLightbox(null)}><button type="button" className="icon-button" autoFocus onClick={() => setLightbox(null)}>{copy.back}</button><BlobImage image={lightbox} alt="" /></dialog> : null}
  </>;
}

function FilePreview({ file }: { file: File }) {
  const [url] = useState(() => URL.createObjectURL(file));
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  return <img src={url} alt="" />;
}

function RecordForm({ copy, archive, language, record, onCancel, onSaved }: {
  copy: OfflineCopy; archive: LocalArchive; language: Language; record?: LocalRecordWithImages;
  onCancel: () => void; onSaved: () => void | Promise<void>;
}) {
  const [note, setNote] = useState(record?.note || "");
  const [recordTime, setRecordTime] = useState(toDateTimeLocal(record?.record_time));
  const [location, setLocation] = useState<RecordLocation | null>(() => record ? record.location || null : loadDefaultRecordLocation());
  const [cycleId, setCycleId] = useState(record?.cycle_id || (archive.cycle_enabled ? archive.cycles?.find((cycle) => cycle.status === "active")?.id : null) || "");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const camera = useRef<HTMLInputElement>(null);
  const album = useRef<HTMLInputElement>(null);
  const periods = getArchiveCycleTerminology(archive.category, language);
  function addFiles(incoming: FileList | null) {
    const images = Array.from(incoming || []).filter((file) => file.type.startsWith("image/"));
    if (files.length + images.length > MAX_PHOTOS) { setError(copy.photoLimit); return; }
    setError(""); setFiles((previous) => [...previous, ...images]);
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!note.trim() && !files.length && !record?.images.length) { setError(copy.requiredRecord); return; }
    if (busy) return;
    setBusy(true); setError("");
    try {
      const isoTime = localDateTimeInputToIso(recordTime, record?.record_time);
      if (!isoTime) throw new Error(language === "en" ? "Enter a valid local date and time." : "请输入有效的本地日期和时间。");
      const imageCapturedAt = await Promise.all(files.map(readImageCapturedAt));
      if (record) await updateLocalRecordFields(record.id, { note, record_time: isoTime, location, cycle_id: cycleId || null, image_files: files, image_captured_at: imageCapturedAt });
      else await createLocalRecord({ archive_id: archive.id, note, record_time: isoTime, location, cycle_id: cycleId || null, image_files: files, image_captured_at: imageCapturedAt });
      await onSaved();
    } catch (e) { setError(e instanceof Error ? e.message : copy.readFailed); } finally { setBusy(false); }
  }
  return (
    <ArchiveRecordComposer mobileMode open title={record ? copy.edit : copy.addRecord} onClose={onCancel}>
      <form className="form" onSubmit={submit}>
      <div className="project-meta">{archive.title} · {copy.local}</div>
      <label className="field">{copy.recordTime}<input type="datetime-local" value={recordTime} onChange={(e) => setRecordTime(e.target.value)} required disabled={busy} /></label>
      {archive.cycle_enabled ? <label className="field">{periods.assignLabel}<select value={cycleId} disabled={busy} onChange={(e) => setCycleId(e.target.value)}><option value="">{periods.unassignedOption}</option>{(archive.cycles || []).filter((cycle) => record || cycle.status === "active").map((cycle) => <option key={cycle.id} value={cycle.id}>{cycle.display_name || periods.cycleLabel(cycle.cycle_no)}</option>)}</select></label> : null}
      <label className="field">{copy.recordNote}<textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={8000} disabled={busy} /></label>
      <div className="field"><label>{copy.selectPhotos}</label><small>{(record?.images.length || 0) + files.length} {copy.photos}</small>
        {record?.images.length ? <div className="photo-grid">{record.images.map((image) => <BlobImage key={image.id} image={image} alt="" />)}</div> : null}
        {files.length ? <div className="photo-grid">{files.map((file, index) => <div className="photo-preview" key={`${file.name}-${file.lastModified}-${index}`}><FilePreview file={file} /><button type="button" disabled={busy} aria-label={copy.removePhoto} onClick={() => setFiles((prev) => prev.filter((_, i) => i !== index))}>×</button></div>)}</div> : null}
        <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
        <input ref={album} type="file" accept="image/*" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
        <div className="submit-row"><button className="secondary-button" type="button" disabled={busy} onClick={() => camera.current?.click()}>{copy.camera}</button><button className="secondary-button" type="button" disabled={busy} onClick={() => album.current?.click()}>{copy.album}</button></div>
      </div>
      <RecordLocationField value={location} onChange={setLocation} files={files} language={language} disabled={busy} />
      {error ? <section className="notice warning" role="alert"><p>{error}</p></section> : null}
      <div className="submit-row"><button className="secondary-button" type="button" onClick={onCancel} disabled={busy}>{copy.cancel}</button><button className="primary-button" type="submit" disabled={busy}>{busy ? copy.saving : copy.save}</button></div>
      </form>
    </ArchiveRecordComposer>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
