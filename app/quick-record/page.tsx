"use client";

import Link from "next/link";
import {
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { showToast } from "@/components/Toast";
import { supabase } from "@/lib/supabase";
import { buildLoginHref } from "@/lib/auth-return";
import {
  appendQuickCaptureFiles,
  getQuickCapture,
  quickCaptureToFiles,
  type QuickCapture,
} from "@/lib/quick-capture";
import { MAX_RECORD_PHOTOS_PER_ADD } from "@/lib/record-photo-batches";
import {
  listVisibleLocalArchiveSummaries,
  type LocalArchiveSummary,
  type LocalArchiveOwnerContext,
} from "@/lib/local-offline-db";
import { useLanguage } from "@/lib/i18n/useLanguage";

type CloudArchiveOption = {
  id: string;
  title: string;
  created_at: string | null;
  last_record_time: string | null;
};

type ProjectChoice = {
  key: string;
  type: "cloud" | "local";
  id: string;
  title: string;
  updatedAt: string;
};

export default function QuickRecordPage() {
  return (
    <Suspense fallback={<main style={pageStyle} />}>
      <QuickRecordContent />
    </Suspense>
  );
}

function QuickRecordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { language, t } = useLanguage();
  const captureId = searchParams.get("capture") || "";
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const [capture, setCapture] = useState<QuickCapture | null>(null);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [cloudProjects, setCloudProjects] = useState<CloudArchiveOption[]>([]);
  const [localProjects, setLocalProjects] = useState<LocalArchiveSummary[]>([]);
  const [selectedKey, setSelectedKey] = useState("");
  const [captureLoading, setCaptureLoading] = useState(true);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [addingPhotos, setAddingPhotos] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const pending = captureId ? await getQuickCapture(captureId) : null;
      if (!pending || cancelled) {
        setCaptureLoading(false);
        setProjectsLoading(false);
        return;
      }

      setCapture(pending);
      setCaptureLoading(false);

      const {
        data: { user },
      } = await supabase.auth.getUser();
      const ownerContext: LocalArchiveOwnerContext | null = user
        ? { userId: user.id, email: user.email || null }
        : null;
      const [localResult, cloudResult] = await Promise.all([
        listVisibleLocalArchiveSummaries(ownerContext),
        user
          ? supabase
              .from("archives")
              .select("id, title, created_at, last_record_time")
              .eq("user_id", user.id)
              .is("trashed_at", null)
              .order("last_record_time", { ascending: false, nullsFirst: false })
              .order("created_at", { ascending: false })
          : Promise.resolve({ data: [] as CloudArchiveOption[] }),
      ]);

      if (cancelled) return;
      if (!user && localResult.archives.length === 0) {
        router.replace(
          buildLoginHref(`/quick-record?capture=${encodeURIComponent(captureId)}`)
        );
        return;
      }
      setLocalProjects(localResult.archives);
      setCloudProjects((cloudResult.data || []) as CloudArchiveOption[]);
      setProjectsLoading(false);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [captureId, router]);

  useEffect(() => {
    if (!capture) {
      setPreviewUrls([]);
      return;
    }

    const urls = quickCaptureToFiles(capture).map((file) =>
      URL.createObjectURL(file),
    );
    setPreviewUrls(urls);

    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [capture]);

  const choices = useMemo<ProjectChoice[]>(() => {
    const cloud = cloudProjects.map((project) => ({
      key: `cloud:${project.id}`,
      type: "cloud" as const,
      id: project.id,
      title: project.title,
      updatedAt: project.last_record_time || project.created_at || "",
    }));
    const local = localProjects.map((project) => ({
      key: `local:${project.id}`,
      type: "local" as const,
      id: project.id,
      title: project.title,
      updatedAt: project.latest_record_time || project.updated_at || "",
    }));
    return [...cloud, ...local].sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt)
    );
  }, [cloudProjects, localProjects]);

  const effectiveSelectedKey = selectedKey || choices[0]?.key || "";
  const photoCount = previewUrls.length;

  async function appendPhotos(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!capture || files.length === 0 || addingPhotos) return;

    setAddingPhotos(true);
    try {
      const result = await appendQuickCaptureFiles(
        capture.id,
        files,
        MAX_RECORD_PHOTOS_PER_ADD,
      );
      setCapture(result.capture);
      if (result.rejectedCount > 0) {
        showToast(t.quick_record.photo_limit_trimmed);
      }
    } catch {
      showToast(t.quick_record.capture_failed);
    } finally {
      setAddingPhotos(false);
    }
  }

  function continueToRecord() {
    if (!capture || !effectiveSelectedKey) return;
    const selected = choices.find((choice) => choice.key === effectiveSelectedKey);
    if (!selected) return;
    const base = selected.type === "cloud" ? "/archive" : "/local/archive";
    router.push(`${base}/${selected.id}?quickCapture=${capture.id}#add-record`);
  }

  if (captureLoading) {
    return <main style={pageStyle}>{t.quick_record.processing_photo}</main>;
  }

  if (!capture) {
    return (
      <main style={pageStyle}>
        <section style={panelStyle}>
          <h1 style={titleStyle}>{t.quick_record.missing_title}</h1>
          <p style={mutedStyle}>{t.quick_record.missing_hint}</p>
          <Link href="/discover" style={secondaryLinkStyle}>
            {t.quick_record.back_home}
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main style={pageStyle}>
      <section style={panelStyle}>
        <div style={headingStyle}>
          <div>
            <div style={eyebrowStyle}>{t.quick_record.eyebrow}</div>
            <h1 style={titleStyle}>{t.quick_record.title}</h1>
          </div>
          <div style={photoCountStyle}>
            {language === "en"
              ? `${photoCount} photos · up to ${MAX_RECORD_PHOTOS_PER_ADD} each time`
              : `共 ${photoCount} 张 · 每次最多 ${MAX_RECORD_PHOTOS_PER_ADD} 张`}
          </div>
        </div>

        {previewUrls.length > 0 ? (
          <div style={previewGridStyle}>
            {previewUrls.map((url, index) => (
              <img
                key={`${url}-${index}`}
                src={url}
                alt={`${t.quick_record.preview_alt} ${index + 1}`}
                style={previewStyle}
              />
            ))}
          </div>
        ) : null}

        <div style={photoActionsStyle}>
          <button
            type="button"
            onClick={() => cameraInputRef.current?.click()}
            disabled={addingPhotos}
            style={photoActionButtonStyle}
          >
            {t.quick_record.continue_take_photo}
          </button>
          <button
            type="button"
            onClick={() => galleryInputRef.current?.click()}
            disabled={addingPhotos}
            style={photoActionButtonStyle}
          >
            {t.quick_record.add_from_album}
          </button>
        </div>
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={appendPhotos}
          style={{ display: "none" }}
        />
        <input
          ref={galleryInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={appendPhotos}
          style={{ display: "none" }}
        />

        {projectsLoading ? (
          <div role="status" aria-live="polite" style={projectLoadingStyle}>
            {t.quick_record.loading_projects}
          </div>
        ) : choices.length > 0 ? (
          <>
            <label style={labelStyle}>
              {t.quick_record.choose_project}
              <select
                value={effectiveSelectedKey}
                onChange={(event) => setSelectedKey(event.target.value)}
                style={selectStyle}
              >
                {choices.map((choice) => (
                  <option key={choice.key} value={choice.key}>
                    {choice.title} · {choice.type === "cloud" ? t.quick_record.cloud : t.quick_record.local}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" onClick={continueToRecord} style={primaryButtonStyle}>
              {t.quick_record.continue_editing}
            </button>
            <div style={newProjectActionsStyle}>
              <Link
                href={`/archive/new?quickCapture=${encodeURIComponent(capture.id)}`}
                style={secondaryLinkStyle}
              >
                {t.quick_record.create_cloud_project}
              </Link>
              <Link
                href={`/local/archive/new?quickCapture=${encodeURIComponent(capture.id)}`}
                style={secondaryLinkStyle}
              >
                {t.quick_record.create_local_project}
              </Link>
            </div>
          </>
        ) : (
          <div style={emptyStyle}>
            <p style={mutedStyle}>{t.quick_record.no_project}</p>
            <Link
              href={`/archive/new?quickCapture=${capture.id}`}
              style={primaryLinkStyle}
            >
              {t.quick_record.create_cloud_project}
            </Link>
            <Link
              href={`/local/archive/new?quickCapture=${capture.id}`}
              style={secondaryLinkStyle}
            >
              {t.quick_record.create_local_project}
            </Link>
          </div>
        )}
      </section>
    </main>
  );
}

const pageStyle: CSSProperties = {
  maxWidth: 560,
  margin: "0 auto",
  padding: "18px 14px 90px",
};
const panelStyle: CSSProperties = {
  padding: 16,
  border: "1px solid #e2e9df",
  borderRadius: 18,
  background: "#fff",
};
const headingStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 14,
  marginBottom: 18,
};
const eyebrowStyle: CSSProperties = { color: "#758470", fontSize: 12 };
const titleStyle: CSSProperties = { margin: "3px 0 0", color: "#253725", fontSize: 22 };
const photoCountStyle: CSSProperties = {
  flexShrink: 0,
  color: "#63755f",
  fontSize: 13,
  fontWeight: 750,
};
const previewGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
  gap: 7,
  marginBottom: 10,
};
const previewStyle: CSSProperties = {
  width: "100%",
  aspectRatio: "1 / 1",
  borderRadius: 14,
  objectFit: "cover",
  background: "#eef3eb",
};
const photoActionsStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 8,
  marginBottom: 18,
};
const photoActionButtonStyle: CSSProperties = {
  minHeight: 40,
  padding: "8px 10px",
  border: "1px solid #dbe5d7",
  borderRadius: 12,
  background: "#f8fbf6",
  color: "#4f6d4d",
  fontSize: 13,
  fontWeight: 750,
};
const labelStyle: CSSProperties = { display: "grid", gap: 7, color: "#586855", fontSize: 13 };
const selectStyle: CSSProperties = {
  width: "100%",
  height: 44,
  padding: "0 11px",
  border: "1px solid #dce5d8",
  borderRadius: 12,
  background: "#fff",
  color: "#263626",
  fontSize: 15,
};
const primaryButtonStyle: CSSProperties = {
  width: "100%",
  minHeight: 44,
  marginTop: 14,
  border: 0,
  borderRadius: 12,
  background: "#557e52",
  color: "#fff",
  fontSize: 15,
  fontWeight: 800,
};
const emptyStyle: CSSProperties = { display: "grid", gap: 10 };
const newProjectActionsStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 8,
  marginTop: 9,
};
const mutedStyle: CSSProperties = { color: "#71806e", fontSize: 14, lineHeight: 1.65 };
const projectLoadingStyle: CSSProperties = {
  minHeight: 96,
  display: "grid",
  placeItems: "center",
  border: "1px dashed #dce6d8",
  borderRadius: 14,
  background: "#f8fbf6",
  color: "#657661",
  fontSize: 14,
};
const primaryLinkStyle: CSSProperties = {
  display: "inline-flex",
  justifyContent: "center",
  padding: "11px 14px",
  borderRadius: 12,
  background: "#557e52",
  color: "#fff",
  textDecoration: "none",
  fontWeight: 800,
};
const secondaryLinkStyle: CSSProperties = {
  display: "inline-flex",
  justifyContent: "center",
  padding: "10px 14px",
  border: "1px solid #dbe5d7",
  borderRadius: 12,
  color: "#4f6d4d",
  textDecoration: "none",
  fontWeight: 750,
};
