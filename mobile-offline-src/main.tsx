import PlantingRegionEditor from "@/components/archive/PlantingRegionEditor";
import PlantingRegionField from "@/components/archive/PlantingRegionField";
import { loadDefaultPlantingRegion, normalizePlantingRegion, formatPlantingRegion, type PlantingRegion } from "@/lib/planting-region";
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
  type StoredLocalOwnerContext,
} from "@/lib/local-owner-context";
import { migrateLegacyLocalOrigin } from "@/lib/local-origin-migration";
import type { ArchiveCategory } from "@/lib/archive-categories";

import UiIcon from "@/components/ui/UiIcon";
import SegmentedChoice from "@/components/ui/SegmentedChoice";
import RecordLocationField from "@/components/record/RecordLocationField";
import { loadDefaultRecordLocation, type RecordLocation } from "@/lib/record-location";
import { readImageCapturedAt } from "@/lib/photo-metadata";
import { loadOfflineGuideDirectory } from "@/lib/offline-guide-directory";
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
  | { kind: "settings" }
  | { kind: "choose-project" }
  | { kind: "cloud" }
  | { kind: "detail"; archiveId: string }
  | { kind: "edit-project"; archiveId: string }
  | { kind: "new-record"; archiveId: string }
  | { kind: "edit-record"; archiveId: string; recordId: string };

