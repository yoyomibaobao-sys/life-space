"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState, type CSSProperties } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { buildLoginHref } from "@/lib/auth-return";
import {
  getQuickCapture,
  quickCaptureToFile,
  type QuickCapture,
} from "@/lib/quick-capture";
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
  const { t } = useLanguage();
  const captureId = searchParams.get("capture") || "";
  const [capture, setCapture] = useState<QuickCapture | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [cloudProjects, setCloudProjects] = useState<CloudArchiveOption[]>([]);
  const [localProjects, setLocalProjects] = useState<LocalArchiveSummary[]>([]);
  const [selectedKey, setSelectedKey] = useState("");
  const [captureLoading, setCaptureLoading] = useState(true);
  const [projectsLoading, setProjectsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let objectUrl = "";

    async function load() {
      const pending = captureId ? await getQuickCapture(captureId) : null;
      if (!pending || cancelled) {
        setCaptureLoading(false);
        setProjectsLoading(false);
        return;
      }

      setCapture(pending);
      objectUrl = URL.createObjectURL(quickCaptureToFile(pending));
      setPreviewUrl(objectUrl);
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
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [captureId, router]);

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
          {previewUrl ? (
            <img src={previewUrl} alt={t.quick_record.preview_alt} style={previewStyle} />
          ) : null}
        </div>

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
const previewStyle: CSSProperties = {
  width: 76,
  height: 76,
  borderRadius: 14,
  objectFit: "cover",
  background: "#eef3eb",
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
