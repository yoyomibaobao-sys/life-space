"use client";

import Link from "next/link";
import { buildLoginHref } from "@/lib/auth-return";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { supabase } from "@/lib/supabase";
import ConfirmDialog from "@/components/ConfirmDialog";
import { showToast } from "@/components/Toast";
import UiIcon from "@/components/ui/UiIcon";
import {
  formatMembershipDate,
  formatStorageBytes,
  getMembershipPlanLabel,
  getMembershipStatusLabel,
} from "@/lib/membership";
import { getTranslations, type Language } from "@/lib/i18n";
import { useLanguage } from "@/lib/i18n/useLanguage";

type AdminMembershipRow = {
  user_id: string;
  email: string | null;
  username: string | null;
  plan: string | null;
  status: string | null;
  trial_ends_at: string | null;
  paid_until: string | null;
  storage_used: number | null;
  storage_limit_bytes: number | null;
  base_market_post_limit: number | null;
  active_market_post_count: number | null;
  market_post_limit: number | null;
  created_at: string | null;
  updated_at: string | null;
  account_number: string | null;
  is_internal_test: boolean | null;
  registered_at: string | null;
  last_sign_in_at: string | null;
  archive_count: number | string | null;
  record_count: number | string | null;
};

type SignupRolloutStatus = {
  internal_test_account_count: number | string | null;
  formal_account_count: number | string | null;
  trial_slot_limit: number | string | null;
  trial_slots_granted: number | string | null;
  trial_slots_remaining: number | string | null;
  trial_allowance_bytes: number | string | null;
  platform_storage_bytes: number | string | null;
  unrealized_trial_allowance_bytes: number | string | null;
  projected_storage_bytes: number | string | null;
  platform_storage_pause_bytes: number | string | null;
  trial_grants_enabled: boolean | null;
  trial_grants_paused: boolean | null;
  pause_reason: string | null;
};

