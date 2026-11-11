"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import ArchiveProjectDetailView from "@/components/archive-ui/ArchiveProjectDetailView";
import ArchiveExperienceCards from "@/components/archive-detail/ArchiveExperienceCards";
import ArchiveOwnerSettingsFields from "@/components/archive-detail/ArchiveOwnerSettingsFields";
import ArchiveCycleSettings from "@/components/archive-detail/ArchiveCycleSettings";
import ArchiveAddRecordSection from "@/components/archive-detail/ArchiveAddRecordSection";
import ArchiveRecordCard from "@/components/archive-detail/ArchiveRecordCard";
import ArchiveProjectDetailStatus, { ArchiveProjectDetailLoading } from "@/components/archive-ui/ArchiveProjectDetailStatus";
import AppConfirmDialog from "@/components/mobile/AppConfirmDialog";
import {
  archiveProjectDetailNoticeLinkStyle,
  archiveProjectDetailReadOnlyNoticeStyle,
} from "@/components/archive-ui/ArchiveProjectDetailView";
import {
  type ArchiveProjectDetailTabId,
} from "@/components/archive-ui/archiveProjectDetailLayout";
import InternalLink from "@/components/navigation/InternalLink";
import type { ArchiveCycle, ArchiveDetailArchive, LightboxImage, RecordItem } from "@/lib/archive-detail-types";
import type { ArchiveCategory } from "@/lib/archive-categories";
import { getArchiveCategoryLabel } from "@/lib/archive-categories";
import type { MediaItem } from "@/lib/domain-types";
import { loadCloudArchiveDetail } from "@/lib/cloud-archive-detail";
import { requestCloudTrash } from "@/lib/cloud-trash";
import { supabase } from "@/lib/supabase";
import { clearCloudPickerResume, isAndroidRecordGallery, peekCloudPickerResume, retainCloudPublicationReconciliation } from "@/lib/android-record-gallery";
import { useLanguage } from "@/lib/i18n/useLanguage";
import { getBehaviorRestrictionErrorText } from "@/lib/behavior-restriction-errors";
import { getDurationDays } from "@/lib/follow-utils";
import { canCreateMembershipContent, normalizeCloudTrialOfferRpcResult, normalizeMembershipRpcResult } from "@/lib/membership";
import type { PlantingRegion } from "@/lib/planting-region";
import { getArchiveCycleTerminology } from "@/lib/archive-cycle-terminology";
import { getSystemNameCandidates } from "@/lib/system-name-candidates";
import { resolveSystemNameSelection } from "@/lib/system-name-candidates";
import { uploadCloudRecordImages } from "@/lib/cloud-record-media";
import { isAndroidOnline } from "@/lib/android-connectivity";
import { getAndroidAuthSnapshot, revalidateAndroidAuthSession, useAndroidAuthState } from "@/lib/android-auth-state";
import { formatDateTime, getDayNumber } from "@/lib/archive-detail-utils";
import { saveCloudArchiveToLocal } from "@/lib/cloud-to-local-save";

type Detail = NonNullable<Awaited<ReturnType<typeof loadCloudArchiveDetail>>>;

