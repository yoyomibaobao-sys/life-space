"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useSupportIdentity } from "@/components/support/useSupportIdentity";
import AdminSupportAudit from "@/components/support/AdminSupportAudit";
import MobilePageHeaderView from "@/components/mobile/MobilePageHeaderView";
import { formatPreciseDateTime } from "@/lib/date-time";
import { useLanguage } from "@/lib/i18n/useLanguage";
import { getSupportCopy } from "@/lib/i18n/support-workflow";
import { safeSupportUrl } from "@/lib/support-links";
import { getFeedbackCategoryLabel, getReportCategoryLabel, getSupportResolutionLabel, getSupportStatusLabel, normalizeSupportRows, type AdminSupportSubmissionRow, type AdminSupportReportGroupRow, type AdminSupportReportDetailRow, type SupportRpcResult, type SupportSubmissionKind } from "@/lib/support-submissions";
import { supabase } from "@/lib/supabase";
import styles from "@/components/support/support.module.css";

type RecordModerationSnapshot = { isHidden: boolean; version: number };
type RecordModerationEventRow = {
  next_is_hidden: boolean;
  next_version: number | string;
};
type RecordModerationRpcResult = {
  ok?: boolean;
  error?: string;
  is_hidden?: boolean;
  version?: number | string;
};

export default function AdminSupportPage({ onBack }: { onBack?: () => void } = {}) {
  const { language } = useLanguage();
  const copy = getSupportCopy(language);
  const { userId, error, retry } = useSupportIdentity();
  return <>
    {onBack ? <MobilePageHeaderView className="mobile-app-grid-only" title={copy.admin} titleText={copy.admin} showBack onBack={onBack} ariaLabel={copy.back} /> : null}
    <main className={styles.page}>
    {!onBack ? <Link href="/profile" className="mobile-app-desktop-only">{copy.back}</Link> : null}
    <h1 className="mobile-app-desktop-only">{copy.admin}</h1>
    {error ? <p role="alert">{copy.loadError} <button className={styles.secondary} onClick={retry}>{copy.retry}</button></p>
      : userId === undefined ? <p role="status">{copy.loading}</p>
      : !userId ? <p>{copy.denied}</p> : <AdminGate key={userId} userId={userId} />}
    </main>
  </>;
}

function AdminGate({ userId }: { userId: string }) {
  const { language } = useLanguage();
  const copy = getSupportCopy(language);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [failed, setFailed] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const { data, error } = await supabase.rpc("is_app_admin", { p_user_id: userId });
        if (!active) return;
        if (error) setFailed(true); else setAllowed(data === true);
      } catch { if (active) setFailed(true); }
    })();
    return () => { active = false; };
  }, [userId, revision]);
  if (failed) return <p role="alert">{copy.loadError} <button className={styles.secondary} onClick={() => { setFailed(false); setRevision(value => value + 1); }}>{copy.retry}</button></p>;
  if (allowed === null) return <p role="status">{copy.loading}</p>;
  if (!allowed) return <p>{copy.denied}</p>;
  return <SupportQueue />;
}

function SupportQueue() {
  const { language } = useLanguage();
  const copy = getSupportCopy(language);
  const [kind, setKind] = useState<SupportSubmissionKind>("report");
  const [status, setStatus] = useState("open");
  const [showAudit, setShowAudit] = useState(false);
  return <>
    <p className={styles.note}>{copy.adminHint}</p>
    <div className={styles.actions}>
      <button className={kind === "report" ? styles.button : styles.secondary} onClick={() => { setKind("report"); setStatus("open"); }}>{copy.reportQueue}</button>
      <button className={kind === "feedback" ? styles.button : styles.secondary} onClick={() => { setKind("feedback"); setStatus("submitted"); }}>{copy.feedbackQueue}</button>
      <label className={styles.field}>
        <select aria-label={copy.all} value={status} onChange={e => setStatus(e.target.value)}>
          {kind === "report" ? <>
            <option value="open">{language === "zh" ? "全部待处理" : "All open reports"}</option>
            <option value="resolved">{getSupportStatusLabel("resolved", language)}</option>
          </> : <>
            <option value="">{copy.all}</option>
            {["submitted", "needs_info", "resolved"].map(value => <option key={value} value={value}>{getSupportStatusLabel(value, language)}</option>)}
          </>}
        </select>
      </label>
    </div>
    {kind === "report"
      ? <ReportGroups key={`reports-${status}`} status={status} />
      : <QueueItems key={`${kind}-${status}`} kind={kind} status={status} />}
    <button className={styles.secondary} onClick={() => setShowAudit(value => !value)}>
      {language === "zh" ? "管理员操作记录" : "Administrator action history"}
    </button>
    {showAudit && <AdminSupportAudit />}
  </>;
}