type MembershipPaymentRow = {
  id: string;
  user_id: string;
  plan: string | null;
  status: string | null;
  amount: number | string | null;
  currency: string | null;
  payment_method: string | null;
  payment_reference: string | null;
  note: string | null;
  paid_at: string | null;
  service_started_at: string | null;
  service_ends_at: string | null;
  created_by: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type PendingPaymentQueueRow = {
  id: string;
  user_id: string;
  email: string | null;
  username: string | null;
  order_number: string | null;
  status: string | null;
  amount: number | string | null;
  currency: string | null;
  payment_method: string | null;
  payment_reference: string | null;
  proof_path: string | null;
  submitted_at: string | null;
  created_at: string | null;
  review_note: string | null;
  payment_destination_key: string | null;
  payment_destination_label: string | null;
  payment_destination_url: string | null;
  payment_destination_version: string | null;
};

type MembershipRefundQueueRow = {
  id: string;
  payment_id: string;
  user_id: string;
  email: string | null;
  username: string | null;
  account_number: string | null;
  status: "submitted" | "approved_pending_refund" | "completed" | "rejected" | "canceled";
  policy_band: "full_7d" | "half_180d" | "unused_renewal_full";
  original_amount: number | string | null;
  refund_amount: number | string | null;
  currency: string | null;
  request_reason: string | null;
  requested_at: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  refund_reference: string | null;
  refunded_at: string | null;
  benefits_ended_at: string | null;
  order_number: string | null;
  payment_method: string | null;
  payment_reference: string | null;
  paid_at: string | null;
  service_started_at: string | null;
  service_ends_at: string | null;
};

type AdminOperationsMetrics = {
  page_views_today: number | string | null;
  page_views_period: number | string | null;
  visitors_7d: number | string | null;
  registered_total: number | string | null;
  registered_7d: number | string | null;
  cloud_members: number | string | null;
  payments_awaiting_confirmation: number | string | null;
  apk_download_total: number | string | null;
  apk_download_30d: number | string | null;
  platform_storage_bytes: number | string | null;
  platform_storage_pause_bytes: number | string | null;
  account_deletions_30d: number | string | null;
  account_deletion_failures: number | string | null;
  tracking_started_at: string | null;
};

type DailyTrafficRow = {
  day: string;
  page_views: number | string | null;
  visitors: number | string | null;
};

type TopPageRow = {
  path: string;
  page_views: number | string | null;
  visitors: number | string | null;
};

type StorageLeaderRow = {
  user_id: string;
  account_number: string | null;
  username: string | null;
  storage_used: number | string | null;
  storage_limit_bytes: number | string | null;
};

type AdminOperationsDashboard = {
  generated_at: string | null;
  period_days: number | string | null;
  metrics: AdminOperationsMetrics;
  daily_traffic: DailyTrafficRow[];
  top_pages: TopPageRow[];
  storage_leaders: StorageLeaderRow[];
};

type AccountDeletionAuditRow = {
  id: string;
  target_user_id: string;
  target_account_number: string | null;
  initiated_by: "self" | "admin" | string;
  status: "processing" | "completed" | "failed" | string;
  requested_at: string | null;
  completed_at: string | null;
  failed_at: string | null;
  deleted_storage_object_count: number | string | null;
  error_code: string | null;
};

type PlanKey = "trial" | "basic" | "large" | "seller" | "admin";
type PaymentPlanKey = Exclude<PlanKey, "trial">;
type PaymentCurrency = "CNY" | "USD";
type PaymentMethod = "wechat" | "alipay" | "paypal" | "manual" | "other";

type PlanPreset = {
  key: PlanKey;
  storageLimitBytes: number;
  baseMarketPostLimit: number;
  paidMonths: number | null;
};

const PLAN_PRESETS: PlanPreset[] = [
  {
    key: "trial",
    storageLimitBytes: 30_000_000,
    baseMarketPostLimit: 3,
    paidMonths: null,
  },
  {
    key: "basic",
    storageLimitBytes: 1_000_000_000,
    baseMarketPostLimit: 30,
    paidMonths: 12,
  },
  {
    key: "large",
    storageLimitBytes: 10_000_000_000,
    baseMarketPostLimit: 20,
    paidMonths: 12,
  },
  {
    key: "seller",
    storageLimitBytes: 10_000_000_000,
    baseMarketPostLimit: 100,
    paidMonths: 12,
  },
  {
    key: "admin",
    storageLimitBytes: 20_000_000_000,
    baseMarketPostLimit: 999,
    paidMonths: 120,
  },
];

const PAYMENT_PLAN_OPTIONS = PLAN_PRESETS.filter(
  (preset): preset is PlanPreset & { key: PaymentPlanKey } => preset.key !== "trial"
);

function getAdminMembershipStatusLabel(
  status: string | null | undefined,
  language: Language
) {
  if (status === "canceled") return getTranslations(language).admin_memberships.deleted;
  return getMembershipStatusLabel(status, language);
}

function getSignupTrialPauseLabel(reason: string | null | undefined, language: Language) {
  const copy = getTranslations(language).admin_memberships;
  if (reason === "disabled") return copy.pause_disabled;
  if (reason === "first_twenty_registered") return copy.pause_first_twenty;
  if (reason === "storage_safety_threshold") return copy.pause_storage;
  return copy.grants_available;
}

function canDeleteMembership(row: AdminMembershipRow | null, currentUserId: string) {
  if (!row) return false;
  if (!row.plan) return false;
  if (row.user_id === currentUserId) return false;
  if (row.status === "canceled") return false;
  if (row.plan === "admin") return false;
  return true;
}

function canPermanentlyDeleteAccount(
  row: AdminMembershipRow | null,
  currentUserId: string
) {
  if (!row) return false;
  if (row.user_id === currentUserId) return false;
  return row.plan !== "admin";
}

function formatAdminCount(value: number | string | null | undefined, language: Language) {
  const count = Number(value || 0);
  return Number.isFinite(count)
    ? count.toLocaleString(language === "en" ? "en-US" : "zh-CN")
    : "0";
}

function getDefaultPaymentAmount(plan: PaymentPlanKey, currency: PaymentCurrency) {
  if (plan === "basic") return currency === "CNY" ? 64 : 8;
  return 0;
}

function getPlanPresetLabel(plan: PlanKey, language: Language) {
  const copy = getTranslations(language).admin_memberships;
  if (plan === "trial") return copy.plan_trial;
  if (plan === "basic") return copy.plan_basic;
  if (plan === "large") return copy.plan_large;
  if (plan === "seller") return copy.plan_seller;
  return copy.plan_admin;
}

function getPlanPresetNote(plan: PlanKey, language: Language) {
  const copy = getTranslations(language).admin_memberships;
  if (plan === "trial") return copy.plan_trial_note;
  if (plan === "basic") return copy.plan_basic_note;
  if (plan === "large") return copy.plan_large_note;
  if (plan === "seller") return copy.plan_seller_note;
  return copy.plan_admin_note;
}

function getPaymentPlanLabel(plan: string | null | undefined, language: Language) {
  return getMembershipPlanLabel(plan, language);
}

function getPaymentMethodLabel(method: string | null | undefined, language: Language) {
  const copy = getTranslations(language).admin_memberships;
  if (method === "wechat") return copy.method_wechat;
  if (method === "alipay") return copy.method_alipay;
  if (method === "paypal") return copy.method_paypal;
  if (method === "manual") return copy.method_manual;
  if (method === "other") return copy.method_other;
  return method || copy.not_recorded;
}

function getPaymentStatusLabel(status: string | null | undefined, language: Language) {
  const copy = getTranslations(language).admin_memberships;
  if (status === "pending_payment") return copy.status_pending_payment;
  if (status === "submitted") return copy.status_submitted;
  if (status === "needs_update") return copy.status_needs_update;
  if (status === "confirmed") return copy.status_confirmed;
  if (status === "refunded") return copy.status_refunded;
  if (status === "canceled") return copy.status_canceled;
  return status || copy.not_recorded;
}

function getRefundStatusLabel(
  status: MembershipRefundQueueRow["status"],
  language: Language
) {
  const copy = getTranslations(language).admin_memberships;
  if (status === "submitted") return copy.refund_status_submitted;
  if (status === "approved_pending_refund") return copy.refund_status_approved;
  if (status === "completed") return copy.refund_status_completed;
  if (status === "rejected") return copy.refund_status_rejected;
  return copy.refund_status_canceled;
}

function getRefundPolicyLabel(
  band: MembershipRefundQueueRow["policy_band"],
  language: Language
) {
  const copy = getTranslations(language).admin_memberships;
  if (band === "full_7d") return copy.refund_band_full_7d;
  if (band === "unused_renewal_full") return copy.refund_band_unused_renewal;
  return copy.refund_band_half_180d;
}

function formatPaymentAmount(amount?: number | string | null, currency?: string | null) {
  const value = Number(amount || 0);
  if (!Number.isFinite(value)) return `${currency || ""} ${amount || ""}`.trim();
  if (currency === "CNY") return `¥${value.toFixed(2)}`;
  if (currency === "USD") return `US$${value.toFixed(2)}`;
  return `${value.toFixed(2)} ${currency || ""}`.trim();
}

function addMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function toDateInputValue(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function dateInputToIso(value: string) {
  if (!value.trim()) return null;
  const date = new Date(`${value}T23:59:59`);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function sanitizeReferencePart(value?: string | null) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 18);
}

function buildPaymentReference(
  user: Pick<AdminMembershipRow, "user_id" | "username" | "email">,
  method: PaymentMethod,
  paidAtDate: string
) {
  const datePart = (paidAtDate || new Date().toISOString().slice(0, 10)).replace(/-/g, "");
  const timePart = new Date().toTimeString().slice(0, 8).replace(/:/g, "");
  const userPart = sanitizeReferencePart(user.username || user.email) || user.user_id.slice(0, 8);
  return `${method}-${datePart}-${userPart}-${timePart}`;
}

function getPreset(plan: string | null | undefined) {
  return PLAN_PRESETS.find((item) => item.key === plan) || PLAN_PRESETS[1];
}

function normalizeRows(data: unknown): AdminMembershipRow[] {
  if (!Array.isArray(data)) return [];
  return data as AdminMembershipRow[];
}

type SafeUpdateResult = {
  ok: boolean | null;
  error_message: string | null;
  error_detail: string | null;
  user_id: string | null;
  plan: string | null;
  status: string | null;
  trial_ends_at: string | null;
  paid_until: string | null;
  storage_limit_bytes: number | null;
  base_market_post_limit: number | null;
};

type PaymentCreateResult = {
  ok: boolean | null;
  error_message: string | null;
  error_detail: string | null;
  payment_id?: string | null;
  id?: string | null;
  user_id?: string | null;
  plan?: string | null;
  amount?: number | string | null;
  currency?: string | null;
  payment_method?: string | null;
  paid_at?: string | null;
  service_started_at?: string | null;
  service_ends_at?: string | null;
};

function firstRpcRow<T>(data: T[] | T | null | undefined): T | null {
  if (!data) return null;
  if (Array.isArray(data)) return data[0] ?? null;
  return data;
}

function describeSupabaseError(error: unknown, language: Language = "zh") {
  const copy = getTranslations(language).admin_memberships;
  if (!error || typeof error !== "object") return String(error || copy.unknown_error);

  const item = error as {
    message?: string;
    code?: string;
    details?: string;
    hint?: string;
    status?: number;
    statusText?: string;
  };

  return [
    item.message,
    item.code ? `code: ${item.code}` : "",
    item.details ? `details: ${item.details}` : "",
    item.hint ? `hint: ${item.hint}` : "",
    item.status ? `status: ${item.status}` : "",
    item.statusText ? `statusText: ${item.statusText}` : "",
  ]
    .filter(Boolean)
    .join(language === "en" ? "; " : "；") || copy.unknown_error;
}

function logSupabaseError(label: string, error: unknown) {
  console.error(label, error);
  console.error(`${label} detail:`, describeSupabaseError(error));
  try {
    console.error(`${label} json:`, JSON.stringify(error));
  } catch {
    // ignore stringify errors
  }
}

export default function AdminMembershipsPage() {
  const { language, t } = useLanguage();
  const [currentUserId, setCurrentUserId] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(1200);
  const [keyword, setKeyword] = useState("");
  const [rows, setRows] = useState<AdminMembershipRow[]>([]);
  const [rolloutStatus, setRolloutStatus] = useState<SignupRolloutStatus | null>(null);
  const [rolloutLoading, setRolloutLoading] = useState(false);
  const [rolloutError, setRolloutError] = useState("");
  const [selected, setSelected] = useState<AdminMembershipRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminMembershipRow | null>(null);
  const [deleteSaving, setDeleteSaving] = useState(false);
  const [plan, setPlan] = useState<PlanKey>("basic");
  const [paidUntilDate, setPaidUntilDate] = useState("");
  const [storageLimitBytes, setStorageLimitBytes] = useState("1000000000");
  const [baseMarketPostLimit, setBaseMarketPostLimit] = useState("30");
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [paymentRows, setPaymentRows] = useState<MembershipPaymentRow[]>([]);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentSaving, setPaymentSaving] = useState(false);
  const [paymentPlan, setPaymentPlan] = useState<PaymentPlanKey>("basic");
  const [paymentAmount, setPaymentAmount] = useState("64");
  const [paymentCurrency, setPaymentCurrency] = useState<PaymentCurrency>("CNY");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("manual");
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
  const [paymentPaidAtDate, setPaymentPaidAtDate] = useState(new Date().toISOString().slice(0, 10));
  const [paymentServiceMonths, setPaymentServiceMonths] = useState("12");
  const [pendingPaymentRows, setPendingPaymentRows] = useState<PendingPaymentQueueRow[]>([]);
  const [pendingPaymentLoading, setPendingPaymentLoading] = useState(false);
  const [pendingPaymentActionId, setPendingPaymentActionId] = useState<string | null>(null);
  const [refundRows, setRefundRows] = useState<MembershipRefundQueueRow[]>([]);
  const [refundLoading, setRefundLoading] = useState(false);
  const [refundActionId, setRefundActionId] = useState<string | null>(null);
  const [operationsDashboard, setOperationsDashboard] =
    useState<AdminOperationsDashboard | null>(null);
  const [operationsLoading, setOperationsLoading] = useState(false);
  const [operationsError, setOperationsError] = useState("");
  const [deletionAuditRows, setDeletionAuditRows] = useState<AccountDeletionAuditRow[]>([]);
  const [deletionAuditLoading, setDeletionAuditLoading] = useState(false);
  const [accountDeleteTarget, setAccountDeleteTarget] =
    useState<AdminMembershipRow | null>(null);
  const [accountDeleteConfirmation, setAccountDeleteConfirmation] = useState("");
  const [accountDeleteAcknowledged, setAccountDeleteAcknowledged] = useState(false);
  const [accountDeleteSaving, setAccountDeleteSaving] = useState(false);
  const [activeAdminSection, setActiveAdminSection] = useState("overview");
  const paymentSubmittingRef = useRef(false);

  const isMobileViewport = viewportWidth < 760;
  const currentPageStyle = isMobileViewport ? mobilePageStyle : pageStyle;
  const currentHeaderStyle = isMobileViewport ? mobileHeaderStyle : headerStyle;
  const currentCardStyle = isMobileViewport ? mobileCardStyle : cardStyle;
  const currentLayoutStyle = isMobileViewport ? mobileLayoutStyle : layoutStyle;
  const currentDetailStyle = isMobileViewport ? mobileDetailStyle : detailStyle;
  const currentSummaryGridStyle = isMobileViewport ? mobileSummaryGridStyle : summaryGridStyle;
  const currentPresetGridStyle = isMobileViewport ? mobilePresetGridStyle : presetGridStyle;
  const currentFormGridStyle = isMobileViewport ? mobileFormGridStyle : formGridStyle;
  const currentOperationsGridStyle = isMobileViewport
    ? mobileOperationsGridStyle
    : operationsGridStyle;
  const currentTrafficLayoutStyle = isMobileViewport
    ? mobileTrafficLayoutStyle
    : trafficLayoutStyle;
  const adminSectionScrollMarginTop = isMobileViewport
    ? "calc(112px + var(--app-safe-area-top))"
    : 112;

  useEffect(() => {
    const updateViewportWidth = () => setViewportWidth(window.innerWidth);
    updateViewportWidth();
    window.addEventListener("resize", updateViewportWidth);
    return () => window.removeEventListener("resize", updateViewportWidth);
  }, []);

  useEffect(() => {
    if (checking || !isAdmin || !window.location.hash) return;

    const sectionId = window.location.hash.slice(1);
    setActiveAdminSection(sectionId);
    const frameId = window.requestAnimationFrame(() => {
      document.getElementById(sectionId)?.scrollIntoView({ block: "start" });
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [checking, isAdmin]);

  useEffect(() => {
    if (checking || !isAdmin) return;
    const sectionIds = [
      "overview",
      "traffic",
      "registrations",
      "payment-review",
      "refund-review",
      "capacity",
      "account-closures",
    ];
    const sections = sectionIds
      .map((id) => document.getElementById(id))
      .filter((item): item is HTMLElement => Boolean(item));
    if (sections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible?.target.id) setActiveAdminSection(visible.target.id);
      },
      { rootMargin: "-120px 0px -68% 0px", threshold: [0, 0.01] }
    );
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [checking, isAdmin]);

  async function loadRows(searchKeyword = keyword) {
    setLoading(true);
    setErrorMsg("");

    const { data, error } = await supabase.rpc("admin_search_memberships", {
      p_keyword: searchKeyword.trim(),
    });

    if (error) {
      logSupabaseError("admin search memberships error:", error);
      setRows([]);
      setErrorMsg(
        describeSupabaseError(error, language) ||
          t.admin_memberships.read_memberships_failed
      );
      setLoading(false);
      return;
    }

    const nextRows = normalizeRows(data);
    setRows(nextRows);

    if (selected) {
      const updatedSelected = nextRows.find((item) => item.user_id === selected.user_id) || null;
      setSelected(updatedSelected);
    }

    setLoading(false);
  }

  async function loadSignupRolloutStatus() {
    setRolloutLoading(true);
    setRolloutError("");

    const { data, error } = await supabase.rpc(
      "admin_get_signup_rollout_status"
    );

    if (error) {
      logSupabaseError("load signup rollout status error:", error);
      setRolloutStatus(null);
      setRolloutError(
        describeSupabaseError(error, language) || t.admin_memberships.read_rollout_failed
      );
      setRolloutLoading(false);
      return;
    }

    setRolloutStatus(firstRpcRow<SignupRolloutStatus>(data));
    setRolloutLoading(false);
  }

  async function loadPendingPaymentQueue() {
    setPendingPaymentLoading(true);
    const { data, error } = await supabase.rpc("admin_list_membership_payment_queue_v2");

    if (error) {
      logSupabaseError("load pending membership payment queue error:", error);
      setPendingPaymentRows([]);
      setErrorMsg(t.admin_memberships.pending_payment_load_failed);
    } else {
      setPendingPaymentRows(Array.isArray(data) ? (data as PendingPaymentQueueRow[]) : []);
    }
    setPendingPaymentLoading(false);
  }

  async function loadRefundQueue() {
    setRefundLoading(true);
    const { data, error } = await supabase.rpc("admin_list_membership_refund_queue", {
      p_limit: 100,
    });

    if (error) {
      logSupabaseError("load membership refund queue error:", error);
      setRefundRows([]);
      setErrorMsg(t.admin_memberships.refund_queue_load_failed);
    } else {
      setRefundRows(
        Array.isArray(data) ? (data as MembershipRefundQueueRow[]) : []
      );
    }
    setRefundLoading(false);
  }

  async function loadOperationsDashboard() {
    setOperationsLoading(true);
    setOperationsError("");

    const { data, error } = await supabase.rpc("admin_get_operations_dashboard", {
      p_days: 30,
    });

    if (error) {
      logSupabaseError("load admin operations dashboard error:", error);
      setOperationsDashboard(null);
      setOperationsError(t.admin_memberships.operations_load_failed);
    } else {
      setOperationsDashboard(
        firstRpcRow<AdminOperationsDashboard>(
          data as AdminOperationsDashboard | AdminOperationsDashboard[] | null
        )
      );
    }

    setOperationsLoading(false);
  }

  async function loadAccountDeletionAudits() {
    setDeletionAuditLoading(true);

    const { data, error } = await supabase.rpc("admin_list_account_deletions", {
      p_limit: 30,
    });

    if (error) {
      logSupabaseError("load account deletion audits error:", error);
      setDeletionAuditRows([]);
    } else {
      setDeletionAuditRows(
        Array.isArray(data) ? (data as AccountDeletionAuditRow[]) : []
      );
    }

    setDeletionAuditLoading(false);
  }

  async function openPaymentProof(row: PendingPaymentQueueRow) {
    if (!row.proof_path) {
      showToast(t.admin_memberships.payment_proof_missing);
      return;
    }

    const proofWindow = window.open("about:blank", "_blank");
    if (proofWindow) proofWindow.opener = null;

    const { data, error } = await supabase.storage
      .from("payment-proofs")
      .createSignedUrl(row.proof_path, 300);

    if (error || !data?.signedUrl) {
      proofWindow?.close();
      logSupabaseError("create payment proof signed url error:", error);
      showToast(t.admin_memberships.payment_proof_open_failed);
      return;
    }

    if (proofWindow) {
      proofWindow.location.replace(data.signedUrl);
    } else {
      window.location.assign(data.signedUrl);
    }
  }

  async function confirmPendingPayment(row: PendingPaymentQueueRow) {
    if (pendingPaymentActionId) return;
    const confirmed = window.confirm(
      `${t.admin_memberships.confirm_submitted_payment_prefix}${row.email || row.user_id}${t.admin_memberships.confirm_submitted_payment_suffix}\n${row.order_number || ""}\n${formatPaymentAmount(row.amount, row.currency)}\n\n${t.admin_memberships.confirm_submitted_payment_notice}`
    );
    if (!confirmed) return;

    setPendingPaymentActionId(row.id);
    const { data, error } = await supabase.rpc(
      "admin_confirm_submitted_membership_payment_json",
      { p_payment_id: row.id }
    );
    const result = firstRpcRow<{ ok?: boolean; error_message?: string | null }>(data);

    if (error || !result?.ok) {
      logSupabaseError("confirm submitted membership payment error:", error || result);
      showToast(t.admin_memberships.confirm_submitted_payment_failed);
    } else {
      showToast(t.admin_memberships.confirm_submitted_payment_success);
      await Promise.all([
        loadPendingPaymentQueue(),
        loadRows(keyword),
        loadOperationsDashboard(),
      ]);
    }
    setPendingPaymentActionId(null);
  }

  async function requestPaymentUpdate(row: PendingPaymentQueueRow) {
    if (pendingPaymentActionId) return;
    const note = window.prompt(
      t.admin_memberships.request_payment_update_prompt,
      t.admin_memberships.request_payment_update_default
    )?.trim();
    if (!note) return;

    setPendingPaymentActionId(row.id);
    const { data, error } = await supabase.rpc(
      "admin_request_membership_payment_update_json",
      { p_payment_id: row.id, p_review_note: note }
    );
    const result = firstRpcRow<{ ok?: boolean; error_message?: string | null }>(data);

    if (error || !result?.ok) {
      logSupabaseError("request membership payment update error:", error || result);
      showToast(t.admin_memberships.request_payment_update_failed);
    } else {
      showToast(t.admin_memberships.request_payment_update_success);
      await Promise.all([loadPendingPaymentQueue(), loadOperationsDashboard()]);
    }
    setPendingPaymentActionId(null);
  }

  async function refreshAfterRefundAction(userId: string) {
    const tasks: Promise<void>[] = [
      loadRefundQueue(),
      loadRows(keyword),
      loadOperationsDashboard(),
    ];
    if (selected?.user_id === userId) tasks.push(loadPaymentRows(userId));
    await Promise.all(tasks);
  }

  async function approveRefund(row: MembershipRefundQueueRow) {
    if (refundActionId || row.status !== "submitted") return;
    const confirmed = window.confirm(
      `${t.admin_memberships.refund_approve_confirm_prefix}${formatPaymentAmount(
        row.refund_amount,
        row.currency
      )}${t.admin_memberships.refund_approve_confirm_suffix}\n\n${t.admin_memberships.refund_approve_notice}`
    );
    if (!confirmed) return;

    setRefundActionId(row.id);
    const { data, error } = await supabase.rpc(
      "admin_approve_membership_refund_json",
      { p_request_id: row.id, p_review_note: null }
    );
    const result = firstRpcRow<{ ok?: boolean; error_message?: string | null }>(data);

    if (error || !result?.ok) {
      logSupabaseError("approve membership refund error:", error || result);
      showToast(t.admin_memberships.refund_approve_failed);
    } else {
      showToast(t.admin_memberships.refund_approve_success);
      await refreshAfterRefundAction(row.user_id);
    }
    setRefundActionId(null);
  }

  async function rejectRefund(row: MembershipRefundQueueRow) {
    if (refundActionId || row.status !== "submitted") return;
    const note = window.prompt(t.admin_memberships.refund_reject_prompt)?.trim();
    if (!note) return;

    setRefundActionId(row.id);
    const { data, error } = await supabase.rpc(
      "admin_reject_membership_refund_json",
      { p_request_id: row.id, p_review_note: note }
    );
    const result = firstRpcRow<{ ok?: boolean; error_message?: string | null }>(data);

    if (error || !result?.ok) {
      logSupabaseError("reject membership refund error:", error || result);
      showToast(t.admin_memberships.refund_reject_failed);
    } else {
      showToast(t.admin_memberships.refund_reject_success);
      await refreshAfterRefundAction(row.user_id);
    }
    setRefundActionId(null);
  }

  async function completeRefund(row: MembershipRefundQueueRow) {
    if (refundActionId || row.status !== "approved_pending_refund") return;
    const expectedAmount = Number(row.refund_amount || 0).toFixed(2);
    const refundReference = window.prompt(
      t.admin_memberships.refund_reference_prompt
    )?.trim();
    if (!refundReference) return;

    const amountText = window.prompt(
      t.admin_memberships.refund_amount_prompt,
      expectedAmount
    )?.trim();
    if (!amountText || Number(amountText) !== Number(expectedAmount)) {
      showToast(t.admin_memberships.refund_amount_mismatch);
      return;
    }

    const confirmed = window.confirm(
      `${t.admin_memberships.refund_complete_confirm_prefix}${formatPaymentAmount(
        expectedAmount,
        row.currency
      )}${t.admin_memberships.refund_complete_confirm_suffix}\n${refundReference}\n\n${t.admin_memberships.refund_complete_notice}`
    );
    if (!confirmed) return;

    setRefundActionId(row.id);
    const { data, error } = await supabase.rpc(
      "admin_complete_membership_refund_json",
      {
        p_request_id: row.id,
        p_refund_reference: refundReference,
        p_confirmed_amount: Number(expectedAmount),
      }
    );
    const result = firstRpcRow<{ ok?: boolean; error_message?: string | null }>(data);

    if (error || !result?.ok) {
      logSupabaseError("complete membership refund error:", error || result);
      showToast(t.admin_memberships.refund_complete_failed);
    } else {
      showToast(t.admin_memberships.refund_complete_success);
      await refreshAfterRefundAction(row.user_id);
    }
    setRefundActionId(null);
  }

  async function loadPaymentRows(userId: string) {
    setPaymentLoading(true);

    const { data, error } = await supabase
      .from("membership_payments")
      .select("*")
      .eq("user_id", userId)
      .in("status", ["confirmed", "refunded", "canceled"])
      .order("paid_at", { ascending: false })
      .limit(10);

    if (error) {
      logSupabaseError("load membership payments error:", error);
      setPaymentRows([]);
      setPaymentLoading(false);
      return;
    }

    setPaymentRows(Array.isArray(data) ? (data as MembershipPaymentRow[]) : []);
    setPaymentLoading(false);
  }

  useEffect(() => {
    async function init() {
      setChecking(true);
      setErrorMsg("");

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) {
        logSupabaseError("load admin user error:", userError);
      }

      if (!user) {
        setCurrentUserId("");
        setUserEmail("");
        setIsAdmin(false);
        setChecking(false);
        setLoading(false);
        return;
      }

      setCurrentUserId(user.id);
      setUserEmail(user.email || "");

      const { data: adminData, error: adminError } = await supabase.rpc("is_app_admin", {
        p_user_id: user.id,
      });

      if (adminError) {
        logSupabaseError("check admin error:", adminError);
        setIsAdmin(false);
        setErrorMsg(
          describeSupabaseError(adminError, language) ||
            t.admin_memberships.verify_admin_failed
        );
        setChecking(false);
        setLoading(false);
        return;
      }

      const allowed = Boolean(adminData);
      setIsAdmin(allowed);
      setChecking(false);

      if (allowed) {
        await Promise.all([
          loadPendingPaymentQueue(),
          loadRefundQueue(),
          loadRows(""),
          loadSignupRolloutStatus(),
          loadOperationsDashboard(),
          loadAccountDeletionAudits(),
        ]);
      } else {
        setLoading(false);
      }
    }

    void init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selected) {
      setPaymentRows([]);
      return;
    }

    const nextPlan = getPreset(selected.plan).key;
    const preset = getPreset(nextPlan);
    const nextPaymentPlan = nextPlan === "trial" ? "basic" : (nextPlan as PaymentPlanKey);
    const today = new Date().toISOString().slice(0, 10);

    setPlan(nextPlan);
    setStorageLimitBytes(String(Number(selected.storage_limit_bytes || preset.storageLimitBytes)));
    setBaseMarketPostLimit(String(Number(selected.base_market_post_limit || preset.baseMarketPostLimit)));
    setPaidUntilDate(toDateInputValue(selected.paid_until));

    setPaymentPlan(nextPaymentPlan);
    setPaymentCurrency("CNY");
    setPaymentAmount(String(getDefaultPaymentAmount(nextPaymentPlan, "CNY")));
    setPaymentMethod("manual");
    setPaymentReference(buildPaymentReference(selected, "manual", today));
    setPaymentNote("");
    setPaymentPaidAtDate(today);
    setPaymentServiceMonths("12");

    void loadPaymentRows(selected.user_id);
  }, [selected]);

  const selectedUsageText = useMemo(() => {
    if (!selected) return "";
    return `${formatStorageBytes(selected.storage_used || 0)} / ${formatStorageBytes(selected.storage_limit_bytes || 0)}`;
  }, [selected]);

  const operationsMetrics = operationsDashboard?.metrics || null;
  const openRefundCount = refundRows.filter((row) =>
    row.status === "submitted" || row.status === "approved_pending_refund"
  ).length;
  const maxDailyPageViews = Math.max(
    1,
    ...(operationsDashboard?.daily_traffic || []).map((item) =>
      Number(item.page_views || 0)
    )
  );
  const platformStorageBytes = Number(
    operationsMetrics?.platform_storage_bytes ??
      rolloutStatus?.platform_storage_bytes ??
      0
  );
  const platformStorageLimitBytes = Number(
    operationsMetrics?.platform_storage_pause_bytes ??
      rolloutStatus?.platform_storage_pause_bytes ??
      0
  );
  const platformStoragePercent = platformStorageLimitBytes
    ? Math.min(100, Math.max(0, (platformStorageBytes / platformStorageLimitBytes) * 100))
    : 0;

  function handleApplyPreset(nextPlan: PlanKey) {
    const preset = getPreset(nextPlan);
    const nextPaidUntil = preset.paidMonths ? addMonths(new Date(), preset.paidMonths).toISOString().slice(0, 10) : "";
    setPlan(nextPlan);
    setStorageLimitBytes(String(preset.storageLimitBytes));
    setBaseMarketPostLimit(String(preset.baseMarketPostLimit));
    setPaidUntilDate(nextPaidUntil);

    if (nextPlan !== "trial") {
      const nextPaymentPlan = nextPlan as PaymentPlanKey;
      setPaymentPlan(nextPaymentPlan);
      setPaymentAmount(String(getDefaultPaymentAmount(nextPaymentPlan, paymentCurrency)));
      setPaymentServiceMonths("12");
    }
  }

  function handlePaymentPlanChange(nextPlan: PaymentPlanKey) {
    const preset = getPreset(nextPlan);
    const nextPaidUntil = preset.paidMonths ? addMonths(new Date(), preset.paidMonths).toISOString().slice(0, 10) : "";

    setPaymentPlan(nextPlan);
    setPaymentAmount(String(getDefaultPaymentAmount(nextPlan, paymentCurrency)));
    setPaymentServiceMonths("12");
    setPlan(nextPlan);
    setStorageLimitBytes(String(preset.storageLimitBytes));
    setBaseMarketPostLimit(String(preset.baseMarketPostLimit));
    setPaidUntilDate(nextPaidUntil);
  }

  function handlePaymentCurrencyChange(nextCurrency: PaymentCurrency) {
    const nextMethod: PaymentMethod = nextCurrency === "USD" ? "paypal" : paymentMethod;
    setPaymentCurrency(nextCurrency);
    setPaymentAmount(String(getDefaultPaymentAmount(paymentPlan, nextCurrency)));
    setPaymentMethod(nextMethod);
    if (selected) {
      setPaymentReference(buildPaymentReference(selected, nextMethod, paymentPaidAtDate));
    }
  }

  function regeneratePaymentReference(nextMethod = paymentMethod, nextPaidAtDate = paymentPaidAtDate) {
    if (!selected) return;
    setPaymentReference(buildPaymentReference(selected, nextMethod, nextPaidAtDate));
  }

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await loadRows(keyword);
  }

  async function handleSave() {
    if (!selected || saving) return;

    const safeStorageLimit = Math.max(0, Math.round(Number(storageLimitBytes || 0)));
    const safeMarketLimit = Math.max(0, Math.round(Number(baseMarketPostLimit || 0)));
    const paidUntilIso = dateInputToIso(paidUntilDate);

    if (!plan) {
      showToast(t.admin_memberships.select_plan);
      return;
    }

    if (plan !== "trial" && !paidUntilIso) {
      showToast(t.admin_memberships.enter_paid_until);
      return;
    }

    if (!Number.isFinite(safeStorageLimit) || safeStorageLimit <= 0) {
      showToast(t.admin_memberships.storage_positive);
      return;
    }

    if (!Number.isFinite(safeMarketLimit) || safeMarketLimit < 0) {
      showToast(t.admin_memberships.market_nonnegative);
      return;
    }

    setSaving(true);
    setErrorMsg("");

    const { data, error } = await supabase.rpc("admin_update_user_membership_json", {
      p_user_id: selected.user_id,
      p_plan: plan,
      p_paid_until: plan === "trial" ? null : paidUntilIso,
      p_storage_limit_bytes: safeStorageLimit,
      p_base_market_post_limit: safeMarketLimit,
    });

    if (error) {
      logSupabaseError("admin update membership rpc error:", error);
      setErrorMsg(describeSupabaseError(error, language) || t.admin_memberships.update_failed);
      showToast(t.admin_memberships.update_failed);
      setSaving(false);
      return;
    }

    const rawResult = firstRpcRow<unknown>(data as unknown);
    const result =
      rawResult && typeof rawResult === "object"
        ? (rawResult as SafeUpdateResult)
        : ({
            ok: false,
            error_message: "empty_rpc_result",
            error_detail: typeof rawResult === "undefined" ? "undefined" : JSON.stringify(rawResult),
          } as SafeUpdateResult);

    if (!result.ok) {
      const message =
        [result.error_message, result.error_detail]
          .filter(Boolean)
          .join(language === "en" ? "; " : "；") || t.admin_memberships.update_failed;
      setErrorMsg(message);
      showToast(t.admin_memberships.update_failed);
      setSaving(false);
      return;
    }

    showToast(t.admin_memberships.updated);
    await loadRows(keyword);
    setSaving(false);
  }

  function openDeleteMembershipDialog(row: AdminMembershipRow) {
    if (row.user_id === currentUserId) {
      showToast(t.admin_memberships.cannot_delete_self);
      return;
    }

    if (row.status === "canceled") return;

    if (row.plan === "admin") {
      showToast(t.admin_memberships.cannot_delete_admin);
      return;
    }

    setDeleteTarget(row);
  }

  function closeDeleteMembershipDialog() {
    if (deleteSaving) return;
    setDeleteTarget(null);
  }

  async function handleDeleteMembership() {
    if (!deleteTarget || deleteSaving) return;

    setDeleteSaving(true);
    setErrorMsg("");

    try {
      const response = await fetch("/api/admin/memberships/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: deleteTarget.user_id }),
      });

      const result = await response.json().catch(() => null) as { error?: string } | null;

      if (!response.ok) {
        const message =
          language === "en"
            ? t.admin_memberships.delete_failed
            : result?.error || t.admin_memberships.delete_failed;
        setErrorMsg(message);
        showToast(message);
        return;
      }

      showToast(t.admin_memberships.delete_success);
      setDeleteTarget(null);
      await Promise.all([loadRows(keyword), loadOperationsDashboard()]);
    } catch {
      setErrorMsg(t.admin_memberships.delete_retry);
      showToast(t.admin_memberships.delete_retry);
    } finally {
      setDeleteSaving(false);
    }
  }

  function openAccountDeletionDialog(row: AdminMembershipRow) {
    if (!canPermanentlyDeleteAccount(row, currentUserId)) {
      showToast(
        row.user_id === currentUserId
          ? t.admin_memberships.cannot_delete_account_self
          : t.admin_memberships.cannot_delete_admin
      );
      return;
    }

    setAccountDeleteTarget(row);
    setAccountDeleteConfirmation("");
    setAccountDeleteAcknowledged(false);
  }

  function closeAccountDeletionDialog() {
    if (accountDeleteSaving) return;
    setAccountDeleteTarget(null);
    setAccountDeleteConfirmation("");
    setAccountDeleteAcknowledged(false);
  }

  async function handlePermanentAccountDeletion() {
    if (!accountDeleteTarget || accountDeleteSaving) return;

    const requiredConfirmation =
      accountDeleteTarget.account_number || accountDeleteTarget.user_id;

    if (
      !accountDeleteAcknowledged ||
      accountDeleteConfirmation.trim() !== requiredConfirmation
    ) {
      showToast(t.admin_memberships.account_delete_confirmation_mismatch);
      return;
    }

    setAccountDeleteSaving(true);
    setErrorMsg("");

    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session?.access_token) {
        const message = t.admin_memberships.account_delete_relogin;
        setErrorMsg(message);
        showToast(message);
        return;
      }

      const response = await fetch("/api/account/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          confirm: true,
          targetUserId: accountDeleteTarget.user_id,
          confirmPermanent: true,
          confirmationText: accountDeleteConfirmation.trim(),
        }),
      });

      const result = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;

      if (!response.ok) {
        const message =
          language === "en"
            ? t.admin_memberships.account_delete_failed
            : result?.error || t.admin_memberships.account_delete_failed;
        setErrorMsg(message);
        showToast(message);
        return;
      }

      showToast(t.admin_memberships.account_delete_success);
      setSelected(null);
      setAccountDeleteTarget(null);
      setAccountDeleteConfirmation("");
      setAccountDeleteAcknowledged(false);
      await Promise.all([
        loadRows(keyword),
        loadSignupRolloutStatus(),
        loadPendingPaymentQueue(),
        loadOperationsDashboard(),
        loadAccountDeletionAudits(),
      ]);
    } catch {
      setErrorMsg(t.admin_memberships.account_delete_failed);
      showToast(t.admin_memberships.account_delete_failed);
    } finally {
      setAccountDeleteSaving(false);
    }
  }

  async function handleCreatePayment() {
    if (!selected || paymentSaving || paymentSubmittingRef.current) return;

    const amountValue = Number(paymentAmount || 0);
    const paidAtIso = dateInputToIso(paymentPaidAtDate) || new Date().toISOString();
    const serviceMonthsValue = Math.max(1, Math.round(Number(paymentServiceMonths || 12)));
    const safeStorageLimit = Math.max(0, Math.round(Number(storageLimitBytes || 0)));
    const safeMarketLimit = Math.max(0, Math.round(Number(baseMarketPostLimit || 0)));
    const finalPaymentReference = paymentReference.trim() || buildPaymentReference(selected, paymentMethod, paymentPaidAtDate);

    if (!paymentReference.trim()) {
      setPaymentReference(finalPaymentReference);
    }

    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      showToast(t.admin_memberships.amount_positive);
      return;
    }

    if (!Number.isFinite(serviceMonthsValue) || serviceMonthsValue <= 0) {
      showToast(t.admin_memberships.months_positive);
      return;
    }

    if (!Number.isFinite(safeStorageLimit) || safeStorageLimit <= 0) {
      showToast(t.admin_memberships.storage_positive);
      return;
    }

    if (!Number.isFinite(safeMarketLimit) || safeMarketLimit < 0) {
      showToast(t.admin_memberships.market_nonnegative);
      return;
    }

    const confirmText = [
      `${t.admin_memberships.payment_confirm_prefix}${
        selected.username || selected.email || selected.user_id
      }${t.admin_memberships.payment_confirm_suffix}`,
      `${t.admin_memberships.plan_prefix}${getPaymentPlanLabel(paymentPlan, language)}`,
      `${t.admin_memberships.amount_prefix}${formatPaymentAmount(
        amountValue,
        paymentCurrency
      )}`,
      `${t.admin_memberships.payment_method_prefix}${getPaymentMethodLabel(
        paymentMethod,
        language
      )}`,
      `${t.admin_memberships.reference_prefix}${finalPaymentReference}`,
      `${t.admin_memberships.months_prefix}${serviceMonthsValue} ${t.admin_memberships.months_suffix}`,
      `${t.admin_memberships.storage_prefix}${formatStorageBytes(safeStorageLimit)}`,
      `${t.admin_memberships.market_limit_prefix}${safeMarketLimit} ${t.admin_memberships.post_unit}`,
      "",
      t.admin_memberships.confirm_payment_notice,
    ].join("\n");

    if (!window.confirm(confirmText)) return;

    paymentSubmittingRef.current = true;
    setPaymentSaving(true);
    setErrorMsg("");

    try {
      const { data, error } = await supabase.rpc("admin_confirm_membership_payment_json", {
        p_user_id: selected.user_id,
        p_plan: paymentPlan,
        p_amount: amountValue,
        p_currency: paymentCurrency,
        p_payment_method: paymentMethod,
        p_payment_reference: finalPaymentReference,
        p_note: paymentNote.trim() || null,
        p_paid_at: paidAtIso,
        p_service_months: serviceMonthsValue,
        p_storage_limit_bytes: safeStorageLimit,
        p_base_market_post_limit: safeMarketLimit,
      });

      if (error) {
        logSupabaseError("admin create payment rpc error:", error);
        setErrorMsg(
          describeSupabaseError(error, language) || t.admin_memberships.payment_record_failed
        );
        showToast(t.admin_memberships.payment_record_failed);
        return;
      }

      const rawResult = firstRpcRow<unknown>(data as unknown);
      const result =
        rawResult && typeof rawResult === "object"
          ? (rawResult as PaymentCreateResult)
          : ({
              ok: false,
              error_message: "empty_rpc_result",
              error_detail: typeof rawResult === "undefined" ? "undefined" : JSON.stringify(rawResult),
            } as PaymentCreateResult);

      if (!result.ok) {
        const message =
          [result.error_message, result.error_detail]
            .filter(Boolean)
            .join(language === "en" ? "; " : "；") ||
          t.admin_memberships.payment_record_failed;
        setErrorMsg(message);
        showToast(t.admin_memberships.payment_record_failed);
        return;
      }

      showToast(t.admin_memberships.payment_success);
      setPaymentReference(buildPaymentReference(selected, paymentMethod, paymentPaidAtDate));
      setPaymentNote("");
      await Promise.all([
        loadPaymentRows(selected.user_id),
        loadRows(keyword),
        loadOperationsDashboard(),
      ]);
    } finally {
      paymentSubmittingRef.current = false;
      setPaymentSaving(false);
    }
  }

  if (checking) {
    return <main style={currentPageStyle}>{t.admin_memberships.checking_admin}</main>;
  }

  if (!userEmail) {
    return (
      <main style={currentPageStyle}>
        <section style={noticeCardStyle}>
          <h1 style={titleStyle}>{t.admin_memberships.admin_membership_management}</h1>
          <p style={mutedTextStyle}>{t.admin_memberships.sign_in_admin}</p>
          <Link href={buildLoginHref("/admin/memberships")} style={primaryButtonStyle}>{t.admin_memberships.sign_in}</Link>
        </section>
      </main>
    );
  }

  if (!isAdmin) {
    return (
      <main style={currentPageStyle}>
        <section style={noticeCardStyle}>
          <h1 style={titleStyle}>{t.admin_memberships.no_admin_access}</h1>
          <p style={mutedTextStyle}>{t.admin_memberships.current_account_prefix}{userEmail}</p>
          <Link href="/profile" style={secondaryButtonStyle}>{t.admin_memberships.back_profile}</Link>
        </section>
      </main>
    );
  }

  return (
    <main style={currentPageStyle}>
      <Link href="/profile" style={adminBackLinkStyle}>
        <UiIcon name="arrow-left" size={15} />
        {t.admin_memberships.back_profile}
      </Link>
      <section style={currentHeaderStyle}>
        <div>
          <div style={eyebrowStyle}>{t.admin_memberships.admin_eyebrow}</div>
          <h1 style={titleStyle}>{t.admin_memberships.title}</h1>
          <p style={mutedTextStyle}>
            {t.admin_memberships.intro}
          </p>
        </div>
        <Link href="/membership" style={secondaryButtonStyle}>{t.admin_memberships.view_membership_page}</Link>
      </section>

      <nav
        id="admin-section-navigation"
        style={adminAnchorNavStyle(isMobileViewport)}
        aria-label={t.admin_memberships.admin_sections_aria}
      >
        <a href="#overview" style={adminAnchorLinkStyle(activeAdminSection === "overview")} onClick={() => setActiveAdminSection("overview")}>{t.admin_memberships.nav_overview}</a>
        <a href="#traffic" style={adminAnchorLinkStyle(activeAdminSection === "traffic")} onClick={() => setActiveAdminSection("traffic")}>{t.admin_memberships.nav_traffic}</a>
        <a href="#registrations" style={adminAnchorLinkStyle(activeAdminSection === "registrations")} onClick={() => setActiveAdminSection("registrations")}>{t.admin_memberships.nav_registrations}</a>
        <a href="#payment-review" style={adminAnchorLinkStyle(activeAdminSection === "payment-review")} onClick={() => setActiveAdminSection("payment-review")}>{t.admin_memberships.nav_payments}</a>
        <a href="#refund-review" style={adminAnchorLinkStyle(activeAdminSection === "refund-review")} onClick={() => setActiveAdminSection("refund-review")}>{t.admin_memberships.nav_refunds}</a>
        <a href="#capacity" style={adminAnchorLinkStyle(activeAdminSection === "capacity")} onClick={() => setActiveAdminSection("capacity")}>{t.admin_memberships.nav_capacity}</a>
        <a href="#account-closures" style={adminAnchorLinkStyle(activeAdminSection === "account-closures")} onClick={() => setActiveAdminSection("account-closures")}>{t.admin_memberships.nav_account_closures}</a>
      </nav>

      <section
        id="overview"
        style={{
          ...currentCardStyle,
          marginBottom: isMobileViewport ? 12 : 16,
          scrollMarginTop: adminSectionScrollMarginTop,
        }}
      >
        <div style={detailTopStyle}>
          <div>
            <div style={sectionLabelStyle}>{t.admin_memberships.operations_eyebrow}</div>
            <h2 style={sectionTitleStyle}>{t.admin_memberships.operations_title}</h2>
            <p style={smallTextStyle}>{t.admin_memberships.operations_intro}</p>
          </div>
          <button
            type="button"
            style={secondaryButtonStyle}
            onClick={() => void Promise.all([
              loadOperationsDashboard(),
              loadSignupRolloutStatus(),
              loadPendingPaymentQueue(),
              loadRefundQueue(),
            ])}
            disabled={operationsLoading}
          >
            {operationsLoading
              ? t.admin_memberships.reading
              : t.admin_memberships.refresh_dashboard}
          </button>
        </div>

        {operationsError ? <p style={errorStyle}>{operationsError}</p> : null}

        <div style={currentOperationsGridStyle}>
          <MetricCard
            label={t.admin_memberships.views_today}
            value={formatAdminCount(operationsMetrics?.page_views_today, language)}
            hint={`${formatAdminCount(operationsMetrics?.page_views_period, language)} ${t.admin_memberships.views_30d_suffix}`}
          />
          <MetricCard
            label={t.admin_memberships.visitors_7d}
            value={formatAdminCount(operationsMetrics?.visitors_7d, language)}
            hint={t.admin_memberships.visitors_privacy_hint}
          />
          <MetricCard
            label={t.admin_memberships.registered_accounts}
            value={formatAdminCount(operationsMetrics?.registered_total, language)}
            hint={`+${formatAdminCount(operationsMetrics?.registered_7d, language)} ${t.admin_memberships.in_last_7d}`}
          />
          <MetricCard
            label={t.admin_memberships.active_cloud_members}
            value={formatAdminCount(operationsMetrics?.cloud_members, language)}
            hint={t.admin_memberships.paid_members_hint}
          />
          <MetricCard
            label={t.admin_memberships.awaiting_payment_confirmation}
            value={formatAdminCount(
              operationsMetrics?.payments_awaiting_confirmation ?? pendingPaymentRows.length,
              language
            )}
            hint={t.admin_memberships.payment_queue_hint}
            tone={Number(operationsMetrics?.payments_awaiting_confirmation || pendingPaymentRows.length) > 0 ? "attention" : "normal"}
          />
          <MetricCard
            label={t.admin_memberships.awaiting_refunds}
            value={formatAdminCount(openRefundCount, language)}
            hint={t.admin_memberships.refund_queue_hint}
            tone={openRefundCount > 0 ? "attention" : "normal"}
          />
          <MetricCard
            label={t.admin_memberships.apk_downloads}
            value={formatAdminCount(operationsMetrics?.apk_download_total, language)}
            hint={`${formatAdminCount(operationsMetrics?.apk_download_30d, language)} ${t.admin_memberships.in_last_30d}`}
          />
          <MetricCard
            label={t.admin_memberships.actual_storage}
            value={formatStorageBytes(platformStorageBytes)}
            hint={`${platformStoragePercent.toFixed(1)}% · ${t.admin_memberships.safety_line} ${formatStorageBytes(platformStorageLimitBytes)}`}
          />
          <MetricCard
            label={t.admin_memberships.account_closures_30d}
            value={formatAdminCount(operationsMetrics?.account_deletions_30d, language)}
            hint={`${formatAdminCount(operationsMetrics?.account_deletion_failures, language)} ${t.admin_memberships.failed_operations}`}
            tone={Number(operationsMetrics?.account_deletion_failures || 0) > 0 ? "danger" : "normal"}
          />
        </div>

        <div style={storageProgressBlockStyle}>
          <div style={storageProgressMetaStyle}>
            <span>{t.admin_memberships.website_storage_usage}</span>
            <strong>{formatStorageBytes(platformStorageBytes)} / {formatStorageBytes(platformStorageLimitBytes)}</strong>
          </div>
          <div style={storageProgressTrackStyle}>
            <span
              style={storageProgressFillStyle(platformStoragePercent)}
              aria-label={`${t.admin_memberships.website_storage_usage} ${platformStoragePercent.toFixed(1)}%`}
            />
          </div>
        </div>
      </section>

      <section
        id="traffic"
        style={{
          ...currentCardStyle,
          marginBottom: isMobileViewport ? 12 : 16,
          scrollMarginTop: adminSectionScrollMarginTop,
        }}
      >
        <div style={detailTopStyle}>
          <div>
            <div style={sectionLabelStyle}>{t.admin_memberships.traffic_eyebrow}</div>
            <h2 style={sectionTitleStyle}>{t.admin_memberships.traffic_title}</h2>
            <p style={smallTextStyle}>{t.admin_memberships.traffic_intro}</p>
          </div>
          <span style={pillStyle}>{t.admin_memberships.last_14_days}</span>
        </div>

        <div style={currentTrafficLayoutStyle}>
          <div style={trafficPanelStyle}>
            <div style={trafficChartStyle}>
              {(operationsDashboard?.daily_traffic || []).map((item) => {
                const views = Number(item.page_views || 0);
                const visitors = Number(item.visitors || 0);
                const barHeight = Math.max(3, (views / maxDailyPageViews) * 100);
                return (
                  <div
                    key={item.day}
                    style={trafficBarColumnStyle}
                    title={`${item.day} · ${views} ${t.admin_memberships.page_view_unit} · ${visitors} ${t.admin_memberships.visitor_unit}`}
                  >
                    <span style={trafficBarValueStyle}>{views || ""}</span>
                    <span style={trafficBarStyle(barHeight)} />
                    <span style={trafficBarLabelStyle}>{String(item.day).slice(5)}</span>
                  </div>
                );
              })}
              {!operationsLoading && (operationsDashboard?.daily_traffic || []).length === 0 ? (
                <div style={chartEmptyStyle}>{t.admin_memberships.no_traffic_yet}</div>
              ) : null}
            </div>
          </div>

          <div style={trafficPanelStyle}>
            <h3 style={subsectionTitleStyle}>{t.admin_memberships.top_pages}</h3>
            <div style={topPageListStyle}>
              {(operationsDashboard?.top_pages || []).map((item) => (
                <div key={item.path} style={topPageRowStyle}>
                  <code style={topPagePathStyle}>{item.path}</code>
                  <span style={topPageMetricStyle}>
                    {formatAdminCount(item.page_views, language)} / {formatAdminCount(item.visitors, language)}
                  </span>
                </div>
              ))}
              {!operationsLoading && (operationsDashboard?.top_pages || []).length === 0 ? (
                <div style={smallTextStyle}>{t.admin_memberships.no_top_pages_yet}</div>
              ) : null}
            </div>
            <div style={topPageLegendStyle}>
              {t.admin_memberships.top_page_legend}
            </div>
          </div>
        </div>

        <p style={privacyNoticeStyle}>
          {t.admin_memberships.analytics_privacy_notice}
          {operationsMetrics?.tracking_started_at
            ? ` ${t.admin_memberships.tracking_since}${formatMembershipDate(operationsMetrics.tracking_started_at, language)}`
            : ` ${t.admin_memberships.tracking_starts_after_release}`}
        </p>
      </section>

      <section
        id="payment-review"
        style={{
          ...currentCardStyle,
          ...pendingPaymentQueueStyle(pendingPaymentRows.length > 0),
          marginBottom: isMobileViewport ? 12 : 16,
          scrollMarginTop: adminSectionScrollMarginTop,
        }}
      >
        <div style={detailTopStyle}>
          <div>
            <div style={sectionLabelStyle}>{t.admin_memberships.payment_review_eyebrow}</div>
            <h2 style={sectionTitleStyle}>
              {t.admin_memberships.pending_payment_title}（{pendingPaymentRows.length}）
            </h2>
            <p style={smallTextStyle}>{t.admin_memberships.pending_payment_intro}</p>
          </div>
          <button
            type="button"
            style={secondaryButtonStyle}
            onClick={() => void loadPendingPaymentQueue()}
            disabled={pendingPaymentLoading}
          >
            {pendingPaymentLoading ? t.admin_memberships.reading : t.admin_memberships.refresh_queue}
          </button>
        </div>

        {pendingPaymentLoading && pendingPaymentRows.length === 0 ? (
          <div style={emptyStyle}>{t.admin_memberships.loading_pending_payments}</div>
        ) : pendingPaymentRows.length === 0 ? (
          <div style={pendingPaymentEmptyStyle}>{t.admin_memberships.no_pending_payments}</div>
        ) : (
          <div style={pendingPaymentListStyle}>
            {pendingPaymentRows.map((row) => (
              <article key={row.id} style={pendingPaymentCardStyle}>
                <div style={userTitleRowStyle}>
                  <strong style={userNameStyle}>{row.username || row.email || row.user_id}</strong>
                  <span style={pendingPaymentAmountStyle}>{formatPaymentAmount(row.amount, row.currency)}</span>
                </div>
                <div style={smallTextStyle}>{row.email || row.user_id}</div>
                <div style={pendingPaymentMetaStyle}>
                  <span>{t.admin_memberships.order_number_prefix}{row.order_number || t.admin_memberships.not_recorded}</span>
                  <span>{getPaymentMethodLabel(row.payment_method, language)}</span>
                  <span>{t.admin_memberships.submitted_at_prefix}{formatMembershipDate(row.submitted_at || row.created_at, language)}</span>
                </div>
                <div style={smallTextStyle}>
                  {t.admin_memberships.payment_destination_prefix}
                  <strong>{row.payment_destination_label || t.admin_memberships.not_recorded}</strong>
                  {row.payment_destination_version
                    ? ` · ${row.payment_destination_version}`
                    : ""}
                </div>
                {row.payment_reference ? (
                  <div style={smallTextStyle}>{t.admin_memberships.transaction_prefix}{row.payment_reference}</div>
                ) : null}
                <div style={pendingPaymentActionsStyle}>
                  <button type="button" style={secondaryButtonStyle} onClick={() => void openPaymentProof(row)}>
                    {t.admin_memberships.view_payment_proof}
                  </button>
                  <button
                    type="button"
                    style={primaryButtonStyle}
                    onClick={() => void confirmPendingPayment(row)}
                    disabled={pendingPaymentActionId !== null}
                  >
                    {pendingPaymentActionId === row.id ? t.admin_memberships.confirming : t.admin_memberships.confirm_and_open}
                  </button>
                  <button
                    type="button"
                    style={dangerMiniButtonStyle}
                    onClick={() => void requestPaymentUpdate(row)}
                    disabled={pendingPaymentActionId !== null}
                  >
                    {t.admin_memberships.request_more_proof}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section
        id="refund-review"
        style={{
          ...currentCardStyle,
          ...refundQueueStyle(openRefundCount > 0),
          marginBottom: isMobileViewport ? 12 : 16,
          scrollMarginTop: adminSectionScrollMarginTop,
        }}
      >
        <div style={detailTopStyle}>
          <div>
            <div style={sectionLabelStyle}>{t.admin_memberships.refund_review_eyebrow}</div>
            <h2 style={sectionTitleStyle}>
              {t.admin_memberships.refund_review_title}（{openRefundCount}）
            </h2>
            <p style={smallTextStyle}>{t.admin_memberships.refund_review_intro}</p>
          </div>
          <button
            type="button"
            style={secondaryButtonStyle}
            onClick={() => void loadRefundQueue()}
            disabled={refundLoading}
          >
            {refundLoading ? t.admin_memberships.reading : t.admin_memberships.refresh_refunds}
          </button>
        </div>

        <div style={refundWorkflowNoticeStyle}>
          <strong>{t.admin_memberships.refund_two_stage_title}</strong>
          <span>{t.admin_memberships.refund_two_stage_intro}</span>
          <Link href="/legal/refunds" style={anchorLinkStyle}>
            {t.admin_memberships.view_refund_policy}
          </Link>
        </div>

        {refundLoading && refundRows.length === 0 ? (
          <div style={emptyStyle}>{t.admin_memberships.loading_refunds}</div>
        ) : refundRows.length === 0 ? (
          <div style={pendingPaymentEmptyStyle}>{t.admin_memberships.no_refund_requests}</div>
        ) : (
          <div style={pendingPaymentListStyle}>
            {refundRows.map((row) => (
              <article key={row.id} style={refundCardStyle(row.status)}>
                <div style={userTitleRowStyle}>
                  <strong style={userNameStyle}>{row.username || row.email || row.user_id}</strong>
                  <span style={refundStatusStyle(row.status)}>
                    {getRefundStatusLabel(row.status, language)}
                  </span>
                </div>
                <div style={smallTextStyle}>{row.email || row.user_id}</div>
                <div style={refundAmountRowStyle}>
                  <span>{t.admin_memberships.refund_requested_amount}</span>
                  <strong>{formatPaymentAmount(row.refund_amount, row.currency)}</strong>
                  <small>
                    {t.admin_memberships.refund_original_amount}
                    {formatPaymentAmount(row.original_amount, row.currency)}
                  </small>
                </div>
                <div style={pendingPaymentMetaStyle}>
                  <span>{t.admin_memberships.order_number_prefix}{row.order_number || t.admin_memberships.not_recorded}</span>
                  <span>{getPaymentMethodLabel(row.payment_method, language)}</span>
                  <span>{getRefundPolicyLabel(row.policy_band, language)}</span>
                  <span>{t.admin_memberships.refund_requested_at}{formatMembershipDate(row.requested_at, language)}</span>
                </div>
                {row.payment_reference ? (
                  <div style={smallTextStyle}>{t.admin_memberships.transaction_prefix}{row.payment_reference}</div>
                ) : null}
                {row.request_reason ? (
                  <div style={refundReasonStyle}>
                    <strong>{t.admin_memberships.refund_reason}</strong>
                    <span>{row.request_reason}</span>
                  </div>
                ) : null}
                {row.review_note ? (
                  <div style={smallTextStyle}>{t.admin_memberships.refund_review_note}{row.review_note}</div>
                ) : null}
                {row.status === "approved_pending_refund" ? (
                  <div style={refundApprovedNoticeStyle}>
                    <strong>{t.admin_memberships.refund_external_action_title}</strong>
                    <span>
                      {t.admin_memberships.refund_external_action_prefix}
                      {formatPaymentAmount(row.refund_amount, row.currency)}
                      {t.admin_memberships.refund_external_action_suffix}
                    </span>
                    {row.payment_method === "paypal" && Number(row.refund_amount) < Number(row.original_amount) ? (
                      <span>{t.admin_memberships.paypal_partial_refund_notice}</span>
                    ) : null}
                  </div>
                ) : null}
                {row.refund_reference ? (
                  <div style={smallTextStyle}>{t.admin_memberships.refund_reference_prefix}{row.refund_reference}</div>
                ) : null}
                {row.status === "submitted" ? (
                  <div style={pendingPaymentActionsStyle}>
                    <button
                      type="button"
                      style={primaryButtonStyle}
                      onClick={() => void approveRefund(row)}
                      disabled={refundActionId !== null}
                    >
                      {refundActionId === row.id ? t.admin_memberships.processing_refund : t.admin_memberships.approve_refund}
                    </button>
                    <button
                      type="button"
                      style={dangerMiniButtonStyle}
                      onClick={() => void rejectRefund(row)}
                      disabled={refundActionId !== null}
                    >
                      {t.admin_memberships.reject_refund}
                    </button>
                  </div>
                ) : row.status === "approved_pending_refund" ? (
                  <div style={pendingPaymentActionsStyle}>
                    <button
                      type="button"
                      style={primaryButtonStyle}
                      onClick={() => void completeRefund(row)}
                      disabled={refundActionId !== null}
                    >
                      {refundActionId === row.id
                        ? t.admin_memberships.processing_refund
                        : t.admin_memberships.confirm_external_refund}
                    </button>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </section>

      <section
        id="capacity"
        style={{
          ...currentCardStyle,
          marginBottom: isMobileViewport ? 12 : 16,
          scrollMarginTop: adminSectionScrollMarginTop,
        }}
      >
        <div style={detailTopStyle}>
          <div>
            <div style={sectionLabelStyle}>{t.admin_memberships.rollout_eyebrow}</div>
            <h2 style={sectionTitleStyle}>{t.admin_memberships.rollout_title}</h2>
            <p style={smallTextStyle}>
              {t.admin_memberships.rollout_intro}
            </p>
          </div>
          <span style={pillStyle}>
            {rolloutLoading
              ? t.admin_memberships.reading
              : rolloutStatus?.trial_grants_paused
                ? getSignupTrialPauseLabel(rolloutStatus.pause_reason, language)
                : t.admin_memberships.grants_available}
          </span>
        </div>

        {rolloutError ? <p style={errorStyle}>{rolloutError}</p> : null}

        {rolloutStatus ? (
          <div style={currentSummaryGridStyle}>
            <InfoItem
              label={t.admin_memberships.formal_accounts}
              value={`${Number(rolloutStatus.formal_account_count || 0)}${
                language === "en" ? " " : ""
              }${t.admin_memberships.account_unit}`}
            />
            <InfoItem
              label={t.admin_memberships.internal_accounts}
              value={`${Number(rolloutStatus.internal_test_account_count || 0)}${
                language === "en" ? " " : ""
              }${t.admin_memberships.account_unit}`}
            />
            <InfoItem
              label={t.admin_memberships.trial_slots}
              value={`${Number(rolloutStatus.trial_slots_granted || 0)} / ${Number(rolloutStatus.trial_slot_limit || 0)}`}
            />
            <InfoItem
              label={t.admin_memberships.trial_window_remaining}
              value={`${Number(rolloutStatus.trial_slots_remaining || 0)}${
                language === "en" ? " " : ""
              }${t.admin_memberships.account_unit}`}
            />
            <InfoItem
              label={t.admin_memberships.allowance_per_user}
              value={formatStorageBytes(Number(rolloutStatus.trial_allowance_bytes || 0))}
            />
            <InfoItem
              label={t.admin_memberships.platform_storage}
              value={`${formatStorageBytes(Number(rolloutStatus.platform_storage_bytes || 0))} / ${formatStorageBytes(Number(rolloutStatus.platform_storage_pause_bytes || 0))}`}
            />
            <InfoItem
              label={t.admin_memberships.unused_allowance}
              value={formatStorageBytes(Number(rolloutStatus.unrealized_trial_allowance_bytes || 0))}
            />
            <InfoItem
              label={t.admin_memberships.safety_budget}
              value={`${formatStorageBytes(Number(rolloutStatus.projected_storage_bytes || 0))} / ${formatStorageBytes(Number(rolloutStatus.platform_storage_pause_bytes || 0))}`}
            />
          </div>
        ) : null}

        {(operationsDashboard?.storage_leaders || []).length > 0 ? (
          <div style={capacityLeaderBlockStyle}>
            <h3 style={subsectionTitleStyle}>{t.admin_memberships.largest_storage_accounts}</h3>
            <div style={accountClosureListStyle}>
              {(operationsDashboard?.storage_leaders || []).slice(0, 6).map((item) => (
                <article key={item.user_id} style={accountClosureRowStyle}>
                  <div style={userTitleRowStyle}>
                    <strong>{item.username || item.account_number || item.user_id}</strong>
                    <span style={pillStyle}>{formatStorageBytes(Number(item.storage_used || 0))}</span>
                  </div>
                  <div style={smallTextStyle}>
                    {t.admin_memberships.account_number_prefix}{item.account_number || t.admin_memberships.not_recorded}
                    {" · "}{formatStorageBytes(Number(item.storage_used || 0))} / {formatStorageBytes(Number(item.storage_limit_bytes || 0))}
                  </div>
                </article>
              ))}
            </div>
          </div>
        ) : null}

        <button
          type="button"
          style={secondaryButtonStyle}
          onClick={() => void loadSignupRolloutStatus()}
          disabled={rolloutLoading}
        >
          {t.admin_memberships.reload_rollout}
        </button>
      </section>

      <section
        id="registrations"
        style={{
          ...currentCardStyle,
          marginBottom: isMobileViewport ? 12 : 16,
          scrollMarginTop: adminSectionScrollMarginTop,
        }}
      >
        <div style={detailTopStyle}>
          <div>
            <div style={sectionLabelStyle}>{t.admin_memberships.registration_eyebrow}</div>
            <h2 style={sectionTitleStyle}>{t.admin_memberships.registration_title}</h2>
            <p style={smallTextStyle}>{t.admin_memberships.registration_intro}</p>
          </div>
          <span style={pillStyle}>{formatAdminCount(rows.length, language)} {t.admin_memberships.current_results}</span>
        </div>
        <form onSubmit={handleSearch} style={searchRowStyle}>
          <input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder={t.admin_memberships.search_placeholder}
            style={inputStyle}
          />
          <button type="submit" style={primaryButtonStyle} disabled={loading}>
            {loading ? t.admin_memberships.searching : t.admin_memberships.search}
          </button>
          <button
            type="button"
            style={secondaryButtonStyle}
            onClick={() => {
              setKeyword("");
              void loadRows("");
            }}
            disabled={loading}
          >
            {t.admin_memberships.show_recent}
          </button>
        </form>

        {errorMsg ? <p style={errorStyle}>{errorMsg}</p> : null}

        <div style={currentLayoutStyle}>
          <div style={listStyle}>
            {loading ? (
              <div style={emptyStyle}>{t.admin_memberships.loading_users}</div>
            ) : rows.length === 0 ? (
              <div style={emptyStyle}>{t.admin_memberships.no_users}</div>
            ) : (
              rows.map((row) => {
                const active = selected?.user_id === row.user_id;
                return (
                  <article
                    key={row.user_id}
                    style={userItemStyle(active)}
                    onClick={() => setSelected(row)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setSelected(row);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <div style={userTitleRowStyle}>
                      <strong style={userNameStyle}>
                        {row.username || t.admin_memberships.username_unset}
                      </strong>
                      <span style={pillStyle}>
                        {getAdminMembershipStatusLabel(row.status, language)}
                      </span>
                    </div>
                    <div style={smallTextStyle}>{row.email || row.user_id}</div>
                    <div style={smallTextStyle}>
                      {t.admin_memberships.account_number_prefix}{row.account_number || t.admin_memberships.not_recorded}
                      {" · "}{t.admin_memberships.registered_at_prefix}{formatMembershipDate(row.registered_at, language)}
                      {row.is_internal_test ? ` · ${t.admin_memberships.internal_account_short}` : ""}
                    </div>
                    <div style={smallTextStyle}>
                      {getMembershipPlanLabel(row.plan, language)} · {t.admin_memberships.capacity}{" "}
                      {formatStorageBytes(row.storage_used || 0)} / {formatStorageBytes(row.storage_limit_bytes || 0)} · {t.admin_memberships.market}{" "}
                      {Number(row.active_market_post_count || 0)} / {Number(row.market_post_limit || 0)}
                    </div>
                    <div style={smallTextStyle}>
                      {t.admin_memberships.last_login_prefix}{formatMembershipDate(row.last_sign_in_at, language)}
                      {" · "}{formatAdminCount(row.archive_count, language)} {t.admin_memberships.project_unit}
                      {" · "}{formatAdminCount(row.record_count, language)} {t.admin_memberships.record_unit}
                    </div>
                    <div style={memberRowActionStyle}>
                      {canDeleteMembership(row, currentUserId) ? (
                        <button
                          type="button"
                          style={dangerMiniButtonStyle}
                          onClick={(event) => {
                            event.stopPropagation();
                            openDeleteMembershipDialog(row);
                          }}
                          disabled={deleteSaving}
                        >
                          {t.admin_memberships.delete_membership}
                        </button>
                      ) : row.status === "canceled" ? (
                        <span style={deletedHintStyle}>{t.admin_memberships.deleted}</span>
                      ) : null}
                    </div>
                  </article>
                );
              })
            )}
          </div>

          <aside style={currentDetailStyle}>
            {selected ? (
              <>
                <div style={detailTopStyle}>
                  <div>
                    <div style={sectionLabelStyle}>{t.admin_memberships.current_selection}</div>
                    <h2 style={sectionTitleStyle}>
                      {selected.username || selected.email || t.admin_memberships.username_unset}
                    </h2>
                    <p style={smallTextStyle}>{selected.user_id}</p>
                  </div>
                  <span style={pillStyle}>
                    {getAdminMembershipStatusLabel(selected.status, language)}
                  </span>
                </div>

                <div style={currentSummaryGridStyle}>
                  <InfoItem
                    label={t.admin_memberships.account_number}
                    value={selected.account_number || t.admin_memberships.not_recorded}
                  />
                  <InfoItem
                    label={t.admin_memberships.registration_time}
                    value={formatMembershipDate(selected.registered_at, language)}
                  />
                  <InfoItem
                    label={t.admin_memberships.last_login}
                    value={formatMembershipDate(selected.last_sign_in_at, language)}
                  />
                  <InfoItem
                    label={t.admin_memberships.user_content_total}
                    value={`${formatAdminCount(selected.archive_count, language)} ${t.admin_memberships.project_unit} · ${formatAdminCount(selected.record_count, language)} ${t.admin_memberships.record_unit}`}
                  />
                  <InfoItem
                    label={t.admin_memberships.current_plan}
                    value={getMembershipPlanLabel(selected.plan, language)}
                  />
                  <InfoItem
                    label={t.admin_memberships.trial_expires}
                    value={formatMembershipDate(selected.trial_ends_at, language)}
                  />
                  <InfoItem
                    label={t.admin_memberships.paid_expires}
                    value={formatMembershipDate(selected.paid_until, language)}
                  />
                  <InfoItem label={t.admin_memberships.capacity} value={selectedUsageText} />
                  <InfoItem
                    label={t.admin_memberships.market_limit}
                    value={`${Number(selected.active_market_post_count || 0)} / ${Number(
                      selected.market_post_limit || 0
                    )} ${t.admin_memberships.post_unit}`}
                  />
                  <InfoItem
                    label={t.admin_memberships.base_limit}
                    value={`${Number(selected.base_market_post_limit || 0)} ${t.admin_memberships.post_unit}`}
                  />
                </div>

                <div style={currentPresetGridStyle}>
                  {PLAN_PRESETS.map((preset) => (
                    <button
                      key={preset.key}
                      type="button"
                      style={presetButtonStyle(plan === preset.key)}
                      onClick={() => handleApplyPreset(preset.key)}
                    >
                      <strong>{getPlanPresetLabel(preset.key, language)}</strong>
                      <span>{getPlanPresetNote(preset.key, language)}</span>
                    </button>
                  ))}
                </div>

                <div style={currentFormGridStyle}>
                  <label style={labelStyle}>
                    {t.admin_memberships.membership_plan}
                    <select
                      value={plan}
                      onChange={(event) => handleApplyPreset(event.target.value as PlanKey)}
                      style={inputStyle}
                    >
                      {PLAN_PRESETS
                        .filter(
                          (preset) =>
                            preset.key !== "trial" || selected?.plan === "trial"
                        )
                        .map((preset) => (
                          <option key={preset.key} value={preset.key}>
                            {getPlanPresetLabel(preset.key, language)}
                          </option>
                        ))}
                    </select>
                  </label>

                  <label style={labelStyle}>
                    {t.admin_memberships.paid_until}
                    <input
                      type="date"
                      value={paidUntilDate}
                      onChange={(event) => setPaidUntilDate(event.target.value)}
                      style={inputStyle}
                      disabled={plan === "trial"}
                    />
                  </label>

                  <label style={labelStyle}>
                    {t.admin_memberships.cloud_capacity_bytes}
                    <input
                      value={storageLimitBytes}
                      onChange={(event) => setStorageLimitBytes(event.target.value)}
                      style={inputStyle}
                      inputMode="numeric"
                    />
                    <span style={hintStyle}>{formatStorageBytes(Number(storageLimitBytes || 0))}</span>
                  </label>

                  <label style={labelStyle}>
                    {t.admin_memberships.market_base_limit}
                    <input
                      value={baseMarketPostLimit}
                      onChange={(event) => setBaseMarketPostLimit(event.target.value)}
                      style={inputStyle}
                      inputMode="numeric"
                    />
                  </label>
                </div>

                <div style={actionRowStyle}>
                  <button type="button" style={primaryButtonStyle} onClick={handleSave} disabled={saving}>
                    {saving ? t.admin_memberships.saving : t.admin_memberships.save_settings}
                  </button>
                  <button type="button" style={secondaryButtonStyle} onClick={() => void loadRows(keyword)} disabled={saving}>
                    {t.admin_memberships.reload}
                  </button>
                  {canDeleteMembership(selected, currentUserId) ? (
                    <button type="button" style={dangerButtonStyle} onClick={() => openDeleteMembershipDialog(selected)} disabled={deleteSaving}>
                      {t.admin_memberships.delete_membership}
                    </button>
                  ) : null}
                  {canPermanentlyDeleteAccount(selected, currentUserId) ? (
                    <button
                      type="button"
                      style={permanentDeleteButtonStyle}
                      onClick={() => openAccountDeletionDialog(selected)}
                      disabled={accountDeleteSaving}
                    >
                      {t.admin_memberships.permanent_account_delete}
                    </button>
                  ) : null}
                </div>

                <div style={dividerStyle} />

                <section style={paymentSectionStyle}>
                  <div style={detailTopStyle}>
                    <div>
                      <div style={sectionLabelStyle}>{t.admin_memberships.manual_payment}</div>
                      <h3 style={subsectionTitleStyle}>{t.admin_memberships.confirm_and_open}</h3>
                      <p style={smallTextStyle}>{t.admin_memberships.manual_payment_intro}</p>
                    </div>
                  </div>

                  <div style={currentFormGridStyle}>
                    <label style={labelStyle}>
                      {t.admin_memberships.payment_plan}
                      <select
                        value={paymentPlan}
                        onChange={(event) => handlePaymentPlanChange(event.target.value as PaymentPlanKey)}
                        style={inputStyle}
                      >
                        {PAYMENT_PLAN_OPTIONS.map((preset) => (
                          <option key={preset.key} value={preset.key}>
                            {getPlanPresetLabel(preset.key, language)}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label style={labelStyle}>
                      {t.admin_memberships.currency}
                      <select
                        value={paymentCurrency}
                        onChange={(event) => handlePaymentCurrencyChange(event.target.value as PaymentCurrency)}
                        style={inputStyle}
                      >
                        <option value="CNY">{t.admin_memberships.currency_cny}</option>
                        <option value="USD">{t.admin_memberships.currency_usd}</option>
                      </select>
                    </label>

                    <label style={labelStyle}>
                      {t.admin_memberships.payment_amount}
                      <input
                        value={paymentAmount}
                        onChange={(event) => setPaymentAmount(event.target.value)}
                        style={inputStyle}
                        inputMode="decimal"
                      />
                      <span style={hintStyle}>{formatPaymentAmount(paymentAmount, paymentCurrency)}</span>
                    </label>

                    <label style={labelStyle}>
                      {t.admin_memberships.payment_method}
                      <select
                        value={paymentMethod}
                        onChange={(event) => {
                          const nextMethod = event.target.value as PaymentMethod;
                          setPaymentMethod(nextMethod);
                          regeneratePaymentReference(nextMethod, paymentPaidAtDate);
                        }}
                        style={inputStyle}
                      >
                        <option value="wechat">{t.admin_memberships.method_wechat}</option>
                        <option value="alipay">{t.admin_memberships.method_alipay}</option>
                        <option value="paypal">{t.admin_memberships.method_paypal}</option>
                        <option value="manual">{t.admin_memberships.method_manual}</option>
                        <option value="other">{t.admin_memberships.method_other}</option>
                      </select>
                    </label>

                    <label style={labelStyle}>
                      {t.admin_memberships.payment_date}
                      <input
                        type="date"
                        value={paymentPaidAtDate}
                        onChange={(event) => {
                          const nextDate = event.target.value;
                          setPaymentPaidAtDate(nextDate);
                          regeneratePaymentReference(paymentMethod, nextDate);
                        }}
                        style={inputStyle}
                      />
                    </label>

                    <label style={labelStyle}>
                      {t.admin_memberships.service_months}
                      <input
                        value={paymentServiceMonths}
                        onChange={(event) => setPaymentServiceMonths(event.target.value)}
                        style={inputStyle}
                        inputMode="numeric"
                      />
                      <span style={hintStyle}>{t.admin_memberships.months_hint}</span>
                    </label>

                    <label style={labelStyle}>
                      {t.admin_memberships.payment_reference}
                      <div style={inlineFieldRowStyle}>
                        <input
                          value={paymentReference}
                          onChange={(event) => setPaymentReference(event.target.value)}
                          style={{ ...inputStyle, flex: 1 }}
                          placeholder={t.admin_memberships.reference_placeholder}
                        />
                        <button
                          type="button"
                          style={miniButtonStyle}
                          onClick={() => regeneratePaymentReference()}
                        >
                          {t.admin_memberships.regenerate}
                        </button>
                      </div>
                      <span style={hintStyle}>{t.admin_memberships.reference_hint}</span>
                    </label>
                  </div>

                  <label style={labelStyle}>
                    {t.admin_memberships.admin_note}
                    <textarea
                      value={paymentNote}
                      onChange={(event) => setPaymentNote(event.target.value)}
                      style={textareaStyle}
                      placeholder={t.admin_memberships.note_placeholder}
                    />
                  </label>

                  <div style={{ ...actionRowStyle, marginTop: 12 }}>
                    <button type="button" style={primaryButtonStyle} onClick={handleCreatePayment} disabled={paymentSaving}>
                      {paymentSaving
                        ? t.admin_memberships.confirming
                        : t.admin_memberships.confirm_and_open}
                    </button>
                    <button type="button" style={secondaryButtonStyle} onClick={() => void loadPaymentRows(selected.user_id)} disabled={paymentLoading}>
                      {paymentLoading
                        ? `${t.admin_memberships.reading}...`
                        : t.admin_memberships.refresh_payments}
                    </button>
                  </div>

                  <div style={paymentHistoryStyle}>
                    {paymentLoading ? (
                      <div style={emptyStyle}>{t.admin_memberships.loading_payments}</div>
                    ) : paymentRows.length === 0 ? (
                      <div style={emptyStyle}>{t.admin_memberships.no_payments}</div>
                    ) : (
                      paymentRows.map((payment) => (
                        <div key={payment.id} style={paymentItemStyle}>
                          <div style={userTitleRowStyle}>
                            <strong>{formatPaymentAmount(payment.amount, payment.currency)}</strong>
                            <span style={pillStyle}>
                              {getPaymentStatusLabel(payment.status, language)}
                            </span>
                          </div>
                          <div style={smallTextStyle}>
                            {getPaymentPlanLabel(payment.plan, language)} · {getPaymentMethodLabel(
                              payment.payment_method,
                              language
                            )} · {t.admin_memberships.payment_time}{" "}
                            {formatMembershipDate(payment.paid_at, language)}
                          </div>
                          <div style={smallTextStyle}>
                            {t.admin_memberships.service_period}
                            {formatMembershipDate(payment.service_started_at, language)} - {formatMembershipDate(
                              payment.service_ends_at,
                              language
                            )}
                          </div>
                          {payment.payment_reference ? (
                            <div style={smallTextStyle}>
                              {t.admin_memberships.transaction_prefix}{payment.payment_reference}
                            </div>
                          ) : null}
                          {payment.note ? (
                            <div style={smallTextStyle}>
                              {t.admin_memberships.note_prefix}{payment.note}
                            </div>
                          ) : null}
                        </div>
                      ))
                    )}
                  </div>
                </section>
              </>
            ) : (
              <div style={emptyDetailStyle}>
                {t.admin_memberships.choose_user_hint}
              </div>
            )}
          </aside>
        </div>
      </section>

      <section
        id="account-closures"
        style={{
          ...currentCardStyle,
          scrollMarginTop: adminSectionScrollMarginTop,
        }}
      >
        <div style={detailTopStyle}>
          <div>
            <div style={sectionLabelStyle}>{t.admin_memberships.account_closure_eyebrow}</div>
            <h2 style={sectionTitleStyle}>{t.admin_memberships.account_closure_title}</h2>
            <p style={smallTextStyle}>{t.admin_memberships.account_closure_intro}</p>
          </div>
          <button
            type="button"
            style={secondaryButtonStyle}
            onClick={() => void loadAccountDeletionAudits()}
            disabled={deletionAuditLoading}
          >
            {deletionAuditLoading
              ? t.admin_memberships.reading
              : t.admin_memberships.refresh_account_closures}
          </button>
        </div>

        <div style={accountClosureNoticeStyle}>
          <strong>{t.admin_memberships.membership_suspend_vs_delete_title}</strong>
          <span>{t.admin_memberships.membership_suspend_vs_delete_intro}</span>
        </div>

        {deletionAuditLoading && deletionAuditRows.length === 0 ? (
          <div style={emptyStyle}>{t.admin_memberships.loading_account_closures}</div>
        ) : deletionAuditRows.length === 0 ? (
          <div style={emptyStyle}>{t.admin_memberships.no_account_closures}</div>
        ) : (
          <div style={accountClosureListStyle}>
            {deletionAuditRows.map((row) => (
              <article key={row.id} style={accountClosureRowStyle}>
                <div style={userTitleRowStyle}>
                  <strong>{row.target_account_number || row.target_user_id}</strong>
                  <span style={accountClosureStatusStyle(row.status)}>
                    {row.status === "completed"
                      ? t.admin_memberships.account_closure_completed
                      : row.status === "failed"
                        ? t.admin_memberships.account_closure_failed
                        : t.admin_memberships.account_closure_processing}
                  </span>
                </div>
                <div style={smallTextStyle}>
                  {t.admin_memberships.account_number_prefix}{row.target_account_number || t.admin_memberships.not_recorded}
                  {" · "}
                  {row.initiated_by === "admin"
                    ? t.admin_memberships.initiated_by_admin
                    : t.admin_memberships.initiated_by_self}
                </div>
                <div style={smallTextStyle}>
                  {t.admin_memberships.requested_at_prefix}{formatMembershipDate(row.requested_at, language)}
                  {row.status === "completed"
                    ? ` · ${formatAdminCount(row.deleted_storage_object_count, language)} ${t.admin_memberships.deleted_file_unit}`
                    : ""}
                  {row.status === "failed"
                    ? ` · ${t.admin_memberships.needs_manual_review}`
                    : ""}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={t.admin_memberships.delete_membership}
        message={t.admin_memberships.delete_message}
        confirmText={
          deleteSaving
            ? t.admin_memberships.deleting
            : t.admin_memberships.confirm_delete_membership
        }
        cancelText={t.cancel}
        danger
        confirmDisabled={deleteSaving}
        cancelDisabled={deleteSaving}
        onClose={closeDeleteMembershipDialog}
        onConfirm={handleDeleteMembership}
      >
        {deleteTarget ? (
          <div style={deleteTargetBoxStyle}>
            <strong>{deleteTarget.username || deleteTarget.email || deleteTarget.user_id}</strong>
            <span>{deleteTarget.email || deleteTarget.user_id}</span>
          </div>
        ) : null}
      </ConfirmDialog>
      <ConfirmDialog
        open={Boolean(accountDeleteTarget)}
        title={t.admin_memberships.permanent_account_delete}
        message={t.admin_memberships.permanent_account_delete_message}
        confirmText={
          accountDeleteSaving
            ? t.admin_memberships.account_deleting
            : t.admin_memberships.confirm_permanent_account_delete
        }
        cancelText={t.cancel}
        danger
        confirmDisabled={
          accountDeleteSaving ||
          !accountDeleteAcknowledged ||
          accountDeleteConfirmation.trim() !==
            (accountDeleteTarget?.account_number || accountDeleteTarget?.user_id || "")
        }
        cancelDisabled={accountDeleteSaving}
        onClose={closeAccountDeletionDialog}
        onConfirm={handlePermanentAccountDeletion}
      >
        {accountDeleteTarget ? (
          <div style={accountDeleteConfirmBoxStyle}>
            <div style={deleteTargetBoxStyle}>
              <strong>
                {accountDeleteTarget.username ||
                  accountDeleteTarget.email ||
                  accountDeleteTarget.user_id}
              </strong>
              <span>{accountDeleteTarget.email || accountDeleteTarget.user_id}</span>
            </div>
            <label style={labelStyle}>
              {t.admin_memberships.type_account_number_prefix}
              <strong style={confirmationCodeStyle}>
                {accountDeleteTarget.account_number || accountDeleteTarget.user_id}
              </strong>
              <input
                value={accountDeleteConfirmation}
                onChange={(event) => setAccountDeleteConfirmation(event.target.value)}
                style={inputStyle}
                autoComplete="off"
                spellCheck={false}
              />
            </label>
            <label style={acknowledgementStyle}>
              <input
                type="checkbox"
                checked={accountDeleteAcknowledged}
                onChange={(event) => setAccountDeleteAcknowledged(event.target.checked)}
              />
              <span>{t.admin_memberships.permanent_delete_acknowledgement}</span>
            </label>
          </div>
        ) : null}
      </ConfirmDialog>
    </main>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div style={infoItemStyle}>
      <div style={infoLabelStyle}>{label}</div>
      <div style={infoValueStyle}>{value}</div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  hint,
  tone = "normal",
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "normal" | "attention" | "danger";
}) {
  return (
    <div style={metricCardStyle(tone)}>
      <div style={metricLabelStyle}>{label}</div>
      <div style={metricValueStyle}>{value}</div>
      <div style={metricHintStyle}>{hint}</div>
    </div>
  );
}

const pageStyle: CSSProperties = {
  maxWidth: 1180,
  margin: "0 auto",
  padding: "34px 18px 72px",
};

const mobilePageStyle: CSSProperties = {
  ...pageStyle,
  padding: "18px 12px 84px",
};

const headerStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 16,
  alignItems: "flex-start",
  marginBottom: 20,
  flexWrap: "wrap",
};

const mobileHeaderStyle: CSSProperties = {
  ...headerStyle,
  gap: 10,
  marginBottom: 12,
};

function adminAnchorNavStyle(mobile: boolean): CSSProperties {
  return {
    position: "sticky",
    top: mobile ? "calc(50px + var(--app-safe-area-top))" : 58,
    zIndex: 90,
    display: "flex",
    gap: 8,
    overflowX: "auto",
    WebkitOverflowScrolling: "touch",
    padding: "8px 4px",
    margin: "0 -4px 8px",
    borderBottom: "1px solid #e6ece2",
    background: "rgba(248, 250, 246, 0.96)",
    backdropFilter: "blur(10px)",
    scrollbarWidth: "thin",
  };
}

const anchorLinkStyle: CSSProperties = {
  flex: "0 0 auto",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 38,
  padding: "8px 13px",
  borderRadius: 999,
  border: "1px solid #d8e0d2",
  background: "#fbfdf8",
  color: "#40563a",
  fontSize: 13,
  fontWeight: 700,
  textDecoration: "none",
};

function adminAnchorLinkStyle(active: boolean): CSSProperties {
  return {
    ...anchorLinkStyle,
    borderColor: active ? "#8fba83" : anchorLinkStyle.borderColor,
    background: active ? "#eaf5e5" : anchorLinkStyle.background,
    color: active ? "#2f6530" : anchorLinkStyle.color,
    boxShadow: active ? "inset 0 0 0 1px rgba(79, 123, 69, 0.08)" : undefined,
  };
}

const adminBackLinkStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  marginBottom: 10,
  color: "#557050",
  fontSize: 14,
  fontWeight: 800,
  textDecoration: "none",
};

const eyebrowStyle: CSSProperties = {
  color: "#5f7d4c",
  fontSize: 13,
  fontWeight: 700,
  letterSpacing: 1,
  marginBottom: 8,
};

const titleStyle: CSSProperties = {
  margin: 0,
  color: "#1f2a1f",
  fontSize: 30,
  lineHeight: 1.2,
};

const mutedTextStyle: CSSProperties = {
  margin: "10px 0 0",
  color: "#68705f",
  lineHeight: 1.75,
  maxWidth: 760,
};

const cardStyle: CSSProperties = {
  background: "#fffdf8",
  border: "1px solid #e7dfcf",
  borderRadius: 22,
  padding: 18,
  boxShadow: "0 14px 35px rgba(73, 60, 36, 0.08)",
};

const mobileCardStyle: CSSProperties = {
  ...cardStyle,
  borderRadius: 16,
  padding: 12,
  boxShadow: "0 8px 22px rgba(73, 60, 36, 0.06)",
};

const noticeCardStyle: CSSProperties = {
  ...cardStyle,
  maxWidth: 680,
};

const searchRowStyle: CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  marginBottom: 16,
};

const layoutStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(280px, 0.95fr) minmax(420px, 1.25fr)",
  gap: 16,
};

const mobileLayoutStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr)",
  gap: 12,
};

const listStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
  minWidth: 0,
};

const detailStyle: CSSProperties = {
  border: "1px solid #e6dcc8",
  borderRadius: 18,
  padding: 16,
  background: "#fffaf0",
  minWidth: 0,
};

const mobileDetailStyle: CSSProperties = {
  ...detailStyle,
  borderRadius: 15,
  padding: 12,
};

const detailTopStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "flex-start",
  marginBottom: 14,
};

const userItemStyle = (active: boolean): CSSProperties => ({
  width: "100%",
  textAlign: "left",
  border: active ? "1px solid #7e9b65" : "1px solid #e5ddcf",
  background: active ? "#f2f8ea" : "#fffaf3",
  borderRadius: 16,
  padding: "12px 13px",
  cursor: "pointer",
  color: "#243020",
});

const userTitleRowStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 8,
  alignItems: "center",
  marginBottom: 5,
};

const userNameStyle: CSSProperties = {
  fontSize: 15,
};

const pillStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  borderRadius: 999,
  padding: "3px 8px",
  background: "#e8f1dc",
  color: "#496438",
  fontSize: 12,
  fontWeight: 700,
  whiteSpace: "nowrap",
};

const smallTextStyle: CSSProperties = {
  color: "#6b705f",
  fontSize: 12,
  lineHeight: 1.6,
  wordBreak: "break-all",
};

const sectionLabelStyle: CSSProperties = {
  color: "#768064",
  fontSize: 12,
  fontWeight: 700,
  marginBottom: 4,
};

const sectionTitleStyle: CSSProperties = {
  margin: 0,
  color: "#1f2a1f",
  fontSize: 20,
};

const summaryGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 10,
  marginBottom: 16,
};

const mobileSummaryGridStyle: CSSProperties = {
  ...summaryGridStyle,
  gridTemplateColumns: "minmax(0, 1fr)",
  gap: 8,
};

const operationsGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 10,
  marginBottom: 16,
};

const mobileOperationsGridStyle: CSSProperties = {
  ...operationsGridStyle,
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 8,
};

const metricCardStyle = (
  tone: "normal" | "attention" | "danger"
): CSSProperties => ({
  minWidth: 0,
  padding: "12px 13px",
  borderRadius: 15,
  border:
    tone === "danger"
      ? "1px solid #e7beb8"
      : tone === "attention"
        ? "1px solid #e8cf9d"
        : "1px solid #dfe7da",
  background:
    tone === "danger"
      ? "#fff7f5"
      : tone === "attention"
        ? "#fffaf0"
        : "#f9fcf6",
});

const metricLabelStyle: CSSProperties = {
  color: "#727b6a",
  fontSize: 12,
  lineHeight: 1.45,
};

const metricValueStyle: CSSProperties = {
  marginTop: 5,
  color: "#203020",
  fontSize: 24,
  lineHeight: 1.15,
  fontWeight: 800,
  wordBreak: "break-word",
};

const metricHintStyle: CSSProperties = {
  marginTop: 5,
  color: "#7a806f",
  fontSize: 11,
  lineHeight: 1.45,
};

const storageProgressBlockStyle: CSSProperties = {
  borderTop: "1px solid #e6ebdf",
  paddingTop: 13,
};

const storageProgressMetaStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  marginBottom: 8,
  color: "#4b5945",
  fontSize: 12,
};

const storageProgressTrackStyle: CSSProperties = {
  height: 12,
  borderRadius: 999,
  background: "#e8eee3",
  overflow: "hidden",
};

const storageProgressFillStyle = (percent: number): CSSProperties => ({
  display: "block",
  width: `${percent}%`,
  minWidth: percent > 0 ? 3 : 0,
  height: "100%",
  borderRadius: 999,
  background: percent >= 90 ? "#bf6659" : percent >= 70 ? "#c99a49" : "#668957",
  transition: "width 180ms ease",
});

const trafficLayoutStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.25fr) minmax(280px, 0.75fr)",
  gap: 12,
};

const mobileTrafficLayoutStyle: CSSProperties = {
  ...trafficLayoutStyle,
  gridTemplateColumns: "minmax(0, 1fr)",
};

const trafficPanelStyle: CSSProperties = {
  minWidth: 0,
  border: "1px solid #e2e9dc",
  borderRadius: 15,
  padding: 12,
  background: "#fbfdf9",
};

const trafficChartStyle: CSSProperties = {
  minHeight: 170,
  display: "flex",
  alignItems: "flex-end",
  gap: 4,
  overflowX: "auto",
  padding: "12px 2px 2px",
};

const trafficBarColumnStyle: CSSProperties = {
  flex: "1 0 24px",
  minWidth: 24,
  height: 150,
  display: "flex",
  flexDirection: "column",
  justifyContent: "flex-end",
  alignItems: "stretch",
  gap: 4,
};

const trafficBarValueStyle: CSSProperties = {
  minHeight: 15,
  color: "#667061",
  fontSize: 9,
  lineHeight: 1,
  textAlign: "center",
};

const trafficBarStyle = (heightPercent: number): CSSProperties => ({
  display: "block",
  height: `${heightPercent}%`,
  minHeight: 3,
  borderRadius: "6px 6px 2px 2px",
  background: "linear-gradient(180deg, #7da36c 0%, #547948 100%)",
});

const trafficBarLabelStyle: CSSProperties = {
  color: "#858b7d",
  fontSize: 9,
  lineHeight: 1,
  textAlign: "center",
  whiteSpace: "nowrap",
};

const chartEmptyStyle: CSSProperties = {
  width: "100%",
  alignSelf: "center",
  color: "#7b8174",
  fontSize: 13,
  textAlign: "center",
};

const topPageListStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 7,
  marginTop: 11,
};

const topPageRowStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 10,
  borderBottom: "1px solid #edf0e9",
  paddingBottom: 7,
};

const topPagePathStyle: CSSProperties = {
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  color: "#3e5340",
  fontSize: 11,
};

const topPageMetricStyle: CSSProperties = {
  flex: "0 0 auto",
  color: "#65705f",
  fontSize: 11,
  fontWeight: 700,
};

const topPageLegendStyle: CSSProperties = {
  marginTop: 10,
  color: "#8a8f84",
  fontSize: 10,
  textAlign: "right",
};

const privacyNoticeStyle: CSSProperties = {
  margin: "12px 0 0",
  padding: "9px 11px",
  borderRadius: 12,
  background: "#f5f7f2",
  color: "#697166",
  fontSize: 11,
  lineHeight: 1.6,
};

const capacityLeaderBlockStyle: CSSProperties = {
  margin: "4px 0 14px",
  paddingTop: 13,
  borderTop: "1px solid #e6ebdf",
};

const infoItemStyle: CSSProperties = {
  border: "1px solid #eadfcd",
  borderRadius: 14,
  padding: 11,
  background: "#fffdf8",
};

const infoLabelStyle: CSSProperties = {
  color: "#7c806f",
  fontSize: 12,
  marginBottom: 5,
};

const infoValueStyle: CSSProperties = {
  color: "#263021",
  fontSize: 15,
  fontWeight: 700,
  wordBreak: "break-all",
};

const presetGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 10,
  marginBottom: 16,
};

const mobilePresetGridStyle: CSSProperties = {
  ...presetGridStyle,
  gridTemplateColumns: "minmax(0, 1fr)",
  gap: 8,
};

const presetButtonStyle = (active: boolean): CSSProperties => ({
  textAlign: "left",
  border: active ? "1px solid #759457" : "1px solid #e4dac7",
  background: active ? "#eef7e5" : "#fffdf8",
  color: "#25321f",
  borderRadius: 14,
  padding: 11,
  cursor: "pointer",
  display: "flex",
  flexDirection: "column",
  gap: 5,
  lineHeight: 1.45,
});

const formGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 12,
  marginBottom: 16,
};

const mobileFormGridStyle: CSSProperties = {
  ...formGridStyle,
  gridTemplateColumns: "minmax(0, 1fr)",
  gap: 10,
};

const labelStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  color: "#38412f",
  fontSize: 13,
  fontWeight: 700,
};

