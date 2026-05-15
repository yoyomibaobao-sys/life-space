export type MembershipPlan = "trial" | "basic" | "large" | "seller" | "admin";
export type MembershipStatus = "trialing" | "active" | "past_due" | "expired" | "canceled";

export type MyMembership = {
  user_id: string;
  plan: MembershipPlan | string;
  status: MembershipStatus | string;
  trial_started_at: string | null;
  trial_ends_at: string | null;
  paid_until: string | null;
  storage_limit_bytes: number | null;
  base_market_post_limit: number | null;
  active_market_post_count: number | null;
  market_post_limit: number | null;
  can_create_content: boolean | null;
  can_create_market_post: boolean | null;
};

export function normalizeMembershipRpcResult(data: unknown): MyMembership | null {
  if (Array.isArray(data)) return (data[0] || null) as MyMembership | null;
  return (data || null) as MyMembership | null;
}

export function getMembershipPlanLabel(plan?: string | null) {
  switch (plan) {
    case "trial":
      return "免费试用";
    case "basic":
      return "基础年费";
    case "large":
      return "大空间";
    case "seller":
      return "商家";
    case "admin":
      return "管理账号";
    default:
      return "未设置";
  }
}

export function getMembershipStatusLabel(status?: string | null) {
  switch (status) {
    case "trialing":
      return "试用中";
    case "active":
      return "使用中";
    case "past_due":
      return "待续费";
    case "expired":
      return "已过期";
    case "canceled":
      return "已取消";
    default:
      return "未知";
  }
}

export function formatMembershipDate(value?: string | null) {
  if (!value) return "暂无";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "暂无";
  return date.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });
}

export function getDaysRemaining(value?: string | null) {
  if (!value) return null;
  const end = new Date(value).getTime();
  if (Number.isNaN(end)) return null;
  const diff = end - Date.now();
  return Math.max(0, Math.ceil(diff / (24 * 60 * 60 * 1000)));
}

export function getMembershipEndDate(membership?: MyMembership | null) {
  if (!membership) return null;
  if (membership.status === "trialing") return membership.trial_ends_at;
  return membership.paid_until || membership.trial_ends_at;
}

export function getMembershipSummary(membership?: MyMembership | null) {
  if (!membership) return "暂未读取到试用信息";

  const label = getMembershipPlanLabel(membership.plan);
  const status = getMembershipStatusLabel(membership.status);
  const endDate = getMembershipEndDate(membership);
  const days = getDaysRemaining(endDate);

  if (membership.can_create_content === false) {
    return `${label} · ${status}。已有内容仍可查看、导出和删除。`;
  }

  if (typeof days === "number") {
    return `${label} · ${status}，还剩 ${days} 天。`;
  }

  return `${label} · ${status}`;
}

export function canCreateMembershipContent(membership?: MyMembership | null) {
  return membership?.can_create_content !== false;
}

export function canCreateMembershipMarketPost(membership?: MyMembership | null) {
  return membership?.can_create_market_post !== false;
}

export function getCreateContentBlockedText(membership?: MyMembership | null) {
  const label = getMembershipPlanLabel(membership?.plan);
  const status = getMembershipStatusLabel(membership?.status);

  if (!membership) {
    return "暂时无法确认试用状态，请稍后再试。";
  }

  if (membership.can_create_content === false) {
    return `${label} · ${status}。你仍可查看、导出或删除已有内容；继续新增项目和记录需要开通年度使用权。`;
  }

  return "可以继续新增内容。";
}

export function getCreateMarketPostBlockedText(membership?: MyMembership | null) {
  const label = getMembershipPlanLabel(membership?.plan);
  const status = getMembershipStatusLabel(membership?.status);

  if (!membership) {
    return "暂时无法确认集市发布额度，请稍后再试。";
  }

  if (membership.can_create_content === false) {
    return `${label} · ${status}。继续发布集市信息需要开通年度使用权。`;
  }

  if (membership.can_create_market_post === false) {
    return `当前集市发布额度已满：${Number(membership.active_market_post_count || 0)} / ${Number(membership.market_post_limit || 0)} 条。你可以结束旧发布，或以后开通集市加量包。`;
  }

  return "可以继续发布集市信息。";
}

export function getMarketPostQuotaLabel(membership?: MyMembership | null) {
  if (!membership) return "集市发布额度暂未读取";

  const active = Number(membership.active_market_post_count || 0);
  const limit = Number(membership.market_post_limit || 0);

  if (!Number.isFinite(limit) || limit <= 0) {
    return `当前在线发布：${active} 条`;
  }

  return `当前在线发布：${active} / ${limit} 条`;
}

export function getMarketPostQuotaHint(membership?: MyMembership | null) {
  if (!membership) {
    return "暂时无法确认集市发布额度，请稍后再试。";
  }

  if (membership.can_create_market_post === false) {
    return getCreateMarketPostBlockedText(membership);
  }

  return `${getMarketPostQuotaLabel(membership)}。免费试用期可同时在线 3 条，基础年费可同时在线 10 条。`;
}


function formatStorageNumber(value: number) {
  const rounded = value >= 10 ? Math.round(value * 10) / 10 : Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

export function formatStorageBytes(value?: number | null) {
  const bytes = Math.max(0, Number(value || 0));
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";

  const kb = 1000;
  const mb = 1000 * 1000;
  const gb = 1000 * 1000 * 1000;

  if (bytes >= gb) return `${formatStorageNumber(bytes / gb)} GB`;
  if (bytes >= mb) return `${formatStorageNumber(bytes / mb)} MB`;
  if (bytes >= kb) return `${formatStorageNumber(bytes / kb)} KB`;
  return `${Math.round(bytes)} B`;
}

export function getStorageRemainingBytes(params: {
  usedBytes?: number | null;
  limitBytes?: number | null;
}) {
  const used = Number(params.usedBytes || 0);
  const limit = Number(params.limitBytes || 0);
  if (!Number.isFinite(limit) || limit <= 0) return null;
  return Math.max(0, limit - Math.max(0, used));
}

export function canUploadWithinStorageLimit(params: {
  usedBytes?: number | null;
  limitBytes?: number | null;
  uploadBytes?: number | null;
}) {
  const limit = Number(params.limitBytes || 0);
  if (!Number.isFinite(limit) || limit <= 0) return true;

  const used = Math.max(0, Number(params.usedBytes || 0));
  const upload = Math.max(0, Number(params.uploadBytes || 0));
  return used + upload <= limit;
}

export function getStorageLimitExceededText(params: {
  usedBytes?: number | null;
  limitBytes?: number | null;
  uploadBytes?: number | null;
}) {
  const remaining = getStorageRemainingBytes({
    usedBytes: params.usedBytes,
    limitBytes: params.limitBytes,
  });

  const uploadText = formatStorageBytes(params.uploadBytes || 0);
  const remainingText = remaining === null ? "暂无" : formatStorageBytes(remaining);
  const limitText = formatStorageBytes(params.limitBytes || 0);

  return `当前容量不足。本次选择约 ${uploadText}，剩余约 ${remainingText}，当前容量上限 ${limitText}。你可以减少图片、删除旧图片释放空间，或查看年度使用权。`;
}
