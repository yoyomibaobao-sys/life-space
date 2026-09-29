"use client";

import { useEffect, useState } from "react";
import ArchiveProjectDetailStatus, { ArchiveProjectDetailLoading } from "@/components/archive-ui/ArchiveProjectDetailStatus";
import ReadonlyPublicProjectDetail from "@/components/archive-ui/ReadonlyPublicProjectDetail";
import { resolveCloudArchiveRoute } from "@/lib/cloud-archive-detail";

type Route = Awaited<ReturnType<typeof resolveCloudArchiveRoute>>;
type ResolvedRoute = { key: string; route: Route; status: "ready" | "not-found" | "error" };

export default function PublicCloudArchiveRouteController({
  archiveId, userId, online, language, onBack, onOwned,
}: {
  archiveId: string;
  userId: string | null;
  online: boolean;
  language: "zh" | "en";
  onBack: () => void;
  onOwned: () => void;
}) {
  const [resolved, setResolved] = useState<ResolvedRoute | null>(null);
  const [attempt, setAttempt] = useState(0);
  const key = `${archiveId}:${attempt}`;
  const route = resolved?.key === key ? resolved.route : null;
  const status = resolved?.key === key ? resolved.status : "loading";

  useEffect(() => {
    if (!online) return;
    let active = true;
    void resolveCloudArchiveRoute(archiveId).then((result) => {
      if (!active) return;
      setResolved({ key, route: result, status: result ? "ready" : "not-found" });
    }).catch(() => { if (active) setResolved({ key, route: null, status: "error" }); });
    return () => { active = false; };
  }, [archiveId, online, key]);

  useEffect(() => {
    if (online && status === "ready" && route?.ownerId === userId) onOwned();
  }, [online, status, route, userId, onOwned]);

  if (!online) return <ArchiveProjectDetailStatus status="error"
    title={language === "zh" ? "需要联网" : "Connection required"}
    message={language === "zh" ? "公开项目详情需要联网。" : "Public project details require a connection."}
    backLabel={language === "zh" ? "返回" : "Back"} onBack={onBack} />;
  if (status === "loading" || (status === "ready" && route?.ownerId === userId)) {
    return <ArchiveProjectDetailLoading>{language === "zh" ? "正在读取项目…" : "Loading project…"}</ArchiveProjectDetailLoading>;
  }
  if (status !== "ready" || !route?.publicSummary) return <ArchiveProjectDetailStatus
    status={status === "error" ? "error" : "not-found"}
    title={language === "zh" ? "无法打开公开项目" : "Public project unavailable"}
    message={language === "zh" ? "项目不存在、未公开，或暂时无法读取。" : "The project is unavailable or private."}
    backLabel={language === "zh" ? "返回" : "Back"}
    retryLabel={language === "zh" ? "重试" : "Retry"}
    onBack={onBack} onRetry={() => setAttempt((value) => value + 1)} />;
  return <ReadonlyPublicProjectDetail item={route.publicSummary} language={language} onBack={onBack} />;
}