const inputStyle: CSSProperties = {
  border: "1px solid #d8cdb8",
  borderRadius: 12,
  padding: "10px 12px",
  background: "#fffefb",
  color: "#1f2a1f",
  fontSize: 14,
  outline: "none",
  minWidth: 0,
};

const hintStyle: CSSProperties = {
  color: "#7a806f",
  fontSize: 12,
  fontWeight: 400,
};

const actionRowStyle: CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
};

const dividerStyle: CSSProperties = {
  height: 1,
  background: "#e7dcc7",
  margin: "20px 0",
};

const pendingPaymentQueueStyle = (hasPending: boolean): CSSProperties => ({
  borderColor: hasPending ? "#e1a46f" : "#dce8d7",
  background: hasPending ? "#fff8ef" : "#f8fbf6",
  boxShadow: hasPending ? "0 8px 24px rgba(170, 91, 36, 0.10)" : "none",
});

const pendingPaymentListStyle: CSSProperties = {
  display: "grid",
  gap: 10,
  marginTop: 12,
};

const pendingPaymentCardStyle: CSSProperties = {
  padding: "12px 13px",
  border: "1px solid #ead0b7",
  borderRadius: 14,
  background: "#fff",
};

const pendingPaymentAmountStyle: CSSProperties = {
  color: "#8b4925",
  fontSize: 17,
  fontWeight: 900,
};

