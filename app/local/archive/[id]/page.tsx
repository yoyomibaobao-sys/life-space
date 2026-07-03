"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";
import ConfirmDialog from "@/components/ConfirmDialog";
import { showToast } from "@/components/Toast";
import LocalBlobImage from "@/components/local/LocalBlobImage";
import {
  createLocalRecord,
  deleteLocalArchive,
  deleteLocalRecord,
  getLocalArchiveDetail,
  type LocalArchiveDetail,
  type LocalRecordWithImages,
} from "@/lib/local-offline-db";
import {
  getArchiveCategoryIcon,
  getArchiveCategoryLabel,
} from "@/lib/archive-categories";

function formatDate(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fileListToArray(files: FileList | null) {
  return Array.from(files || []).filter((file) => file.type.startsWith("image/"));
}

export default function LocalArchiveDetailPage() {
  const params = useParams<{ id: string }>();
  const archiveId = params?.id;
  const router = useRouter();

  const [detail, setDetail] = useState<LocalArchiveDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [recordToDelete, setRecordToDelete] = useState<LocalRecordWithImages | null>(null);
  const [deleteArchiveOpen, setDeleteArchiveOpen] = useState(false);

  const selectedSizeLabel = useMemo(() => {
    const total = selectedFiles.reduce((sum, file) => sum + file.size, 0);
    if (total <= 0) return "";
    return `${(total / 1024 / 1024).toFixed(1)} MB`;
  }, [selectedFiles]);

  async function loadDetail() {
    if (!archiveId) return;

    setLoading(true);
    try {
      const nextDetail = await getLocalArchiveDetail(archiveId);
      setDetail(nextDetail);
      setError(nextDetail ? "" : "没有找到这个本地项目");
    } catch (err) {
      setError(err instanceof Error ? err.message : "读取本地项目失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadDetail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [archiveId]);

  function appendFiles(files: FileList | null) {
    const images = fileListToArray(files);
    if (images.length === 0) return;
    setSelectedFiles((current) => [...current, ...images].slice(0, 12));
  }

  async function handleAddRecord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!archiveId || saving) return;

    setSaving(true);
    try {
      await createLocalRecord({
        archive_id: archiveId,
        note,
        image_files: selectedFiles,
      });
      setNote("");
      setSelectedFiles([]);
      showToast("本地记录已保存");
      await loadDetail();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "保存本地记录失败");
    } finally {
      setSaving(false);
    }
  }

  async function confirmDeleteRecord() {
    if (!recordToDelete) return;

    try {
      await deleteLocalRecord(recordToDelete.id);
      showToast("本地记录已删除");
      setRecordToDelete(null);
      await loadDetail();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "删除本地记录失败");
    }
  }

  async function confirmDeleteArchive() {
    if (!archiveId) return;

    try {
      await deleteLocalArchive(archiveId);
      showToast("本地项目已删除");
      router.push("/local/archive");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "删除本地项目失败");
    }
  }

  if (loading) {
    return <main style={pageStyle}>正在读取本地项目...</main>;
  }

  if (error || !detail) {
    return (
      <main style={pageStyle}>
        <section style={panelStyle}>
          <p style={{ margin: 0 }}>{error || "本地项目不存在"}</p>
          <Link href="/local/archive" style={backButtonStyle}>
            返回本地项目
          </Link>
        </section>
      </main>
    );
  }

  const { archive, records } = detail;

  return (
    <main style={pageStyle}>
      <section style={headerStyle}>
        <Link href="/local/archive" style={backLinkStyle}>
          返回本地项目
        </Link>
        <div style={headerMetaStyle}>
          <span>{getArchiveCategoryIcon(archive.category)}</span>
          <span>{getArchiveCategoryLabel(archive.category)}</span>
          <span>本地离线</span>
          <span>不同步</span>
        </div>
        <h1 style={titleStyle}>{archive.title || "未命名项目"}</h1>
        <div style={systemNameStyle}>{archive.system_name || "未填写对象"}</div>
        {archive.note ? <p style={archiveNoteStyle}>{archive.note}</p> : null}
      </section>

      <section style={noticeStyle}>
        这里的项目、记录和图片只保存在 App 私有本地缓存中。不会默认写入系统相册，不会上传云端，也不会进入发现页。
      </section>

      <section style={panelStyle}>
        <h2 style={sectionTitleStyle}>添加本地记录</h2>
        <form onSubmit={handleAddRecord} style={recordFormStyle}>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="记录今天的观察、浇水、修剪、采收或其他变化"
            rows={4}
            style={textareaStyle}
          />

          <div style={imageActionRowStyle}>
            <label style={imagePickerStyle}>
              拍照
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(event) => {
                  appendFiles(event.target.files);
                  event.target.value = "";
                }}
                style={{ display: "none" }}
              />
            </label>
            <label style={imagePickerStyle}>
              从相册选择
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={(event) => {
                  appendFiles(event.target.files);
                  event.target.value = "";
                }}
                style={{ display: "none" }}
              />
            </label>
            {selectedFiles.length > 0 ? (
              <button
                type="button"
                onClick={() => setSelectedFiles([])}
                style={clearFilesButtonStyle}
              >
                清空图片
              </button>
            ) : null}
          </div>

          {selectedFiles.length > 0 ? (
            <div style={selectedFilesStyle}>
              已选择 {selectedFiles.length} 张图片
              {selectedSizeLabel ? ` · 原始大小 ${selectedSizeLabel}` : ""}
              <br />
              保存时会生成 App 内部缓存副本，默认不写入系统相册。
            </div>
          ) : null}

          <div style={submitRowStyle}>
            <button type="submit" disabled={saving} style={submitButtonStyle}>
              {saving ? "保存中..." : "保存本地记录"}
            </button>
          </div>
        </form>
      </section>

      <section style={recordsSectionStyle}>
        <div style={recordsHeaderStyle}>
          <h2 style={sectionTitleStyle}>本地记录</h2>
          <span style={countTextStyle}>{records.length} 条</span>
        </div>

        {records.length === 0 ? (
          <div style={emptyRecordsStyle}>还没有本地记录。</div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {records.map((record) => (
              <article key={record.id} style={recordCardStyle}>
                <div style={recordMetaStyle}>
                  <span>{formatDate(record.record_time)}</span>
                  <button
                    type="button"
                    onClick={() => setRecordToDelete(record)}
                    style={deleteRecordButtonStyle}
                  >
                    删除
                  </button>
                </div>

                {record.images.length > 0 ? (
                  <div style={imageGridStyle}>
                    {record.images.map((image) => (
                      <LocalBlobImage
                        key={image.id}
                        blob={image.blob}
                        style={recordImageStyle}
                      />
                    ))}
                  </div>
                ) : null}

                {record.note ? (
                  <p style={recordNoteStyle}>{record.note}</p>
                ) : (
                  <p style={recordEmptyNoteStyle}>这条记录只有图片。</p>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      <section style={dangerPanelStyle}>
        <div>
          <h2 style={dangerTitleStyle}>本地项目操作</h2>
          <p style={dangerTextStyle}>
            删除后会清理 App 内部 IndexedDB 中的项目、记录和图片缓存，不会影响系统相册中的原图。
          </p>
        </div>
        <button
          type="button"
          onClick={() => setDeleteArchiveOpen(true)}
          style={deleteArchiveButtonStyle}
        >
          删除本地项目
        </button>
      </section>

      <ConfirmDialog
        open={Boolean(recordToDelete)}
        title="删除本地记录"
        message="确定要删除这条本地记录吗？这会删除 App 内部缓存的记录图片，不会影响系统相册中的原图。"
        confirmText="确认删除"
        danger
        onClose={() => setRecordToDelete(null)}
        onConfirm={confirmDeleteRecord}
      />

      <ConfirmDialog
        open={deleteArchiveOpen}
        title="删除本地项目"
        message="确定要删除这个本地项目吗？项目下的本地记录和 App 内图片缓存会一起删除，不会删除系统相册里的原图。"
        confirmText="确认删除项目"
        danger
        onClose={() => setDeleteArchiveOpen(false)}
        onConfirm={confirmDeleteArchive}
      />
    </main>
  );
}

const pageStyle = {
  minHeight: "calc(100vh - 70px)",
  padding: "22px 16px 48px",
  background: "#fbfcf7",
  color: "#263326",
} satisfies CSSProperties;

const headerStyle = {
  maxWidth: 900,
  margin: "0 auto 12px",
} satisfies CSSProperties;

const backLinkStyle = {
  display: "inline-flex",
  color: "#617258",
  fontSize: 13,
  textDecoration: "none",
  marginBottom: 10,
} satisfies CSSProperties;

const headerMetaStyle = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  color: "#78906e",
  fontSize: 13,
  fontWeight: 700,
} satisfies CSSProperties;

const titleStyle = {
  margin: "6px 0 4px",
  fontSize: 27,
  lineHeight: 1.22,
} satisfies CSSProperties;

const systemNameStyle = {
  color: "#5e6f58",
  fontSize: 15,
} satisfies CSSProperties;

const archiveNoteStyle = {
  margin: "10px 0 0",
  color: "#4f5d4a",
  fontSize: 14,
  lineHeight: 1.7,
  whiteSpace: "pre-line",
} satisfies CSSProperties;

const noticeStyle = {
  maxWidth: 900,
  margin: "0 auto 12px",
  padding: 12,
  borderRadius: 14,
  border: "1px solid #dfe9d8",
  background: "#f6faf3",
  color: "#5f7058",
  fontSize: 13,
  lineHeight: 1.7,
} satisfies CSSProperties;

const panelStyle = {
  maxWidth: 900,
  margin: "0 auto 12px",
  padding: 16,
  borderRadius: 18,
  border: "1px solid #e2eadc",
  background: "#fff",
  boxShadow: "0 8px 22px rgba(42, 66, 34, 0.05)",
} satisfies CSSProperties;

const sectionTitleStyle = {
  margin: 0,
  fontSize: 18,
  lineHeight: 1.3,
} satisfies CSSProperties;

const recordFormStyle = {
  marginTop: 12,
  display: "grid",
  gap: 12,
} satisfies CSSProperties;

const textareaStyle = {
  width: "100%",
  minHeight: 104,
  border: "1px solid #dbe5d4",
  borderRadius: 14,
  padding: 12,
  color: "#263326",
  background: "#fff",
  resize: "vertical",
  lineHeight: 1.7,
  outline: "none",
} satisfies CSSProperties;

const imageActionRowStyle = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  alignItems: "center",
} satisfies CSSProperties;

const imagePickerStyle = {
  height: 38,
  padding: "0 14px",
  borderRadius: 999,
  border: "1px solid #cfe0c8",
  background: "#f4fbf1",
  color: "#2f5d2b",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 14,
  fontWeight: 700,
  cursor: "pointer",
} satisfies CSSProperties;

const clearFilesButtonStyle = {
  height: 38,
  padding: "0 14px",
  borderRadius: 999,
  border: "1px solid #e4d7d7",
  background: "#fff7f7",
  color: "#a44848",
  fontSize: 14,
} satisfies CSSProperties;

const selectedFilesStyle = {
  padding: 10,
  borderRadius: 12,
  background: "#f7faf3",
  color: "#5f6d58",
  fontSize: 13,
  lineHeight: 1.7,
} satisfies CSSProperties;

const submitRowStyle = {
  display: "flex",
  justifyContent: "flex-end",
} satisfies CSSProperties;

const submitButtonStyle = {
  height: 42,
  padding: "0 18px",
  borderRadius: 999,
  border: "1px solid #b7d2b0",
  background: "#3f7d3d",
  color: "#fff",
  fontWeight: 700,
  fontSize: 14,
} satisfies CSSProperties;

const recordsSectionStyle = {
  ...panelStyle,
  padding: 14,
} satisfies CSSProperties;

const recordsHeaderStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  marginBottom: 12,
} satisfies CSSProperties;

const countTextStyle = {
  color: "#7c8975",
  fontSize: 13,
} satisfies CSSProperties;

const emptyRecordsStyle = {
  padding: 18,
  borderRadius: 14,
  background: "#f8fbf4",
  color: "#697663",
  fontSize: 14,
} satisfies CSSProperties;

const recordCardStyle = {
  border: "1px solid #e5ecdf",
  borderRadius: 16,
  background: "#fff",
  padding: 12,
} satisfies CSSProperties;

const recordMetaStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  color: "#7c8975",
  fontSize: 12,
  marginBottom: 10,
} satisfies CSSProperties;

const deleteRecordButtonStyle = {
  border: "none",
  background: "transparent",
  color: "#a44848",
  fontSize: 13,
  padding: "4px 0",
} satisfies CSSProperties;

const imageGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(92px, 1fr))",
  gap: 8,
  marginBottom: 10,
} satisfies CSSProperties;