// Android's live owner controller shares the website timeline loader and the
// single detail presentation. Offline cache is rendered by DeviceOwnedProjectDetail.
export default function CloudArchiveDetailController({ archiveId, userId, onBack, onCacheChanged, initialFiles, initialCapturedAt, initialNote, onRecordCreated, onRecordCancelled, addRecordRequest = 0, showFloatingAdd = true, suspended = false }: {
  archiveId: string;
  userId: string;
  onBack: () => void;
  onCacheChanged: () => Promise<void>;
  initialFiles?: File[];
  initialCapturedAt?: (string | null)[];
  initialNote?: string;
  onRecordCreated?: () => void;
  onRecordCancelled?: () => void;
  addRecordRequest?: number;
  showFloatingAdd?: boolean;
  suspended?: boolean;
}) {
  const { language, t } = useLanguage();
  const copy = t.archive;
  const recordCopy = t.record;
  const [detail, setDetail] = useState<Detail | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "not-found" | "error">("loading");
  const [error, setError] = useState("");
  const [tab, setTab] = useState<ArchiveProjectDetailTabId>("records");
  const [addOpen, setAddOpen] = useState(initialFiles !== undefined);
  const [busy, setBusy] = useState(false);
  const [canWrite, setCanWrite] = useState(false);
  const [canCopy, setCanCopy] = useState(false);
  const [copyConfirmOpen, setCopyConfirmOpen] = useState(false);
  const [savedCopyId, setSavedCopyId] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Awaited<ReturnType<typeof getSystemNameCandidates>>>([]);
  const [lightbox, setLightbox] = useState<{ images: LightboxImage[]; index: number; record: RecordItem } | null>(null);
  const [experienceCardCount, setExperienceCardCount] = useState(0);
  const [trashConfirmOpen, setTrashConfirmOpen] = useState(false);
  const lastAddRecordRequest = useRef(addRecordRequest);
  const [membershipState, setMembershipState] = useState<"checking" | "allowed" | "unknown" | "denied">("checking");
  const editorAuthorized = useRef(false);
  const writeProof = useRef<{ authority: ReturnType<typeof getAndroidAuthSnapshot> | null; epoch: number; allowed: boolean }>({ authority: null, epoch: -1, allowed: false });


  useLayoutEffect(() => {
    // Only a committed, open, authorized composer may survive an unknown result.
    if (!addOpen || status !== "ready" || !detail || tab !== "records") editorAuthorized.current = false;
    else if (canWrite) editorAuthorized.current = true;
  }, [addOpen, status, detail, tab, canWrite]);

  const auth = useAndroidAuthState();
  const mounted = useRef(true);
  const access = useRef({ archiveId, userId, suspended, authority: auth, epoch: 0 });
  if (access.current.archiveId !== archiveId || access.current.userId !== userId ||
      access.current.suspended !== suspended || access.current.authority !== auth) {
    access.current = { archiveId, userId, suspended, authority: auth, epoch: access.current.epoch + 1 };
  }
  const latestRead = useRef(0);
  const rejectedOwner = useRef(false);
  const [identityRevoked, setIdentityRevoked] = useState(false);
  const [authInterruption, setAuthInterruption] = useState(0);
  const [authPaused, setAuthPaused] = useState(false);
  const pausedAuthority = useRef<ReturnType<typeof getAndroidAuthSnapshot> | null>(null);
  const authDenied = auth.explicitSignedOut || auth.status === "signed-out" ||
    auth.verification === "invalid-session" || auth.verification === "no-session" ||
    (auth.status === "signed-in" && auth.sessionUserId !== userId) ||
    (auth.status === "offline-owner-read" && Boolean(auth.offlineReadOwner?.userId) &&
      auth.offlineReadOwner?.userId !== userId);
  if (authDenied) rejectedOwner.current = true;
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event !== "SIGNED_OUT" && (!session?.user?.id || session.user.id === userId)) return;
      // SDK SIGNED_OUT may precede a successful server revalidation. Pause now;
      // only confirmed identity rejection is terminal.
      latestRead.current += 1;
      access.current = { ...access.current, epoch: access.current.epoch + 1 };
      writeProof.current = { authority: null, epoch: -1, allowed: false };
      const current = getAndroidAuthSnapshot();
      const terminal = (session?.user?.id && session.user.id !== userId) ||
        current.explicitSignedOut || current.status === "signed-out" ||
        current.verification === "invalid-session" || current.verification === "no-session";
      if (terminal) {
        rejectedOwner.current = true;
        setIdentityRevoked(true);
      } else {
        pausedAuthority.current = current;
        setAuthPaused(true);
        setAuthInterruption((value) => value + 1);
      }
      setCanWrite(false);
      setMembershipState("checking");
    });
    return () => subscription.unsubscribe();
  }, [userId]);
  useEffect(() => {
    if (authInterruption) void revalidateAndroidAuthSession().catch(() => undefined);
  }, [authInterruption]);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; latestRead.current += 1; };
  }, []);
  const hasVerifiedOwner = useCallback(() => {
    const current = getAndroidAuthSnapshot();
    return mounted.current && !rejectedOwner.current && !access.current.suspended &&
      access.current.archiveId === archiveId && access.current.userId === userId &&
      current.status === "signed-in" && current.verification === "verified" && !current.explicitSignedOut &&
      current !== pausedAuthority.current && current.sessionUserId === userId;
  }, [archiveId, userId]);
  const hasLiveAccess = useCallback(() => hasVerifiedOwner() && isAndroidOnline(), [hasVerifiedOwner]);
  const hasPublicationAccess = useCallback(() => {
    const proof = writeProof.current;
    return hasLiveAccess() && proof.allowed && proof.epoch === access.current.epoch &&
      proof.authority === getAndroidAuthSnapshot();
  }, [hasLiveAccess]);

  const reload = useCallback(async () => {
    if (!hasLiveAccess()) return;
    const authority = getAndroidAuthSnapshot();
    const epoch = access.current.epoch;
    const request = ++latestRead.current;
    // A retained editor is memory only; every new check invalidates write permission.
    writeProof.current = { authority: null, epoch, allowed: false };
    setCanWrite(false);
    setMembershipState("checking");
    const accept = () => hasLiveAccess() && authority === getAndroidAuthSnapshot() &&
      access.current.epoch === epoch && latestRead.current === request;
    try {
      const [next, membership, offerResult] = await Promise.all([
        loadCloudArchiveDetail(archiveId, userId),
        Promise.resolve(supabase.rpc("get_my_membership")).catch(() => ({ data: null, error: true })),
        supabase.rpc("get_my_cloud_trial_offer"),
      ]);
      if (!accept()) return;
      if (!next || next.archive.id !== archiveId ||
          next.archive.user_id !== userId || next.archive.trashed_at) {
        rejectedOwner.current = true;
        editorAuthorized.current = false;
        setDetail(null);
        setAddOpen(false);
        setStatus("not-found");
        return;
      }
      setDetail(next);
      const entitlement = membership.error ? null : normalizeMembershipRpcResult(membership.data);
      const offer = offerResult.error ? null : normalizeCloudTrialOfferRpcResult(offerResult.data);
      const known = typeof entitlement?.can_create_content === "boolean";
      const allowed = known && canCreateMembershipContent(entitlement);
      setMembershipState(known ? (allowed ? "allowed" : "denied") : "unknown");
      setCanWrite(allowed);
      writeProof.current = { authority, epoch, allowed };
      if (allowed) {
        pausedAuthority.current = null;
        setAuthPaused(false);
      }
      if (known && !allowed) {
        editorAuthorized.current = false;
        setAddOpen(false);
      }
      setCanCopy(Boolean(entitlement && entitlement.can_create_content === false &&
        (entitlement.plan === "trial"
          ? offer?.lifecycle_status === "handling_period"
          : (entitlement.plan === "basic" || entitlement.plan === "large" || entitlement.plan === "seller") &&
            entitlement.status !== "active")));
      setStatus("ready");
      // Preserve the existing one-use restoration contract, after fresh Owner
      // and project authorization. A suspended or superseded read cannot reopen.
      if (isAndroidRecordGallery() && peekCloudPickerResume(userId, archiveId)?.phase !== "reconcile-only" && peekCloudPickerResume(userId, archiveId)) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!accept()) return;
        if (user?.id === userId) {
          setTab("records");
          setAddOpen(true);
        }
      }
      if (!accept()) return;
      const list = await getSystemNameCandidates({
        category: next.archive.category || "plant",
        currentValue: next.archive.system_name || next.archive.species_name_snapshot || "",
        mode: "cloud", supabase, userId,
        includeUserArchives: true, includeOtherCategories: true, limit: null,
      }).catch(() => []);
      if (accept()) setCandidates(list);
    } catch (cause) {
      if (!accept()) return;
      const failure = cause as { status?: unknown; code?: unknown } | null;
      if (Number(failure?.status) === 401 || Number(failure?.status) === 403 || failure?.code === "42501") {
        rejectedOwner.current = true;
        editorAuthorized.current = false;
        setDetail(null);
        setAddOpen(false);
        setIdentityRevoked(true);
      }
      throw cause;
    }
  }, [archiveId, userId, hasLiveAccess]);

  const revalidateRecordPublication = useCallback(async () => {
    await reload();
    const proof = writeProof.current;
    return hasLiveAccess() && proof.allowed && proof.epoch === access.current.epoch &&
      proof.authority === getAndroidAuthSnapshot();
  }, [reload, hasLiveAccess]);

  useEffect(() => {
    if (suspended || !hasLiveAccess()) return;
    let active = true;
    void reload().catch((cause) => {
      if (!active) return;
      setError(cause instanceof Error ? cause.message : String(cause));
      if (!editorAuthorized.current) setStatus("error");
    });
    return () => { active = false; };
  }, [reload, suspended, auth, hasLiveAccess]);

  useEffect(() => {
    const refresh = () => { void reload().catch((cause) => setError(String(cause))); };
    window.addEventListener("lifespace-cloud-sync-complete", refresh);
    return () => window.removeEventListener("lifespace-cloud-sync-complete", refresh);
  }, [reload]);

  useEffect(() => {
    if (!hasLiveAccess() || !addRecordRequest || addRecordRequest === lastAddRecordRequest.current) return;
    lastAddRecordRequest.current = addRecordRequest;
    setTab("records");
    setAddOpen(true);
  }, [addRecordRequest, suspended, auth, hasLiveAccess]);

  async function change(work: () => Promise<unknown>, requiresCloudWrite = true) {
    if (!hasLiveAccess() || busy || (requiresCloudWrite && !hasPublicationAccess())) return;
    setBusy(true);
    setError("");
    try { await work(); if (!hasLiveAccess()) return; await reload(); if (hasLiveAccess()) await onCacheChanged(); }
    catch (cause) {
      setError(getBehaviorRestrictionErrorText(cause, language) || (cause instanceof Error ? cause.message : String(cause)));
      void reload().catch(() => undefined);
    }
    finally { setBusy(false); }
  }

  async function patchArchive(patch: Record<string, unknown>) {
    await change(async () => {
      const result = await supabase.from("archives").update(patch).eq("id", archiveId).eq("user_id", userId).select("id").single();
      if (result.error) throw result.error;
    });
  }

  async function updateCycle(cycle: ArchiveCycle, patch: Record<string, unknown>) {
    await change(async () => {
      const result = await supabase.from("archive_cycles").update(patch).eq("id", cycle.id).eq("archive_id", archiveId).select("id").single();
      if (result.error) throw result.error;
    });
  }

  async function saveToDevice() {
    if (!hasLiveAccess() || busy || !canCopy) return;
    setCopyConfirmOpen(false);
    setBusy(true);
    setError("");
    try {
      const result = await saveCloudArchiveToLocal({
        cloudArchiveId: archiveId, ownerContext: { userId }, mode: "copy",
      });
      setSavedCopyId(result.localArchiveId);
      await onCacheChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally { setBusy(false); }
  }

  if (identityRevoked || authDenied || rejectedOwner.current) {
    return <ArchiveProjectDetailStatus status="forbidden"
      title={language === "zh" ? "身份尚未核验" : "Identity not verified"}
      message={language === "zh" ? "请重新验证当前账号后再查看项目。" : "Verify the current account before viewing the project."}
      backLabel={t.nav.back} onBack={onBack} />;
  }
  const quarantined = suspended || authPaused || !hasLiveAccess() ||
    writeProof.current.authority !== auth || writeProof.current.epoch !== access.current.epoch ||
    (editorAuthorized.current && !hasPublicationAccess());

  if (status === "loading") return <ArchiveProjectDetailLoading>{copy.loading}</ArchiveProjectDetailLoading>;
  if (status !== "ready" || !detail) return <ArchiveProjectDetailStatus
    status={status === "not-found" ? "not-found" : "error"}
    title={status === "not-found" ? (language === "zh" ? "找不到项目" : "Project not found") : (language === "zh" ? "项目读取失败" : "Could not load project")}
    message={error || (language === "zh" ? "请联网重试。" : "Connect and retry.")}
    backLabel={t.nav.back} retryLabel={language === "zh" ? "重试" : "Retry"}
    onBack={onBack} onRetry={() => void reload().catch((cause) => setError(String(cause)))}
  />;

  const { archive, records, cycles, subTags, groupTags, depths } = detail;
  const category = (archive.category || "other") as ArchiveCategory;
  const subTag = subTags.find((item) => item.id === archive.sub_tag_id);
  const groupTag = groupTags.find((item) => item.id === archive.group_tag_id);
  const term = getArchiveCycleTerminology(archive.category, language);
  const activeCycles = cycles.filter((cycle) => cycle.status === "active");
  const encyclopediaHref = category === "plant" && archive.species_id
    ? `/plant/${encodeURIComponent(archive.species_id)}`
    : null;

  return <><fieldset disabled={quarantined} hidden={quarantined}
    aria-hidden={quarantined || undefined}
    data-cloud-owner-quarantined={quarantined ? "true" : "false"}
    style={{ margin: 0, padding: 0, border: 0, minWidth: 0, display: quarantined ? "none" : undefined }}
    onClickCapture={(event) => { if (!hasVerifiedOwner()) { event.preventDefault(); event.stopPropagation(); } }}
    onInputCapture={(event) => { if (!hasVerifiedOwner()) { event.preventDefault(); event.stopPropagation(); } }}
    onKeyDownCapture={(event) => { if (!hasVerifiedOwner()) { event.preventDefault(); event.stopPropagation(); } }}
    onSubmitCapture={(event) => { if (!hasVerifiedOwner()) { event.preventDefault(); event.stopPropagation(); } }}>
    {error ? <p role="alert" style={{ color: "#a33622", padding: "8px 16px" }}>{error}</p> : null}
    {savedCopyId ? <p role="status" style={{ padding: "8px 16px" }}>
      {language === "zh" ? "已保存独立本机副本。" : "Independent local copy saved."}{" "}
      <InternalLink href={`/local/archive/${savedCopyId}`}>
        {language === "zh" ? "打开本机项目" : "Open local project"}
      </InternalLink>
    </p> : null}
    {peekCloudPickerResume(userId, archiveId)?.phase === "reconcile-only" ? (
      <p role="status" style={{ margin: "8px 16px", color: "#805d26" }}>
        {language === "zh"
          ? "此前云记录发布结果尚待核账，已关闭编辑但不会自动重复发布。"
          : "A previous cloud publication still needs reconciliation; no automatic repost will occur."}
      </p>
    ) : null}
    <ArchiveProjectDetailView
      archive={archive} records={records} cycles={cycles} cycleEnabled={Boolean(archive.cycle_enabled)}
      mode="owner" capabilities={{ canWriteArchive: canWrite, canAddRecord: canWrite, retainRecordComposer: addOpen && editorAuthorized.current && membershipState !== "denied", canManageCycle: canWrite && Boolean(archive.cycle_enabled), canSaveToLocal: canCopy, canDeleteArchive: true, canToggleVisibility: canWrite }}
      isMobileViewport language={language} copy={copy} username={detail.username || ""}
      archiveDisplayName={archive.system_name || archive.species_name_snapshot || ""}
      archiveCategoryLabel={getArchiveCategoryLabel(category, language)}
      archiveSubcategoryLabel={depths[category] >= 2 ? subTag?.name : null}
      archiveGroupLabel={depths[category] >= 3 ? groupTag?.name : null}
      encyclopediaHref={encyclopediaHref}
      systemNameCandidates={candidates} systemNameMode="candidate" latestUpdate={archive.last_record_time || records[0]?.record_time || null}
      recordCount={Number(archive.record_count || records.length)} durationDays={getDurationDays(archive.created_at || null, archive.status === "ended" ? archive.ended_at || null : null)}
      viewCount={Number(archive.view_count || 0)}
      statusBadge={archive.help_status === "open" ? recordCopy.help_in_progress : archive.help_status === "resolved" ? recordCopy.resolved : null}
      statusNotice={!canWrite ? (
        <div style={archiveProjectDetailReadOnlyNoticeStyle}>
          <span>{membershipState === "checking" || membershipState === "unknown"
            ? (language === "zh" ? "权益暂未核验，编辑内容已保留，暂不能发布。" : "Entitlement is unverified. Your editor is retained; publishing is paused.")
            : copy.cloud_read_only_notice}</span>
          <InternalLink href="/membership" style={archiveProjectDetailNoticeLinkStyle}>
            {copy.view_cloud_membership}
          </InternalLink>
        </div>
      ) : null}
      activeTab={tab} onTabChange={setTab} experienceTabLabel={
        language === "en"
          ? `${copy.experience_cards} (${experienceCardCount})`
          : `${copy.experience_cards}（${experienceCardCount}）`
      }
      experienceContent={<ArchiveExperienceCards archiveId={archiveId} isOwner canCreate={canWrite} onCountChange={setExperienceCardCount} />}
      onToggleArchiveVisibility={() => void change(async () => {
        const result = await supabase.rpc(archive.is_public ? "make_my_archive_private" : "make_my_archive_public", { p_archive_id: archiveId });
        if (result.error || result.data !== true) throw result.error || new Error(recordCopy.visibility_update_failed);
      })}
      onToggleArchiveStatus={() => void change(async () => {
        if (archive.status !== "ended" && !window.confirm(copy.end_project_message)) return;
        const result = await supabase.rpc(archive.status === "ended" ? "restore_archive_active" : "mark_archive_ended", { p_archive_id: archiveId });
        if (result.error) throw result.error;
      })}
      onSaveToLocal={() => { if (canCopy && !busy && isAndroidOnline()) setCopyConfirmOpen(true); }}
      saveToLocalLabel={savedCopyId
        ? (language === "zh" ? "已保存到本机 · 打开" : "Saved locally · Open")
        : copy.save_to_device}
      saveToLocalDisabled={busy}
      onDeleteArchive={() => setTrashConfirmOpen(true)}
      onSaveTitle={(value) => patchArchive({ title: value })}
      onSaveCategory={(value) => patchArchive({ category: value, sub_tag_id: null, group_tag_id: null })}
      onSaveSystemName={async (selection) => {
        const resolved = resolveSystemNameSelection(candidates, selection, category);
        await patchArchive({ category: resolved.category, species_id: resolved.plantId,
          species_name_snapshot: resolved.category === "plant" ? resolved.name : null,
          system_name: resolved.category === "plant" ? null : resolved.name,
          ...(resolved.category !== category ? { sub_tag_id: null, group_tag_id: null } : {}) });
      }}
      onSaveSource={(value) => patchArchive({ source: value || null })}
      onSaveNote={(value) => patchArchive({ note: value || null })}
      onSaveArchiveSummary={(value) => patchArchive({ archive_summary: value || null })}
      onSavePlantingRegion={(region: PlantingRegion) => patchArchive({ planting_region: region })}
      storageLabel={copy.cloud_project} storageTone="cloud"
      headerFallbackHref="/archive" headerBackLabel={t.nav.my_space} onHeaderBack={onBack}
      mobileOwnerSettings={<>
        {canCopy ? (
          <button type="button" className="secondary-button"
            disabled={busy || !isAndroidOnline()}
            onClick={() => setCopyConfirmOpen(true)}>
            {savedCopyId
              ? (language === "zh" ? "已保存到本机 · 打开" : "Saved locally · Open")
              : copy.save_to_device}
          </button>
        ) : null}
        <ArchiveOwnerSettingsFields category={category} subTagId={typeof archive.sub_tag_id === "string" ? archive.sub_tag_id : null}
          groupTagId={typeof archive.group_tag_id === "string" ? archive.group_tag_id : null}
          subTags={subTags} groupTags={groupTags} maxDepth={depths[category]}
          ended={archive.status === "ended"} isPublic={archive.is_public} canWrite={canWrite} busy={busy}
          onChangeSubcategory={(id) => void patchArchive({ sub_tag_id: id || null, group_tag_id: null })}
          onChangeGroup={(id) => void patchArchive({ group_tag_id: id || null })}
          onToggleEnded={() => void change(async () => {
            if (archive.status !== "ended" && !window.confirm(copy.end_project_message)) return;
            const result = await supabase.rpc(archive.status === "ended" ? "restore_archive_active" : "mark_archive_ended", { p_archive_id: archiveId });
            if (result.error) throw result.error;
          })}
          onTogglePublic={() => void change(async () => {
            const result = await supabase.rpc(archive.is_public ? "make_my_archive_private" : "make_my_archive_public", { p_archive_id: archiveId });
            if (result.error || result.data !== true) throw result.error || new Error(recordCopy.visibility_update_failed);
          })} />
        <ArchiveCycleSettings enabled={Boolean(archive.cycle_enabled)} busy={busy}
          onSave={({ enabled }) => patchArchive({ cycle_enabled: enabled, next_cycle_name: null })} />
      </>}
      recordComposer={<ArchiveAddRecordSection archiveId={archiveId} archiveCategory={archive.category}
        archiveIsPublic={archive.is_public} activeCycles={activeCycles} mobileMode open={addOpen}
        initialFiles={initialFiles} initialCapturedAt={initialCapturedAt} initialNote={initialNote}
        publicationAccess={{ ownerId: userId, scope: access.current, state: quarantined ? "checking" : membershipState,
          isCurrent: hasPublicationAccess, revalidate: revalidateRecordPublication }}
        onClose={() => {
          if (!hasVerifiedOwner()) return;
          const phase = peekCloudPickerResume(userId, archiveId)?.phase;
          if (phase === "submitting-unknown" && !window.confirm(language === "zh"
            ? "发布结果尚未确认。仅放弃编辑显示，仍会保留防重复提交的核账标记。确定关闭？"
            : "Publication is unconfirmed. The reconciliation guard will remain after closing. Close editor?")) return;
          if (phase === "submitting-unknown") retainCloudPublicationReconciliation(userId, archiveId);
          else if (phase !== "reconcile-only") clearCloudPickerResume(userId, archiveId);
          setAddOpen(false);
          onRecordCancelled?.();
        }} onRecordCreated={async () => { if (!hasLiveAccess()) return; await reload(); if (!hasLiveAccess()) return; setAddOpen(false); onRecordCreated?.(); await onCacheChanged(); }} />}
      onFloatingAdd={showFloatingAdd ? () => setAddOpen(true) : undefined} floatingAddLabel={language === "zh" ? "添加记录" : "Add record"}
      emptyRecordsText={copy.no_records_owner}
      onStartCycle={(startedAt) => change(async () => {
        const result = await supabase.rpc("create_archive_cycle", { p_archive_id: archiveId, p_started_at: startedAt });
        if (result.error) throw result.error;
      })}
      onEndCycle={(cycle, endedAt) => updateCycle(cycle, { status: "ended", ended_at: endedAt })}
      onUpdateCycleDates={(cycle, dates) => updateCycle(cycle, { started_at: dates.startedAt, ended_at: dates.endedAt })}
      onRenameCycle={(cycle, name) => updateCycle(cycle, { display_name: name.trim() || null })}
      onDeleteCycle={async (cycle) => {
        let ok = false;
        await change(async () => {
          const result = await supabase.rpc("move_archive_cycle_to_trash", { p_cycle_id: cycle.id });
          if (result.error) throw result.error;
          ok = Boolean((Array.isArray(result.data) ? result.data[0] : result.data)?.ok);
          if (!ok) throw new Error(recordCopy.delete_failed);
        });
        return ok;
      }}
      renderRecord={(item, index) => <ArchiveRecordCard key={item.id} archive={archive as ArchiveDetailArchive}
        item={item} index={index} mode="owner" cloudWritable={canWrite} startTime={records.at(-1)?.record_time || archive.created_at}
        isHighlighted={false} sameTagLinks={[]} currentUserId={userId} isMobileViewport
        canOpenMediaLightbox
        onOpenLightbox={(media: MediaItem[], imageIndex: number, record: RecordItem) => {
          const images = media.map((m) => ({ id: m.id, recordId: record.id, url: m.display_url || m.url || "", alt: m.original_filename || "" })).filter((m) => m.url);
          if (images.length) setLightbox({ images, index: imageIndex, record });
        }}
        onDeleteMedia={async (_recordId, mediaId) => {
          if (!hasLiveAccess() || !await requestCloudTrash("media", mediaId)) throw new Error(recordCopy.delete_failed);
          await reload();
        }}
        onAddMedia={(recordId, files) => change(async () => { await uploadCloudRecordImages({ recordId, files, userId }); })}
        onReplaceMedia={(recordId, mediaId, files) => change(async () => {
          const uploaded = await uploadCloudRecordImages({ recordId, files: files.slice(0, 1), userId });
          if (uploaded.length && !await requestCloudTrash("media", mediaId)) throw new Error(recordCopy.delete_failed);
        })}
        onVisibilityChange={(recordId, visibility) => change(async () => {
          const result = visibility === "private"
            ? await supabase.rpc("make_my_record_private", { p_record_id: recordId })
            : await supabase.from("records").update({ visibility }).eq("id", recordId).eq("archive_id", archiveId);
          if (result.error) throw result.error;
        })}
        onSetHelpStatus={(recordId, status) => change(async () => {
          const target = records.find((record) => record.id === recordId);
          const publish = status === "help" && (!archive.is_public || target?.visibility !== "public");
          if (publish && !window.confirm(recordCopy.help_public_confirm)) return;
          if (publish && !archive.is_public) {
            const madePublic = await supabase.rpc("make_my_archive_public", { p_archive_id: archiveId });
            if (madePublic.error || madePublic.data !== true) throw madePublic.error || new Error(recordCopy.publish_shell_failed);
          }
          const result = await supabase.from("records")
            .update({ status_tag: status, ...(publish ? { visibility: "public" } : {}) })
            .eq("id", recordId).eq("archive_id", archiveId);
          if (result.error) throw result.error;
          const updated = records.map((record) => record.id === recordId ? { ...record, status_tag: status } : record);
          const aggregate = updated.some((record) => record.status_tag === "help") ? "open"
            : updated.some((record) => record.status_tag === "resolved") ? "resolved" : "none";
          const now = new Date().toISOString();
          const archiveResult = await supabase.from("archives").update({
            help_status: aggregate, help_updated_at: now,
            ...(aggregate === "open" ? { help_opened_at: archive.help_opened_at || now, help_resolved_at: null }
              : aggregate === "resolved" ? { help_resolved_at: now }
                : { help_opened_at: null, help_resolved_at: null }),
          }).eq("id", archiveId).eq("user_id", userId);
          if (archiveResult.error) throw archiveResult.error;
        })}
        onRemoveTag={(recordId, tag) => void change(async () => {
          const result = await supabase.from("record_tags").update({ is_active: false })
            .eq("record_id", recordId).eq("tag", tag).eq("tag_type", "behavior");
          if (result.error) throw result.error;
        })} onAddTag={async (recordId, tag) => { await change(async () => {
          const result = await supabase.from("record_tags").insert([{ record_id: recordId, tag, tag_type: "behavior", source: "user", is_active: true }]);
          if (result.error) throw result.error;
        }); }}
        onRecordUpdated={() => void reload()} onNoteSaved={() => void reload()}
        onRecordDeleted={() => void reload()} cycleOptions={cycles.map((c) => ({ id: c.id, label: c.display_name || term.cycleLabel(c.cycle_no) }))}
        onCycleChange={(recordId, cycleId) => change(async () => {
          const result = await supabase.from("records").update({ cycle_id: cycleId }).eq("id", recordId).eq("archive_id", archiveId);
          if (result.error) throw result.error;
        })}
      />}
      lightbox={lightbox ? { ...lightbox, metaText: formatDateTime(lightbox.record.record_time),
        dayText: `${recordCopy.day_prefix} ${getDayNumber(records.at(-1)?.record_time || archive.created_at || lightbox.record.record_time, lightbox.record.record_time)}${recordCopy.day_suffix ? ` ${recordCopy.day_suffix}` : ""}`,
        note: lightbox.record.note || "",
        onDeleteCurrentImage: async (image) => {
          if (!hasLiveAccess() || !image.id || !await requestCloudTrash("media", image.id)) throw new Error(recordCopy.delete_failed);
          const remaining = lightbox.images.filter((item) => item.id !== image.id);
          setLightbox((current) => current ? {
            ...current,
            images: remaining,
            index: Math.min(current.index, Math.max(0, remaining.length - 1)),
          } : null);
          await reload();
          return remaining.length;
        },
        onChange: (index) => setLightbox((current) => current ? { ...current, index } : null),
        onClose: () => setLightbox(null) } : null}
    />
    <AppConfirmDialog
      open={copyConfirmOpen}
      title={language === "zh" ? "保存到本机" : "Save to device"}
      message={language === "zh"
        ? "云端原项目保持不变；本机将新增独立副本。若有待上传的记录或图片，请先处理。"
        : "The cloud original stays unchanged. Resolve pending records or photos before creating a separate local copy."}
      cancelLabel={language === "zh" ? "取消" : "Cancel"}
      confirmLabel={language === "zh" ? "确认保存" : "Save"}
      onCancel={() => setCopyConfirmOpen(false)}
      onConfirm={() => void saveToDevice()}
    />
    <AppConfirmDialog
      open={trashConfirmOpen}
      title={language === "zh" ? "移入回收站" : "Move to trash"}
      message={copy.project_trash_message}
      cancelLabel={language === "zh" ? "取消" : "Cancel"}
      confirmLabel={language === "zh" ? "移入回收站" : "Move to trash"}
      destructive
      onCancel={() => setTrashConfirmOpen(false)}
      onConfirm={() => {
        setTrashConfirmOpen(false);
        void change(async () => {
          if (!await requestCloudTrash("archives", archiveId)) throw new Error(copy.save_retry);
          onBack();
        }, false);
      }}
    />
  </fieldset>{quarantined && !suspended ? <p role="status">
    {language === "zh" ? "账号与项目权限正在重新核验，编辑内容已暂停。" : "Revalidating account and project access. The editor is paused."}
    <button type="button" onClick={() => { void revalidateAndroidAuthSession().then(() => revalidateRecordPublication()).catch(() => undefined); }}>
      {language === "zh" ? "重新验证" : "Verify again"}
    </button>
  </p> : null}</>;
}