const pendingPaymentMetaStyle: CSSProperties = {
  display: "flex",
  gap: "5px 12px",
  flexWrap: "wrap",
  marginTop: 7,
  color: "#6f6657",
  fontSize: 13,
  lineHeight: 1.5,
};

const pendingPaymentActionsStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  marginTop: 10,
};

const pendingPaymentEmptyStyle: CSSProperties = {
  marginTop: 12,
  padding: "11px 12px",
  border: "1px dashed #ccd9c7",
  borderRadius: 13,
  background: "#fff",
  color: "#657160",
  fontSize: 13,
};

const refundQueueStyle = (hasPending: boolean): CSSProperties => ({
  borderColor: hasPending ? "#d3b06d" : "#dce8d7",
  background: hasPending ? "#fffaf0" : "#f8fbf6",
  boxShadow: hasPending ? "0 8px 24px rgba(143, 99, 35, 0.10)" : "none",
});

const refundWorkflowNoticeStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "7px 12px",
  flexWrap: "wrap",
  marginBottom: 12,
  padding: "11px 12px",
  border: "1px solid #dfd2b8",
  borderRadius: 13,
  background: "#fffdf7",
  color: "#62533e",
  fontSize: 12,
  lineHeight: 1.6,
};

const refundCardStyle = (
  status: MembershipRefundQueueRow["status"]
): CSSProperties => ({
  ...pendingPaymentCardStyle,
  borderColor: status === "approved_pending_refund" ? "#d5a24d" : "#ded6c5",
  background: status === "approved_pending_refund" ? "#fffaf0" : "#fff",
});

