export type SupportSubmissionKind = "feedback" | "report";
export type SupportSubmissionStatus = "submitted" | "needs_info" | "resolved";

export type SupportSubmissionRow = {
  id: string;
  kind: SupportSubmissionKind;
  category: string;
  content: string | null;
  source_url: string | null;
  target_type: string | null;
  target_id: string | null;
  target_url: string | null;
  supplement: string | null;
  supplemented_at: string | null;
  status: SupportSubmissionStatus;
  resolution: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
};

export type AdminSupportSubmissionRow = SupportSubmissionRow & {
  user_id: string;
  admin_note: string | null;
  same_target_count: number | string;
};

export type SupportRpcResult = {
  ok?: boolean;
  error?: string;
  duplicate?: boolean;
  id?: string;
  status?: string;
  updated_count?: number;
  resolution?: string;
};

export const FEEDBACK_CATEGORIES = [
  "feature",
  "problem",
  "experience",
  "other",
] as const;

export const REPORT_CATEGORIES = [
  "spam",
  "harassment",
  "misleading",
  "unsafe",
  "ip",
  "impersonation",
  "other",
] as const;

export function getSupportStatusLabel(
  value: string | null | undefined,
  language: "zh" | "en"
) {
  if (value === "submitted") return language === "en" ? "Submitted" : "已提交";
  if (value === "needs_info") return language === "en" ? "More information needed" : "需要补充";
  if (value === "resolved") return language === "en" ? "Processed" : "已处理";
  return language === "en" ? "Unknown" : "未知";
}

export function getFeedbackCategoryLabel(value: string, language: "zh" | "en") {
  const labels: Record<string, [string, string]> = {
    feature: ["功能建议", "Feature request"],
    problem: ["问题或异常", "Problem or bug"],
    experience: ["使用体验", "Experience"],
    other: ["其他", "Other"],
  };
  const label = labels[value] || [value, value];
  return language === "en" ? label[1] : label[0];
}

export function getReportCategoryLabel(value: string, language: "zh" | "en") {
  const labels: Record<string, [string, string]> = {
    spam: ["垃圾或广告", "Spam or advertising"],
    harassment: ["骚扰或攻击", "Harassment or abuse"],
    misleading: ["虚假或误导", "False or misleading"],
    unsafe: ["不当或危险内容", "Inappropriate or unsafe content"],
    ip: ["侵权", "Intellectual property"],
    impersonation: ["冒用身份", "Impersonation"],
    other: ["其他", "Other"],
  };
  const label = labels[value] || [value, value];
  return language === "en" ? label[1] : label[0];
}

export function getSupportResolutionLabel(
  value: string | null | undefined,
  language: "zh" | "en"
) {
  const labels: Record<string, [string, string]> = {
    recorded: ["已记录", "Recorded"],
    action_taken: ["已采取处理", "Action taken"],
    no_violation: ["未发现需处理问题", "No action required"],
    duplicate: ["已合并处理", "Merged"],
    not_planned: ["暂不调整", "No change planned"],
    closed: ["已关闭", "Closed"],
  };
  if (!value) return "";
  const label = labels[value] || [value, value];
  return language === "en" ? label[1] : label[0];
}

export function formatSupportTime(value: string | null | undefined, language: "zh" | "en") {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(language === "en" ? "en" : "zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function normalizeSupportRows<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}