const text = {
  zh: {
    mySpace: "我的空间", settings: "设置", language: "语言", all: "全部", cloud: "云空间", local: "本地", project: "项目",
    home: "首页", follow: "关注", market: "集市", me: "我", guides: "指引", discover: "发现", experience: "经验",
    cloudUnavailable: "联网后可查看云端内容", camera: "拍照", album: "从相册添加", chooseProject: "选择项目",
    guideSearch: "搜索指引名称", guideHint: "选择指引，也可以填写自定义名称", details: "详情", properties: "属性",
    ongoing: "进行中", ended: "已结束", period: "项目分期", enablePeriod: "开启分期", periodDate: "期次开始日期", status: "项目状态", visibility: "可见范围", private: "仅自己可见",
    photoLimit: "每次最多选择10张，可分多次添加", removePhoto: "移除照片",
    brand: "有时·耕作",
    offlineMode: "本地离线模式",
    offlineTitle: "当前离线，本地记录可用",
    offlineBody: "项目、记录和照片只保存在本机。重新联网后不会自动上传，也不会覆盖云端资料。",
    migrationWarning: "旧版本地资料暂未完成迁移。现有资料不会被删除，请稍后重新打开 App 再试。",
    reconnect: "重新连接云端",
    newProject: "新建项目",
    localProjects: "本地项目",
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
    loading: "正在读取本地资料…",
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
    home: "Home", follow: "Following", market: "Market", me: "Me", guides: "Guides", discover: "Discover", experience: "Experience",
    cloudUnavailable: "Reconnect to view cloud content", camera: "Camera", album: "Gallery", chooseProject: "Choose project",
    guideSearch: "Search guides", guideHint: "Choose a guide or enter your own name", details: "Details", properties: "Properties",
    ongoing: "Ongoing", ended: "Ended", period: "Project periods", enablePeriod: "Enable periods", periodDate: "Period start date", status: "Project status", visibility: "Visibility", private: "Only me",
    photoLimit: "Select up to 10 at a time; add more later", removePhoto: "Remove photo",
    brand: "LifeSpace",
    offlineMode: "Local offline mode",
    offlineTitle: "Cloud is temporarily unavailable. Local records still work.",
    offlineBody: "Projects, records and photos stay on this device. Reconnecting will not upload them or overwrite cloud data.",
    migrationWarning: "Previous local data has not finished migrating. Nothing was deleted; reopen the app later to retry.",
    reconnect: "Reconnect to cloud",
    newProject: "New local project",
    localProjects: "Local projects",
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
    loading: "Reading local data…",
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
  const [screen, setScreenState] = useState<Screen>({ kind: "list" });
  const [categoryFilter, setCategoryFilter] = useState<ArchiveCategory | "all">("all");
  const [guideQuery, setGuideQuery] = useState("");
  const [directory] = useState(loadOfflineGuideDirectory);
  function setScreen(next: Screen, replace = false) {
    window.history[replace ? "replaceState" : "pushState"]({ offlineScreen: next }, "", `#${next.kind}`);
    setScreenState(next);
    window.scrollTo({ top: 0 });
  }
  useEffect(() => {
    window.history.replaceState({ offlineScreen: { kind: "list" } }, "", "#list");
    const back = (event: PopStateEvent) => setScreenState(event.state?.offlineScreen || { kind: "list" });
    window.addEventListener("popstate", back);
    return () => window.removeEventListener("popstate", back);
  }, []);
  const [owner, setOwner] = useState<StoredLocalOwnerContext | null>(() =>
    loadRememberedLocalOwnerContext(),
  );
  const [archives, setArchives] = useState<LocalArchiveSummary[]>([]);
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
    const result = await listVisibleLocalArchiveSummaries(
      context === undefined ? ownerContext : context,
    );
    setArchives(result.archives);
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
        const nextOwner = loadRememberedLocalOwnerContext();
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
    document.documentElement.lang = next === "zh" ? "zh-CN" : "en";
  }

  if (loading) {
    return <main className="offline-shell loading">{copy.loading}</main>;
  }

  return (
    <main className="offline-shell">
      <header className="offline-header">
        <div className="brand">
          <div className="brand-mark"><UiIcon name="sprout" size={25} /></div>
          <div>
            <div className="brand-name">{copy.mySpace}</div>
            <div className="brand-mode">{copy.offlineMode}</div>
          </div>
        </div>
        <div className="header-actions">
          {!owner ? <button className="icon-button" type="button" onClick={toggleLanguage}>{language === "zh" ? "EN" : "中文"}</button> : null}
          <button className="icon-button" type="button" aria-label={copy.settings} onClick={() => setScreen({ kind: "settings" })}><UiIcon name="menu" size={22} /></button>
        </div>
      </header>

      <div className="offline-status"><span>{copy.offlineTitle}</span><button type="button" onClick={reconnect}><UiIcon name="refresh" size={16} />{language === "zh" ? "重连" : "Reconnect"}</button></div>

      {migrationWarning ? (
        <section className="notice warning"><p>{copy.migrationWarning}</p></section>
      ) : null}

      {screen.kind === "list" ? (
        <>
          <div className="source-row">
            <button type="button" aria-pressed={false} onClick={() => setCategoryFilter("all")}>{copy.all} {archives.length}</button>
            <button type="button" onClick={() => setScreen({ kind: "cloud" })}>{copy.cloud}</button>
            <button type="button" aria-pressed="true" onClick={() => setCategoryFilter("all")}>{copy.local} {archives.length}</button>
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

          <div className="section-title">
            <h1>{copy.localProjects}</h1>
            <span className="count">{archives.length}</span>
          </div>
          {archives.length ? (
            <div className="project-list">
              {archives.filter((archive) => categoryFilter === "all" || archive.category === categoryFilter).map((archive) => (
                <button className="project-card" type="button" key={archive.id} onClick={() => openDetail(archive.id)}>
                  {archive.cover_image ? (
                    <BlobImage key={archive.cover_image.id} image={archive.cover_image} className="project-cover" alt="" />
                  ) : (
                    <span className="project-cover placeholder">🌱</span>
                  )}
                  <span>
                    <span className="project-title">{archive.title}</span>
                    <span className="project-meta">
                      {copy[archive.category]} · {archive.record_count} {copy.records} · {archive.image_count} {copy.photos}
                    </span>
                    {archive.latest_record_note ? <span className="project-note">{archive.latest_record_note}</span> : null}
                  </span>
                </button>
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

      {screen.kind === "edit-project" && detail ? (
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

      {screen.kind === "new-record" && detail ? (
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

      {screen.kind === "edit-record" && detail ? (
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

      {screen.kind === "guides" ? <>
        <div className="top-tabs"><button type="button" onClick={() => setScreen({ kind: "cloud" })}>{copy.discover}</button><button type="button" onClick={() => setScreen({ kind: "cloud" })}>{copy.experience}</button><button type="button" aria-pressed="true">{copy.guides}</button></div>
        <div className="field"><input type="search" value={guideQuery} onChange={(e) => setGuideQuery(e.target.value)} placeholder={copy.guideSearch} aria-label={copy.guideSearch} /></div>
        <div className="category-row">{(["all", "plant", "system", "insect_fish", "other"] as const).map((category) => <button type="button" key={category} aria-pressed={categoryFilter === category} onClick={() => setCategoryFilter(category)}>{copy[category]}</button>)}</div>
        <div className="guide-grid">{directory.filter((row) => (categoryFilter === "all" || row.category === categoryFilter) && `${row.label} ${(row.aliases || []).join(" ")}`.toLowerCase().includes(guideQuery.toLowerCase())).map((guide) => <button type="button" className="guide-item" key={`${guide.category}:${guide.label}`} onClick={() => setScreen({ kind: "new-project", guide })}><strong>{guide.label}</strong><small>{guide.category ? copy[guide.category] : ""}</small>{guide.description ? <p>{guide.description}</p> : null}</button>)}</div>
      </> : null}
      {screen.kind === "choose-project" ? <section className="panel"><h1>{copy.chooseProject}</h1><div className="project-list">{archives.map((archive) => <button type="button" className="secondary-button" key={archive.id} onClick={() => setScreen({ kind: "new-record", archiveId: archive.id })}>{archive.title}</button>)}</div><div className="action-row"><button type="button" className="primary-button" onClick={() => setScreen({ kind: "new-project" })}>{copy.newProject}</button></div></section> : null}
      {screen.kind === "settings" ? <section className="panel"><h1>{copy.settings}</h1><div className="property-row"><span>{copy.language}</span><SegmentedChoice label={copy.language} value={language} options={[{ value: "zh", label: "中文" }, { value: "en", label: "English" }]} onChange={toggleLanguage} /></div><p className="project-meta">{copy.offlineBody}</p><button type="button" className="secondary-button" onClick={reconnect}>{copy.reconnect}</button></section> : null}
      {screen.kind === "cloud" ? <section className="panel empty"><strong>{copy.cloudUnavailable}</strong><div className="action-row"><button type="button" className="secondary-button" onClick={goList}>{copy.mySpace}</button><button type="button" className="secondary-button" onClick={() => setScreen({ kind: "guides" })}>{copy.guides}</button></div></section> : null}
      <nav className="bottom-nav" aria-label={language === "zh" ? "主导航" : "Main navigation"}>
        <button type="button" aria-current={screen.kind === "guides" ? "page" : undefined} onClick={() => setScreen({ kind: "guides" })}><UiIcon name="home" size={23} /><span>{copy.home}</span></button>
        <button type="button" onClick={() => setScreen({ kind: "cloud" })}><UiIcon name="follow" size={23} /><span>{copy.follow}</span></button>
        <button type="button" className="quick-add" aria-label={copy.addRecord} onClick={() => setScreen(screen.kind === "detail" && detail ? { kind: "new-record", archiveId: detail.archive.id } : { kind: "choose-project" })}><UiIcon name="plus" size={30} /></button>
        <button type="button" onClick={() => setScreen({ kind: "cloud" })}><UiIcon name="store" size={23} /><span>{copy.market}</span></button>
        <button type="button" aria-current={screen.kind === "list" ? "page" : undefined} onClick={goList}><UiIcon name="user" size={23} /><span>{copy.me}</span></button>
      </nav>
      {toast ? <div className="toast" role="status">{toast}</div> : null}
    </main>
  );
}

type OfflineCopy = typeof text.zh | typeof text.en;

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
  const periods = getArchiveCycleTerminology(archive.category, language);
  async function change(work: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true); setError("");
    try { await work(); await onChanged(); } catch (e) { setError(e instanceof Error ? e.message : copy.readFailed); } finally { setBusy(false); }
  }
  return <>
    <div className="detail-heading"><button className="back-button" type="button" onClick={onBack} aria-label={copy.back}><UiIcon name="arrow-left" size={22} /></button><h1>{archive.title}</h1><span /></div>
    <div className="top-tabs"><button type="button" aria-pressed={tab === "details"} onClick={() => setTab("details")}>{copy.details}</button><button type="button" aria-pressed={tab === "properties"} onClick={() => setTab("properties")}>{copy.properties}</button></div>
    {error ? <section className="notice warning" role="alert"><p>{error}</p></section> : null}
    {tab === "properties" ? <>
      {archive.category === "plant" ? <PlantingRegionEditor key={archive.id} language={language} value={archive.planting_region} canEdit={!busy} onSave={async (region) => {
        await updateLocalArchiveFields(archive.id, { planting_region: region }, ownerContext);
        await onChanged();
      }} /> : null}
      <section className="panel property-list">
        <div className="property-row"><span>{copy.title}</span><strong>{archive.title}</strong></div>
        <div className="property-row"><span>{copy.systemName}</span><strong>{archive.system_name || archive.species_name || "—"}</strong></div>
        <div className="property-row"><span>{copy.category}</span><span>{copy[archive.category]}</span></div>
        <div className="property-row"><span>{copy.source}</span><span>{archive.source || "—"}</span></div>
        <div className="property-row"><span>{copy.note}</span><span>{archive.note || "—"}</span></div>
        <div className="property-row"><span>{copy.status}</span><SegmentedChoice label={copy.status} value={archive.status} disabled={busy} options={[{ value: "active", label: copy.ongoing }, { value: "ended", label: copy.ended }]} onChange={(status) => void change(() => updateLocalArchiveFields(archive.id, { status, ended_at: status === "ended" ? new Date().toISOString() : null }, ownerContext))} /></div>
        <div className="property-row"><span>{copy.visibility}</span><span>{copy.private}</span></div>
        <button type="button" className="secondary-button" onClick={onEdit}>{copy.edit}</button>
      </section>
      <section className="panel"><h2>{copy.period}</h2><label className="property-row"><span>{copy.enablePeriod}</span><input type="checkbox" role="switch" checked={Boolean(archive.cycle_enabled)} disabled={busy} onChange={(e) => void change(() => updateLocalArchiveFields(archive.id, { cycle_enabled: e.target.checked }, ownerContext))} /></label>
        {archive.cycle_enabled ? <div className="form">
          {(archive.cycles || []).map((cycle) => <div className="property-row" key={cycle.id}><div><strong>{cycle.display_name || periods.cycleLabel(cycle.cycle_no)}</strong><small className="project-meta">{formatDate(cycle.started_at, language)}</small></div>{cycle.status === "active" ? <button type="button" className="secondary-button" disabled={busy} onClick={() => { if (window.confirm(periods.endDialogMessage)) void change(() => endLocalArchiveCycle(archive.id, cycle.id, new Date().toISOString(), ownerContext)); }}>{periods.endAction}</button> : <span>{copy.ended}</span>}</div>)}
          <label className="field">{copy.periodDate}<input type="date" value={periodDate} onChange={(e) => setPeriodDate(e.target.value)} /></label>
          <button type="button" className="primary-button" disabled={busy || !periodDate || archive.status === "ended"} onClick={() => void change(() => createLocalArchiveCycle(archive.id, new Date(`${periodDate}T00:00:00`).toISOString(), ownerContext))}>{periods.newAction}</button>
        </div> : null}
      </section>
      <button className="danger-button" type="button" disabled={busy} onClick={onDelete}>{copy.remove}</button>
    </> : <>
      <div className="record-toolbar"><span className="project-meta">{copy[archive.category]} · {copy.local}</span><button type="button" className="primary-button" onClick={onAddRecord}>{copy.addRecord}</button></div>
      {archive.cycle_enabled ? <label className="field period-filter"><select aria-label={periods.assignLabel} value={filter} onChange={(e) => setFilter(e.target.value)}><option value="all">{copy.all}</option><option value="none">{periods.unassignedOption}</option>{(archive.cycles || []).map((cycle) => <option value={cycle.id} key={cycle.id}>{cycle.display_name || periods.cycleLabel(cycle.cycle_no)}</option>)}</select></label> : null}
      <div className="record-list">{detail.records.filter((record) => !archive.cycle_enabled || filter === "all" || (filter === "none" ? !record.cycle_id : record.cycle_id === filter)).map((record) => <article className="record-card" key={record.id}>
        <div className="record-meta">{formatDate(record.record_time, language)}</div>
        {record.images.length ? <div className={`photo-grid ${record.images.length === 1 ? "single-photo" : ""}`}>{record.images.map((image) => <button type="button" className="photo-view" key={image.id} aria-label={language === "zh" ? "查看照片" : "View photo"} onClick={() => setLightbox(image)}><BlobImage image={image} alt="" /></button>)}</div> : null}
        {record.note ? <p className="record-note">{record.note}</p> : null}
        {record.location ? <p className="project-meta">{record.location.label || `${record.location.latitude?.toFixed(4)}, ${record.location.longitude?.toFixed(4)}`}</p> : null}
        <div className="record-actions"><button className="link-button" type="button" onClick={() => onEditRecord(record.id)}>{copy.edit}</button><button className="link-button danger" type="button" onClick={() => onDeleteRecord(record.id)}>{copy.remove}</button></div>
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
  return <>
    <div className="detail-heading"><button type="button" className="back-button" onClick={onCancel} aria-label={copy.back}><UiIcon name="arrow-left" size={22} /></button><h1>{record ? copy.edit : copy.addRecord}</h1><span /></div>
    <section className="panel"><form className="form" onSubmit={submit}>
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
    </form></section>
  </>;
}

createRoot(document.getElementById("root")!).render(<App />);
