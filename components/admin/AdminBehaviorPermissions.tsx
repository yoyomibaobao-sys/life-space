"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { showToast } from "@/components/Toast";
import { supabase } from "@/lib/supabase";
import { useLanguage } from "@/lib/i18n/useLanguage";

type PermissionKey = "comment" | "public_publish" | "market_publish";

type RestrictionRow = {
  id: string;
  permission_key: PermissionKey;
  reason: string;
  created_by: string;
  created_at: string;
  released_by: string | null;
  released_at: string | null;
  release_reason: string | null;
};

const PERMISSIONS: Array<{ key: PermissionKey; zh: string; en: string }> = [
  { key: "comment", zh: "评论权限", en: "Commenting" },
  { key: "public_publish", zh: "公开发布权限", en: "Public publishing" },
  { key: "market_publish", zh: "集市发布权限", en: "Marketplace publishing" },
];

function shortId(value: string | null | undefined) {
  return value ? value.slice(0, 8) : "—";
}

export default function AdminBehaviorPermissions({
  userId,
  disabled = false,
}: {
  userId: string;
  disabled?: boolean;
}) {
  const { language } = useLanguage();
  const isZh = language === "zh";
  const [rows, setRows] = useState<RestrictionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<PermissionKey | null>(null);
  const [applyReason, setApplyReason] = useState("");
  const [releaseReason, setReleaseReason] = useState("");
  const [error, setError] = useState("");

  const loadRows = useCallback(async () => {
    if (!userId || disabled) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    const { data, error: rpcError } = await supabase.rpc(
      "admin_list_user_behavior_restrictions",
      { p_user_id: userId }
    );
    if (rpcError) {
      setRows([]);
      setError(rpcError.message || (isZh ? "读取行为权限失败。" : "Could not load behavior permissions."));
    } else {
      setRows(Array.isArray(data) ? (data as RestrictionRow[]) : []);
    }
    setLoading(false);
  }, [disabled, isZh, userId]);

  useEffect(() => {
    void Promise.resolve().then(loadRows);
  }, [loadRows]);

  const activeByPermission = useMemo(() => {
    const result = new Map<PermissionKey, RestrictionRow>();
    rows.forEach((row) => {
      if (!row.released_at && !result.has(row.permission_key)) {
        result.set(row.permission_key, row);
      }
    });
    return result;
  }, [rows]);

  function formatDate(value: string | null | undefined) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat(isZh ? "zh-CN" : "en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
  }

  async function applyRestriction(permissionKey: PermissionKey) {
    const reason = applyReason.trim();
    if (!reason || working) return;
    setWorking(permissionKey);
    setError("");
    const { data, error: rpcError } = await supabase.rpc(
      "admin_set_user_behavior_restriction",
      { p_user_id: userId, p_permission_key: permissionKey, p_reason: reason }
    );
    setWorking(null);
    if (rpcError) {
      setError(rpcError.message || (isZh ? "限制操作失败。" : "Could not apply the restriction."));
      return;
    }
    const result = data as { ok?: boolean; error?: string; changed?: boolean } | null;
    if (!result?.ok) {
      setError(isZh ? "限制操作未完成，请刷新后核对。" : "The restriction was not applied. Reload and check the status.");
      await loadRows();
      return;
    }
    setApplyReason("");
    showToast(result.changed
      ? (isZh ? "已限制该项行为权限。" : "Behavior permission restricted.")
      : (isZh ? "该权限已经处于限制状态。" : "This permission is already restricted."));
    await loadRows();
  }

  async function releaseRestriction(permissionKey: PermissionKey) {
    const reason = releaseReason.trim();
    if (!reason || working) return;
    setWorking(permissionKey);
    setError("");
    const { data, error: rpcError } = await supabase.rpc(
      "admin_release_user_behavior_restriction",
      { p_user_id: userId, p_permission_key: permissionKey, p_release_reason: reason }
    );
    setWorking(null);
    if (rpcError) {
      setError(rpcError.message || (isZh ? "人工解除失败。" : "Could not release the restriction."));
      return;
    }
    const result = data as { ok?: boolean; error?: string; changed?: boolean } | null;
    if (!result?.ok) {
      setError(result?.error === "not_restricted"
        ? (isZh ? "该权限当前没有生效中的限制。" : "There is no active restriction for this permission.")
        : (isZh ? "人工解除未完成，请刷新后核对。" : "The release was not completed. Reload and check the status."));
      await loadRows();
      return;
    }
    setReleaseReason("");
    showToast(isZh ? "已由管理员人工解除该项限制。" : "The administrator manually released this restriction.");
    await loadRows();
  }

  return (
    <details style={sectionStyle}>
      <summary style={summaryStyle}>{isZh ? "行为权限管理" : "Behavior permissions"}</summary>
      <p style={introStyle}>
        {isZh
          ? "三项权限分别生效。限制不会自动到期，只能由管理员逐项人工解除；不会改变会员期限、容量或付款权益。"
          : "The three permissions are independent. Restrictions do not expire automatically and must be manually released by an administrator, one at a time. Membership dates, storage and payment benefits are unchanged."}
      </p>

      {disabled ? (
        <p style={mutedStyle}>
          {isZh ? "该账号已无可用登录身份，不能新增行为权限限制。" : "This account has no active login identity, so behavior restrictions cannot be changed."}
        </p>
      ) : (
        <>
          <label style={fieldLabelStyle}>
            {isZh ? "限制原因（必填）" : "Restriction reason (required)"}
            <textarea
              value={applyReason}
              onChange={(event) => setApplyReason(event.target.value)}
              maxLength={1000}
              rows={2}
              style={textareaStyle}
              placeholder={isZh ? "填写已核实的具体行为及依据" : "Describe the verified conduct and basis"}
            />
          </label>
          <label style={fieldLabelStyle}>
            {isZh ? "解除原因（必填）" : "Release reason (required)"}
            <textarea
              value={releaseReason}
              onChange={(event) => setReleaseReason(event.target.value)}
              maxLength={1000}
              rows={2}
              style={textareaStyle}
              placeholder={isZh ? "填写人工复核及解除依据" : "Describe the manual review and release basis"}
            />
          </label>

          {loading ? <p style={mutedStyle}>{isZh ? "正在读取权限记录…" : "Loading permission history…"}</p> : null}

          {PERMISSIONS.map((permission) => {
            const active = activeByPermission.get(permission.key);
            return (
              <div key={permission.key} style={permissionRowStyle}>
                <div style={permissionHeaderStyle}>
                  <strong>{isZh ? permission.zh : permission.en}</strong>
                  <span style={active ? activeStatusStyle : normalStatusStyle}>
                    {active ? (isZh ? "已限制" : "Restricted") : (isZh ? "正常" : "Normal")}
                  </span>
                </div>
                {active ? (
                  <p style={mutedStyle}>
                    {(isZh ? "限制原因：" : "Reason: ")}{active.reason}
                    <br />
                    {(isZh ? "限制时间：" : "Applied: ")}{formatDate(active.created_at)}
                    {" · "}{(isZh ? "操作者：" : "By: ")}{shortId(active.created_by)}
                  </p>
                ) : null}
                <button
                  type="button"
                  disabled={loading || working !== null || (active ? !releaseReason.trim() : !applyReason.trim())}
                  onClick={() => void (active
                    ? releaseRestriction(permission.key)
                    : applyRestriction(permission.key))}
                  style={active ? releaseButtonStyle : applyButtonStyle}
                >
                  {working === permission.key
                    ? (isZh ? "处理中…" : "Working…")
                    : active
                      ? (isZh ? "管理员人工解除" : "Manually release")
                      : (isZh ? "限制此权限" : "Restrict this permission")}
                </button>
              </div>
            );
          })}
        </>
      )}

      {error ? <p role="alert" style={errorStyle}>{error}</p> : null}

      {rows.length > 0 ? (
        <div style={historyStyle}>
          <strong>{isZh ? "最近操作记录" : "Recent action history"}</strong>
          {rows.slice(0, 12).map((row) => {
            const permission = PERMISSIONS.find((item) => item.key === row.permission_key);
            return (
              <div key={row.id} style={historyRowStyle}>
                <div>
                  <strong>{permission ? (isZh ? permission.zh : permission.en) : row.permission_key}</strong>
                  <span style={row.released_at ? normalStatusStyle : activeStatusStyle}>
                    {row.released_at ? (isZh ? "已人工解除" : "Manually released") : (isZh ? "限制中" : "Active")}
                  </span>
                </div>
                <p style={mutedStyle}>
                  {(isZh ? "限制：" : "Applied: ")}{formatDate(row.created_at)}
                  {" · "}{shortId(row.created_by)}
                  {" · "}{row.reason}
                </p>
                {row.released_at ? (
                  <p style={mutedStyle}>
                    {(isZh ? "解除：" : "Released: ")}{formatDate(row.released_at)}
                    {" · "}{shortId(row.released_by)}
                    {" · "}{row.release_reason}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}

      <button type="button" onClick={() => void loadRows()} disabled={loading || working !== null || disabled} style={reloadButtonStyle}>
        {isZh ? "刷新权限记录" : "Refresh permission history"}
      </button>
    </details>
  );
}

const sectionStyle = {
  marginBlock: 14,
  padding: 14,
  border: "1px solid #e4e9e1",
  borderRadius: 14,
  background: "#fbfcfa",
} as const;
const summaryStyle = { cursor: "pointer", fontWeight: 800, color: "#344334" } as const;
const introStyle = { margin: "10px 0 14px", color: "#667365", fontSize: 13, lineHeight: 1.65 } as const;
const fieldLabelStyle = { display: "block", marginBlock: 10, fontSize: 13, fontWeight: 700, color: "#4c594a" } as const;
const textareaStyle = {
  display: "block",
  width: "100%",
  boxSizing: "border-box" as const,
  marginTop: 6,
  padding: "9px 10px",
  border: "1px solid #d4ddd0",
  borderRadius: 9,
  background: "#fff",
  font: "inherit",
  fontSize: 14,
  resize: "vertical" as const,
} as const;
const permissionRowStyle = { padding: "12px 0", borderTop: "1px solid #e8ede5" } as const;
const permissionHeaderStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  flexWrap: "wrap" as const,
} as const;
const activeStatusStyle = {
  color: "#9a3b2c",
  background: "#fff0eb",
  borderRadius: 999,
  padding: "3px 9px",
  fontSize: 12,
  fontWeight: 750,
} as const;
const normalStatusStyle = {
  color: "#52634f",
  background: "#edf3ea",
  borderRadius: 999,
  padding: "3px 9px",
  fontSize: 12,
  fontWeight: 750,
} as const;
const applyButtonStyle = {
  minHeight: 36,
  padding: "7px 13px",
  border: "1px solid #b66b54",
  borderRadius: 9,
  background: "#fff7f3",
  color: "#8d412e",
  fontWeight: 750,
} as const;
const releaseButtonStyle = {
  minHeight: 36,
  padding: "7px 13px",
  border: "1px solid #819579",
  borderRadius: 9,
  background: "#f2f7ef",
  color: "#40583d",
  fontWeight: 750,
} as const;
const reloadButtonStyle = {
  minHeight: 34,
  marginTop: 10,
  padding: "6px 11px",
  border: "1px solid #d4ddd0",
  borderRadius: 9,
  background: "#fff",
  color: "#52634f",
  fontWeight: 650,
} as const;
const mutedStyle = {
  margin: "7px 0",
  color: "#6f7b6c",
  fontSize: 12,
  lineHeight: 1.6,
  overflowWrap: "anywhere" as const,
} as const;
const historyStyle = { marginTop: 12, paddingTop: 12, borderTop: "1px solid #e8ede5" } as const;
const historyRowStyle = { padding: "9px 0", borderBottom: "1px solid #edf1eb" } as const;
const errorStyle = { color: "#9a3b2c", fontSize: 13, lineHeight: 1.6 } as const;