function ReportGroups({ status }: { status: string }) {
  const { language } = useLanguage();
  const copy = getSupportCopy(language);
  const [groups, setGroups] = useState<AdminSupportReportGroupRow[]>([]);
  const [page, setPage] = useState(0);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [message, setMessage] = useState("");
  const pageSize = 40;
  useEffect(() => {
    let active = true;
    const abort = new AbortController();
    setLoading(true);
    setFailed(false);
    void (async () => {
      try {
        const { data, error } = await supabase.rpc("admin_list_support_report_groups", {
          p_status: status, p_limit: pageSize, p_offset: page * pageSize,
        }).abortSignal(abort.signal);
        if (!active) return;
        if (error) { setFailed(true); return; }
        setGroups(normalizeSupportRows<AdminSupportReportGroupRow>(data));
      } catch { if (active) setFailed(true); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; abort.abort(); };
  }, [status, page, revision]);
  return <section>
    <p className={styles.note}>{language === "zh"
      ? "按举报对象归并后分页，每页最多40个审核事件。原始举报逐条保留，详情支持独立分页。"
      : "Grouped by reported object, 40 review events per page. Original reports remain separate with paginated details."}</p>
    <button className={styles.secondary} disabled={loading} onClick={() => setRevision(value => value + 1)}>{copy.retry}</button>
    {message && <p role="status" className={styles.message}>{message}</p>}
    {loading ? <p role="status">{copy.loading}</p>
      : failed ? <p role="alert" className={styles.error}>{copy.loadError}</p>
      : <>
        {!groups.length && <p>{copy.empty}</p>}
        {groups.map(group => <ReportGroupCard
          key={group.target_type + ":" + group.target_id + ":" + status + ":" + revision}
          group={group} status={status}
          onUpdated={() => { setMessage(copy.updated); setRevision(value => value + 1); }}
        />)}
        <div className={styles.actions}>
          <button className={styles.secondary} disabled={page === 0} onClick={() => setPage(value => value - 1)}>
            {language === "zh" ? "上一页" : "Previous"}
          </button>
          <span>{language === "zh" ? "审核事件第" : "Event page "}{page + 1}{language === "zh" ? "页" : ""}</span>
          <button className={styles.secondary} disabled={groups.length < pageSize} onClick={() => setPage(value => value + 1)}>
            {language === "zh" ? "下一页" : "Next"}
          </button>
        </div>
      </>}
  </section>;
}

function ReportGroupCard({ group, status, onUpdated }: {
  group: AdminSupportReportGroupRow; status: string; onUpdated: () => void;
}) {
  const { language } = useLanguage();
  const copy = getSupportCopy(language);
  const [expanded, setExpanded] = useState(false);
  const [details, setDetails] = useState<AdminSupportReportDetailRow[]>([]);
  const [detailPage, setDetailPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [detailError, setDetailError] = useState(false);
  const [note, setNote] = useState("");
  const [resolution, setResolution] = useState("");
  const [saving, setSaving] = useState(false);
  const [actionFailed, setActionFailed] = useState(false);
  const [moderation, setModeration] = useState<RecordModerationSnapshot | null>(null);
  const [moderationLoadFailed, setModerationLoadFailed] = useState(false);
  const [moderationReasonCode, setModerationReasonCode] = useState("");
  const moderationRequestRef = useRef<{ key: string; requestId: string } | null>(null);
  const inFlight = useRef(false);
  const pageSize = 50;
  const total = Number(details[0]?.total_count ?? group.report_count);
  const href = safeSupportUrl(group.target_url);
  // The server validates this separately from the historical representative_id.
  // Only this ID may be attached to a record moderation decision.
  const canTakeReportAction =
    status === "open" &&
    group.target_type === "record" &&
    !!group.actionable_submission_id &&
    !!moderation &&
    !moderationLoadFailed &&
    !detailError &&
    !loading &&
    details.length > 0 &&
    !!moderationReasonCode;
  useEffect(() => {
    if (!expanded) return;
    let active = true;
    const abort = new AbortController();
    setLoading(true);
    setDetailError(false);
    setModeration(null);
    setModerationLoadFailed(false);
    void (async () => {
      try {
        const detailRequest = supabase.rpc("admin_get_support_report_group_details", {
          p_target_type: group.target_type, p_target_id: group.target_id,
          p_status: status, p_limit: pageSize, p_offset: detailPage * pageSize,
        }).abortSignal(abort.signal);
        const moderationRequest = group.target_type === "record"
          ? supabase.rpc("admin_list_record_moderation_events", {
              p_record_id: group.target_id, p_limit: 1, p_offset: 0,
            }).abortSignal(abort.signal)
          : Promise.resolve({ data: [], error: null });
        const [detailResult, moderationResult] = await Promise.all([detailRequest, moderationRequest]);
        if (!active) return;
        if (detailResult.error) setDetailError(true);
        else setDetails(normalizeSupportRows<AdminSupportReportDetailRow>(detailResult.data));
        if (group.target_type === "record") {
          if (moderationResult.error) {
            setModerationLoadFailed(true);
          } else {
            const latest = normalizeSupportRows<RecordModerationEventRow>(moderationResult.data)[0];
            setModeration({
              isHidden: latest?.next_is_hidden === true,
              version: Number(latest?.next_version ?? 0),
            });
          }
        }
      } catch { if (active) setDetailError(true); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; abort.abort(); };
  }, [expanded, group.target_id, group.target_type, status, detailPage]);

  async function moderateRecord(action: "hide" | "restore", submissionId: string | null = null) {
    if (inFlight.current || !moderation || moderationLoadFailed) return;
    const reasonCode = action === "hide" ? (moderationReasonCode || null) : null;
    if (action === "hide" && !reasonCode) { setActionFailed(true); return; }
    const adminNote = note.trim() || null;
    const requestKey = [group.target_id, action, submissionId || "", moderation.version, reasonCode || "", adminNote || ""].join("|");
    const pendingRequest = moderationRequestRef.current;
    const requestId = pendingRequest?.key === requestKey
      ? pendingRequest.requestId
      : crypto.randomUUID();
    moderationRequestRef.current = { key: requestKey, requestId };

    inFlight.current = true;
    setSaving(true);
    setActionFailed(false);
    try {
      const { data, error } = await supabase.rpc("admin_moderate_record", {
        p_record_id: group.target_id,
        p_action: action,
        p_reason_code: reasonCode,
        p_admin_note: adminNote,
        p_request_id: requestId,
        p_expected_version: moderation.version,
        p_submission_id: submissionId,
      });
      const result = data as RecordModerationRpcResult | null;
      if (error || !result?.ok) {
        setActionFailed(true);
        if (result?.error === "version_conflict" || result?.error === "already_hidden" || result?.error === "already_restored") {
          moderationRequestRef.current = null;
          setModeration(null);
          setModerationLoadFailed(true);
          onUpdated();
        }
        return;
      }
      moderationRequestRef.current = null;
      setModeration({ isHidden: result.is_hidden === true, version: Number(result.version ?? moderation.version) });
      onUpdated();
    } catch {
      setActionFailed(true);
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }

  async function update(nextStatus: "needs_info" | "resolved") {
    if (inFlight.current || (nextStatus === "resolved" && !resolution)) return;
    if (nextStatus === "resolved" && resolution === "action_taken" && !canTakeReportAction) {
      setActionFailed(true);
      return;
    }
    if (nextStatus === "resolved" && !window.confirm(copy.confirmGroup)) return;
    if (nextStatus === "resolved" && resolution === "action_taken") {
      if (!canTakeReportAction || !group.actionable_submission_id) {
        setActionFailed(true);
        return;
      }
      // One RPC handles both first-time hide+report closure and report-only
      // closure when an administrator hide already exists.
      await moderateRecord("hide", group.actionable_submission_id);
      return;
    }
    inFlight.current = true;
    setSaving(true);
    setActionFailed(false);
    try {
      const { data, error } = await supabase.rpc("admin_update_support_submission", {
        p_submission_id: group.representative_id, p_status: nextStatus,
        p_resolution: nextStatus === "resolved" ? resolution : null,
        p_admin_note: note.trim() || null,
      });
      if (error || !(data as SupportRpcResult | null)?.ok) { setActionFailed(true); return; }
      onUpdated();
    } catch { setActionFailed(true); }
    finally { inFlight.current = false; setSaving(false); }
  }
  return <article className={styles.card}>
    <div className={styles.row}>
      <strong>{group.target_type === "record"
        ? (language === "zh" ? "记录" : "Record")
        : group.target_type === "archive"
        ? (language === "zh" ? "项目" : "Project")
        : group.target_type === "market_post"
          ? (language === "zh" ? "集市信息" : "Market post")
          : (language === "zh" ? "历史举报：" : "Legacy report: ") + group.target_type}
      </strong>
      <span className={styles.status}>{status === "resolved" ? copy.result : (language === "zh" ? "待审核" : "Open")}</span>
    </div>
    <p className={styles.note}>{group.target_type} / {group.target_id}</p>
    <p className={styles.note}>{language === "zh" ? "举报数量：" : "Reports: "}{group.report_count}
      {" · "}{formatPreciseDateTime(group.first_report_at)}</p>
    {href && <Link href={href} target="_blank" rel="noopener noreferrer">{copy.openTarget}</Link>}
    <div className={styles.actions}>
      <button type="button" className={styles.secondary} onClick={() => setExpanded(value => !value)}>
        {expanded ? (language === "zh" ? "收起审核详情" : "Hide details") : (language === "zh" ? "查看审核详情及原始举报" : "Review original reports")}
      </button>
    </div>
    {expanded && <>
      {loading ? <p role="status">{copy.loading}</p>
        : detailError ? <p role="alert" className={styles.error}>{copy.loadError}</p>
        : <>
          {details.map(row => <div key={row.id} className={styles.card}>
            <p><strong>{getReportCategoryLabel(row.category, language)}</strong>
              {" · "}{getSupportStatusLabel(row.status, language)}</p>
            <p className={styles.note}>{language === "zh" ? "举报人：" : "Reporter: "}{row.user_id}
              {" · "}{formatPreciseDateTime(row.created_at)}</p>
            {row.content && <p className={styles.content}>{row.content}</p>}
            {row.supplement && <p className={styles.content}>{copy.supplement}: {row.supplement}</p>}
            {row.resolution && <p>{copy.result}: {getSupportResolutionLabel(row.resolution, language)}</p>}
            {row.admin_note && <p className={styles.note}>{copy.adminNote}: {row.admin_note}</p>}
            {row.resolved_at && <p className={styles.note}>{formatPreciseDateTime(row.resolved_at)}</p>}
          </div>)}
          <p className={styles.note}>{language === "zh" ? "原始举报详情：" : "Original report details: "}
            {details.length ? detailPage * pageSize + 1 : 0}–{detailPage * pageSize + details.length} / {total}
          </p>
          <div className={styles.actions}>
            <button className={styles.secondary} disabled={detailPage === 0} onClick={() => setDetailPage(value => value - 1)}>
              {language === "zh" ? "上一页" : "Previous"}
            </button>
            <button className={styles.secondary} disabled={(detailPage + 1) * pageSize >= total}
              onClick={() => setDetailPage(value => value + 1)}>
              {language === "zh" ? "下一页" : "Next"}
            </button>
          </div>
        </>}
      {group.target_type === "record" && <div className={styles.form}>
        <p className={styles.note}>{language === "zh" ? "记录公开状态（与举报处理分开）：" : "Record public status (separate from report resolution): "}
          {moderationLoadFailed
            ? (language === "zh" ? "状态读取失败，暂不可操作" : "Status unavailable; actions are disabled")
            : moderation
              ? (moderation.isHidden
                ? (language === "zh" ? "已下架" : "Hidden")
                : (language === "zh" ? "公开中" : "Public"))
              : copy.loading}
        </p>
        {moderationLoadFailed && <p role="alert" className={styles.error}>{copy.loadError}</p>}
        {moderation && <label className={styles.field}>
          {language === "zh" ? "管理员审核原因（区别于原举报类别）" : "Moderation reason (separate from report category)"}
          <select value={moderationReasonCode} onChange={event => setModerationReasonCode(event.target.value)} disabled={saving}>
            <option value="">{language === "zh" ? "请选择审核原因" : "Choose moderation reason"}</option>
            <option value="violence_threat_hate">{language === "zh" ? "暴力、威胁或仇恨" : "Violence, threats or hate"}</option>
            <option value="harassment_privacy_fraud">{language === "zh" ? "骚扰、隐私侵害或欺诈" : "Harassment, privacy or fraud"}</option>
            <option value="other_severe">{language === "zh" ? "其他严重违规" : "Other severe violation"}</option>
          </select>
        </label>}        {moderation && <div className={styles.actions}>
          <button type="button" className={styles.secondary}
            disabled={saving || moderation.isHidden || !group.actionable_submission_id || !moderationReasonCode || detailError || details.length === 0}
            onClick={() => {
              if (window.confirm(language === "zh" ? "确认下架这条记录？" : "Hide this record?")) {
                void moderateRecord("hide");
              }
            }}>
            {language === "zh" ? "下架记录" : "Hide record"}
          </button>
          <button type="button" className={styles.secondary}
            disabled={saving || !moderation.isHidden}
            onClick={() => {
              if (window.confirm(language === "zh" ? "确认恢复这条记录的公开资格？" : "Restore this record's public eligibility?")) {
                void moderateRecord("restore");
              }
            }}>
            {language === "zh" ? "恢复记录" : "Restore record"}
          </button>
        </div>}
      </div>}
      {status === "open" && group.target_type === "record" && !group.actionable_submission_id && (
        <p className={styles.note} role="status">
          {language === "zh"
            ? "该组没有可合法关联此记录的待处理举报，不能直接选择「已采取处理」或关联下架。历史举报仍保留，可请求补充，或人工选择「无违规」「重复」「关闭」并留下处置记录。"
            : "No open report in this group is legally linked to this record. Action taken and report-linked hiding are unavailable. Historical reports remain available for more information or documented manual resolution."}
        </p>
      )}
      {status !== "resolved" && <div className={styles.form}>
        <p className={styles.note}>{copy.adminHint} {copy.groupHint}</p>
        <label className={styles.field}>{copy.adminNote}
          <textarea maxLength={1000} value={note} onChange={event => setNote(event.target.value)} disabled={saving} />
        </label>
        <label className={styles.field}>{copy.result}
          <select value={resolution} onChange={event => setResolution(event.target.value)} disabled={saving}>
            <option value="">{copy.choose}</option>
            {(group.target_type === "record"
              ? ["action_taken", "no_violation", "duplicate", "closed"]
              : ["no_violation", "duplicate", "closed"]).map(value =>
              <option key={value} value={value}>{getSupportResolutionLabel(value, language)}</option>)}
          </select>
        </label>
        <div className={styles.actions}>
          {details[0]?.status !== "needs_info" && !details[0]?.supplement &&
            <button className={styles.secondary} disabled={saving} onClick={() => void update("needs_info")}>{copy.requestInfo}</button>}
          <button className={styles.button} disabled={saving || !resolution || (resolution === "action_taken" && !canTakeReportAction)}
            onClick={() => void update("resolved")}>{saving ? copy.submitting : copy.markResult}</button>
        </div>
      </div>}
      {actionFailed && <p role="alert" className={styles.error}>{copy.actionError}</p>}
    </>}
  </article>;
}

function QueueItems({ kind, status }: { kind: SupportSubmissionKind; status: string }) {
  const { language } = useLanguage();
  const copy = getSupportCopy(language);
  const [rows, setRows] = useState<AdminSupportSubmissionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  const [message, setMessage] = useState("");
  useEffect(() => {
    let active = true;
    const abort = new AbortController();
    setLoading(true); setError(false);
    void (async () => {
      try {
        const { data, error: rpcError } = await supabase.rpc("admin_list_support_submissions", { p_kind: kind, p_status: status || null, p_limit: 200 }).abortSignal(abort.signal);
        if (!active) return;
        if (rpcError) { setError(true); return; }
        setRows(normalizeSupportRows<AdminSupportSubmissionRow>(data));
      } catch { if (active) setError(true); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; abort.abort(); };
  }, [kind, status, revision]);
  return <>
    <p className={styles.note}>{copy.queueLimit}</p>
    <button className={styles.secondary} disabled={loading} onClick={() => setRevision(value => value + 1)}>{copy.retry}</button>
    {message && <p role="status" className={styles.message}>{message}</p>}
    {loading ? <p role="status">{copy.loading}</p> : error ? <p role="alert" className={styles.error}>{copy.loadError}</p> : <>
      {!rows.length && <p>{copy.empty}</p>}
      {rows.map(row => <QueueItem key={`${row.id}-${row.updated_at}`} row={row} onUpdated={() => { setMessage(copy.updated); setRevision(value => value + 1); }} />)}
    </>}
  </>;
}

function QueueItem({ row, onUpdated }: { row: AdminSupportSubmissionRow; onUpdated: () => void }) {
  const { language } = useLanguage();
  const copy = getSupportCopy(language);
  const [note, setNote] = useState(row.admin_note || "");
  const [resolution, setResolution] = useState("");
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const inFlight = useRef(false);
  const href = safeSupportUrl(row.target_url || row.source_url);
  const choices = row.kind === "report" ? ["no_violation", "duplicate", "closed"] : ["recorded", "action_taken", "not_planned", "closed"];
  async function update(status: "needs_info" | "resolved") {
    if (inFlight.current || (status === "resolved" && !resolution)) return;
    if (status === "resolved" && !window.confirm(row.kind === "report" ? copy.confirmGroup : copy.confirm)) return;
    inFlight.current = true; setSaving(true); setFailed(false);
    try {
      const { data, error } = await supabase.rpc("admin_update_support_submission", { p_submission_id: row.id, p_status: status, p_resolution: status === "resolved" ? resolution : null, p_admin_note: note.trim() || null });
      if (error || !(data as SupportRpcResult | null)?.ok) { setFailed(true); return; }
      onUpdated();
    } catch { setFailed(true); }
    finally { inFlight.current = false; setSaving(false); }
  }
  return <article className={styles.card}>
    <div className={styles.row}><strong>{(row.kind === "report" ? getReportCategoryLabel : getFeedbackCategoryLabel)(row.category, language)}</strong><span className={styles.status}>{getSupportStatusLabel(row.status, language)}</span></div>
    <time className={styles.time}>{formatPreciseDateTime(row.created_at)}</time>
    {row.content && <p className={styles.content}>{row.content}</p>}
    {href && <Link href={href} target="_blank" rel="noopener noreferrer">{copy.openTarget}</Link>}
    {row.supplement && <p className={styles.content}>{copy.supplement}: {row.supplement}</p>}
    {row.kind === "report" && row.status !== "resolved" && <p className={styles.note}>{copy.sameTarget}: {row.same_target_count}. {copy.groupHint}</p>}
    {row.status === "resolved" ? <>
      <p>{copy.result}: {getSupportResolutionLabel(row.resolution, language)}</p>
      {row.admin_note && <p className={styles.content}>{copy.adminNote}: {row.admin_note}</p>}
    </> : <div className={styles.form}>
      <label className={styles.field}>{copy.adminNote}<textarea value={note} onChange={e => setNote(e.target.value)} maxLength={1000} disabled={saving} /></label>
      <label className={styles.field}>{copy.result}<select value={resolution} onChange={e => setResolution(e.target.value)} disabled={saving}>
        <option value="">{copy.choose}</option>{choices.map(value => <option key={value} value={value}>{getSupportResolutionLabel(value, language)}</option>)}
      </select></label>
      <div className={styles.actions}>
        {!row.supplement && row.status !== "needs_info" && <button className={styles.secondary} disabled={saving} onClick={() => void update("needs_info")}>{copy.requestInfo}</button>}
        <button className={styles.button} disabled={saving || !resolution} onClick={() => void update("resolved")}>{saving ? copy.submitting : copy.markResult}</button>
      </div>
    </div>}
    {failed && <p role="alert" className={styles.error}>{copy.actionError}</p>}
  </article>;
}