const refundStatusStyle = (
  status: MembershipRefundQueueRow["status"]
): CSSProperties => ({
  ...pillStyle,
  background:
    status === "submitted"
      ? "#f6ecd5"
      : status === "approved_pending_refund"
        ? "#fff0c9"
        : status === "completed"
          ? "#e7f2df"
          : "#f4e8e6",
  color:
    status === "submitted" || status === "approved_pending_refund"
      ? "#7b5a20"
      : status === "completed"
        ? "#47693a"
        : "#8c514a",
});

const refundAmountRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  gap: "4px 10px",
  flexWrap: "wrap",
  marginTop: 10,
  color: "#6a654f",
  fontSize: 12,
};

const refundReasonStyle: CSSProperties = {
  display: "grid",
  gap: 3,
  marginTop: 9,
  padding: "9px 10px",
  borderRadius: 11,
  background: "#f7f8f3",
  color: "#586253",
  fontSize: 12,
  lineHeight: 1.55,
  overflowWrap: "anywhere",
};

const refundApprovedNoticeStyle: CSSProperties = {
  display: "grid",
  gap: 4,
  marginTop: 10,
  padding: "10px 11px",
  border: "1px solid #e2c684",
  borderRadius: 12,
  background: "#fff8e6",
  color: "#6f5521",
  fontSize: 12,
  lineHeight: 1.6,
};

const paymentSectionStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

const subsectionTitleStyle: CSSProperties = {
  margin: 0,
  color: "#1f2a1f",
  fontSize: 18,
};

const textareaStyle: CSSProperties = {
  ...inputStyle,
  minHeight: 78,
  resize: "vertical",
};

const inlineFieldRowStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "center",
};

const paymentHistoryStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
  marginTop: 12,
};

const paymentItemStyle: CSSProperties = {
  border: "1px solid #e5ddcf",
  background: "#fffdf8",
  borderRadius: 14,
  padding: "11px 12px",
};

const memberRowActionStyle: CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  alignItems: "center",
  gap: 8,
  marginTop: 10,
};

const miniButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  border: "1px solid #d6cbb8",
  borderRadius: 999,
  padding: "6px 10px",
  background: "#fffaf2",
  color: "#43523a",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
};

const dangerMiniButtonStyle: CSSProperties = {
  ...miniButtonStyle,
  border: "1px solid #e0b4ad",
  background: "#fff8f7",
  color: "#a3473f",
};

const dangerButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  border: "1px solid #d99d96",
  borderRadius: 999,
  padding: "9px 15px",
  background: "#fff8f7",
  color: "#a3473f",
  fontSize: 14,
  fontWeight: 700,
  cursor: "pointer",
};