const recordImageStyle = {
  width: "100%",
  aspectRatio: "1 / 1",
  objectFit: "cover",
  borderRadius: 12,
  background: "#eef4e8",
} satisfies CSSProperties;

const recordNoteStyle = {
  margin: 0,
  color: "#334033",
  fontSize: 15,
  lineHeight: 1.75,
  whiteSpace: "pre-line",
} satisfies CSSProperties;

const recordEmptyNoteStyle = {
  margin: 0,
  color: "#8a9584",
  fontSize: 14,
} satisfies CSSProperties;

const dangerPanelStyle = {
  ...panelStyle,
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 14,
  flexWrap: "wrap",
} satisfies CSSProperties;

const dangerTitleStyle = {
  margin: 0,
  fontSize: 16,
  color: "#4a3030",
} satisfies CSSProperties;

const dangerTextStyle = {
  margin: "4px 0 0",
  color: "#7f6767",
  fontSize: 13,
  lineHeight: 1.6,
} satisfies CSSProperties;

const deleteArchiveButtonStyle = {
  height: 38,
  padding: "0 14px",
  borderRadius: 999,
  border: "1px solid #dca0a0",
  background: "#fff7f7",
  color: "#a44848",
  fontWeight: 700,
  fontSize: 14,
} satisfies CSSProperties;

const backButtonStyle = {
  marginTop: 14,
  height: 38,
  padding: "0 14px",
  borderRadius: 999,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  background: "#eef6e8",
  color: "#2f5f2d",
  textDecoration: "none",
  fontSize: 14,
  fontWeight: 700,
} satisfies CSSProperties;
