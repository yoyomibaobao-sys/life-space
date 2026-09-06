import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import { createRoot } from "react-dom/client";
import {
  assertLocalOfflineAvailable,
  createLocalArchive,
  createLocalRecord,
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

declare const __LIFESPACE_CLOUD_ORIGIN__: string;

const CLOUD_ORIGIN = __LIFESPACE_CLOUD_ORIGIN__;
const MAX_PHOTOS = 10;

type Language = "zh" | "en";
type Screen =
  | { kind: "list" }
  | { kind: "new-project" }
  | { kind: "detail"; archiveId: string }
  | { kind: "edit-project"; archiveId: string }
  | { kind: "new-record"; archiveId: string }
  | { kind: "edit-record"; archiveId: string; recordId: string };

const text = {
  zh: {
    brand: "有时·耕作",
    offlineMode: "本地离线模式",
    offlineTitle: "云端暂时不可用，本地记录仍可正常使用",
    offlineBody: "项目、记录和照片只保存在本机。重新联网后不会自动上传，也不会覆盖云端资料。",
    migrationWarning: "旧版本地资料暂未完成迁移。现有资料不会被删除，请稍后重新打开 App 再试。",
    reconnect: "重新连接云端",
    newProject: "新建本地项目",
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
    systemName: "品种／对象／方法名称",
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
    system: "农法设施",
    insect_fish: "虫鱼生态",
    other: "其他",
  },
  en: {
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
    if (value === "en") return "en";
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
  const date = value ? new Date(value) : new Date();
  const adjusted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return adjusted.toISOString().slice(0, 16);
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
  const [screen, setScreen] = useState<Screen>({ kind: "list" });
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
    void loadDetail(screen.archiveId);
  }, [screen, loadDetail]);

  function goList() {
    setScreen({ kind: "list" });
    setDetail(null);
    void loadList();
  }

  function openDetail(archiveId: string) {
    setScreen({ kind: "detail", archiveId });
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
          <div className="brand-mark">有</div>
          <div>
            <div className="brand-name">{copy.brand}</div>
            <div className="brand-mode">{copy.offlineMode}</div>
          </div>
        </div>
        <button className="icon-button" type="button" onClick={toggleLanguage}>
          {language === "zh" ? "EN" : "中"}
        </button>
      </header>

      <section className="notice">
        <strong>{copy.offlineTitle}</strong>
        <p>{copy.offlineBody}</p>
      </section>

      {migrationWarning ? (
        <section className="notice warning"><p>{copy.migrationWarning}</p></section>
      ) : null}

      {screen.kind === "list" ? (
        <>
          <div className="toolbar">
            <button className="primary-button" type="button" onClick={() => setScreen({ kind: "new-project" })}>
              {copy.newProject}
            </button>
            <button className="secondary-button" type="button" onClick={reconnect}>
              {copy.reconnect}
            </button>
          </div>

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
              {archives.map((archive) => (
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
          archiveId={detail.archive.id}
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
          archiveId={detail.archive.id}
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

      {toast ? <div className="toast" role="status">{toast}</div> : null}
    </main>
  );
}

type OfflineCopy = typeof text.zh | typeof text.en;

function ProjectForm({
  copy,
  owner,
  archive,
  onCancel,
  onSaved,
}: {
  language: Language;
  copy: OfflineCopy;
  owner: StoredLocalOwnerContext | null;
  archive?: LocalArchive;
  onCancel: () => void;
  onSaved: (archive: LocalArchive) => void | Promise<void>;
}) {
  const [title, setTitle] = useState(archive?.title || "");
  const [category, setCategory] = useState<ArchiveCategory>(archive?.category || "plant");
  const [systemName, setSystemName] = useState(archive?.system_name || archive?.species_name || "");
  const [source, setSource] = useState(archive?.source || "");
  const [note, setNote] = useState(archive?.note || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim() || !systemName.trim()) {
      setError(copy.requiredProject);
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
            source,
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
          source,
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
          <div className="field"><label>{copy.systemName}</label><input value={systemName} onChange={(event) => setSystemName(event.target.value)} maxLength={160} /></div>
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

function ProjectDetail({
  detail,
  language,
  copy,
  onBack,
  onEdit,
  onAddRecord,
  onEditRecord,
  onDelete,
  onDeleteRecord,
}: {
  detail: LocalArchiveDetail;
  language: Language;
  copy: OfflineCopy;
  onBack: () => void;
  onEdit: () => void;
  onAddRecord: () => void;
  onEditRecord: (recordId: string) => void;
  onDelete: () => void;
  onDeleteRecord: (recordId: string) => void;
}) {
  return (
    <>
      <div className="back-row"><button className="back-button" type="button" onClick={onBack}>← {copy.back}</button></div>
      <section className="panel">
        <div className="project-meta">{copy[detail.archive.category]} · {copy.offlineMode}</div>
        <h1>{detail.archive.title}</h1>
        <div className="project-meta">{detail.archive.system_name || detail.archive.species_name}</div>
        {detail.archive.note ? <p className="detail-note">{detail.archive.note}</p> : null}
        <div className="action-row">
          <button className="primary-button" type="button" onClick={onAddRecord}>{copy.addRecord}</button>
          <button className="secondary-button" type="button" onClick={onEdit}>{copy.edit}</button>
          <button className="danger-button" type="button" onClick={onDelete}>{copy.remove}</button>
        </div>
      </section>
      <div className="section-title"><h2>{copy.localProjects === "本地项目" ? "记录" : "Records"}</h2><span className="count">{detail.records.length}</span></div>
      {detail.records.length ? (
        <div className="record-list">
          {detail.records.map((record) => (
            <article className="record-card" key={record.id}>
              <div className="record-meta">{formatDate(record.record_time, language)}</div>
              {record.note ? <p className="record-note">{record.note}</p> : null}
              {record.images.length ? (
                <div className="photo-grid">
                  {record.images.map((image) => <BlobImage key={image.id} image={image} alt="" />)}
                </div>
              ) : null}
              <div className="record-actions">
                <button className="link-button" type="button" onClick={() => onEditRecord(record.id)}>{copy.edit}</button>
                <button className="link-button danger" type="button" onClick={() => onDeleteRecord(record.id)}>{copy.remove}</button>
              </div>
            </article>
          ))}
        </div>
      ) : <section className="panel empty">{copy.noRecords}</section>}
    </>
  );
}

function RecordForm({
  copy,
  archiveId,
  record,
  onCancel,
  onSaved,
}: {
  copy: OfflineCopy;
  archiveId: string;
  record?: LocalRecordWithImages;
  onCancel: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [note, setNote] = useState(record?.note || "");
  const [recordTime, setRecordTime] = useState(toDateTimeLocal(record?.record_time));
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!record && !note.trim() && files.length === 0) {
      setError(copy.requiredRecord);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const isoTime = new Date(recordTime).toISOString();
      if (record) {
        await updateLocalRecordFields(record.id, { note, record_time: isoTime });
      } else {
        await createLocalRecord({
          archive_id: archiveId,
          note,
          record_time: isoTime,
          image_files: files,
        });
      }
      await onSaved();
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
        <div className="section-title"><h1>{record ? copy.edit : copy.addRecord}</h1></div>
        <form className="form" onSubmit={submit}>
          <div className="field"><label>{copy.recordTime}</label><input type="datetime-local" value={recordTime} onChange={(event) => setRecordTime(event.target.value)} required /></div>
          <div className="field"><label>{copy.recordNote}</label><textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={8000} /></div>
          {!record ? (
            <div className="field">
              <label>{copy.selectPhotos}</label>
              <input type="file" accept="image/*" multiple onChange={(event) => setFiles(Array.from(event.target.files || []).filter((file) => file.type.startsWith("image/")).slice(0, MAX_PHOTOS))} />
              <small>{copy.photoHint}{files.length ? ` (${files.length})` : ""}</small>
            </div>
          ) : null}
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

createRoot(document.getElementById("root")!).render(<App />);