const permanentDeleteButtonStyle: CSSProperties = {
  ...dangerButtonStyle,
  border: "1px solid #a85249",
  background: "#a85249",
  color: "#fff",
};

const deletedHintStyle: CSSProperties = {
  color: "#8d554f",
  fontSize: 12,
  fontWeight: 700,
};

const deleteTargetBoxStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  border: "1px solid #eed5cf",
  borderRadius: 12,
  background: "#fff8f6",
  color: "#5b332f",
  padding: "10px 12px",
  fontSize: 13,
  wordBreak: "break-all",
};

const accountDeleteConfirmBoxStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

const confirmationCodeStyle: CSSProperties = {
  display: "block",
  padding: "7px 9px",
  borderRadius: 9,
  background: "#f3eee8",
  color: "#7c302b",
  fontSize: 14,
  letterSpacing: 0.4,
  wordBreak: "break-all",
};

const acknowledgementStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 9,
  color: "#5a3d39",
  fontSize: 13,
  lineHeight: 1.55,
};

const accountClosureNoticeStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  marginBottom: 12,
  padding: "11px 12px",
  border: "1px solid #ead7bd",
  borderRadius: 13,
  background: "#fffaf1",
  color: "#62533e",
  fontSize: 12,
  lineHeight: 1.6,
};

const accountClosureListStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  gap: 9,
};

const accountClosureRowStyle: CSSProperties = {
  minWidth: 0,
  padding: "11px 12px",
  border: "1px solid #e5dfd5",
  borderRadius: 13,
  background: "#fffdf9",
};

const accountClosureStatusStyle = (status: string): CSSProperties => ({
  ...pillStyle,
  background:
    status === "failed" ? "#fbe5e2" : status === "completed" ? "#e7f2df" : "#f6ecd5",
  color:
    status === "failed" ? "#98473f" : status === "completed" ? "#47693a" : "#826128",
});

const primaryButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  border: "none",
  borderRadius: 999,
  padding: "10px 16px",
  background: "#587947",
  color: "#fff",
  fontSize: 14,
  fontWeight: 700,
  textDecoration: "none",
  cursor: "pointer",
};

const secondaryButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  border: "1px solid #d6cbb8",
  borderRadius: 999,
  padding: "9px 15px",
  background: "#fffaf2",
  color: "#43523a",
  fontSize: 14,
  fontWeight: 700,
  textDecoration: "none",
  cursor: "pointer",
};

const emptyStyle: CSSProperties = {
  border: "1px dashed #d8cdb8",
  borderRadius: 16,
  padding: 18,
  color: "#727865",
  background: "#fffaf3",
};

const emptyDetailStyle: CSSProperties = {
  minHeight: 260,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  textAlign: "center",
  color: "#727865",
  lineHeight: 1.7,
};

const errorStyle: CSSProperties = {
  margin: "0 0 12px",
  color: "#a1432c",
  background: "#fff3ec",
  border: "1px solid #f1c8b8",
  borderRadius: 12,
  padding: "9px 11px",
  fontSize: 13,
};
