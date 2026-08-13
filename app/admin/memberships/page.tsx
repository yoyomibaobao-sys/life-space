"use client";

import Link from "next/link";
import { buildLoginHref } from "@/lib/auth-return";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { supabase } from "@/lib/supabase";
import ConfirmDialog from "@/components/ConfirmDialog";
import { showToast } from "@/components/Toast";
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

type PlanKey = "trial" | "basic" | "large" | "seller" | "admin";
type PaymentPlanKey = Exclude<PlanKey, "trial">;
type PaymentCurrency = "CNY" | "USD";
type PaymentMethod = "wechat" | "alipay" | "paypal" | "manual" | "other";
type PaymentStatusKey = "confirmed" | "refunded" | "canceled";

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
  if (status === "confirmed") return copy.status_confirmed;
  if (status === "refunded") return copy.status_refunded;
  if (status === "canceled") return copy.status_canceled;
  return status || copy.not_recorded;
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

type PaymentStatusUpdateResult = {
  ok: boolean | null;
  error_message: string | null;
  error_detail: string | null;
  id?: string | null;
  user_id?: string | null;
  plan?: string | null;
  status?: string | null;
  amount?: number | string | null;
  currency?: string | null;
  payment_method?: string | null;
  payment_reference?: string | null;
  note?: string | null;
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
  const [paymentStatusSavingId, setPaymentStatusSavingId] = useState<string | null>(null);
  const paymentSubmittingRef = useRef(false);
  const paymentStatusSubmittingRef = useRef(false);

  const isMobileViewport = viewportWidth < 760;
  const currentPageStyle = isMobileViewport ? mobilePageStyle : pageStyle;
  const currentHeaderStyle = isMobileViewport ? mobileHeaderStyle : headerStyle;
  const currentCardStyle = isMobileViewport ? mobileCardStyle : cardStyle;
  const currentLayoutStyle = isMobileViewport ? mobileLayoutStyle : layoutStyle;
  const currentDetailStyle = isMobileViewport ? mobileDetailStyle : detailStyle;
  const currentSummaryGridStyle = isMobileViewport ? mobileSummaryGridStyle : summaryGridStyle;
  const currentPresetGridStyle = isMobileViewport ? mobilePresetGridStyle : presetGridStyle;
  const currentFormGridStyle = isMobileViewport ? mobileFormGridStyle : formGridStyle;

  useEffect(() => {
    const updateViewportWidth = () => setViewportWidth(window.innerWidth);
    updateViewportWidth();
    window.addEventListener("resize", updateViewportWidth);
    return () => window.removeEventListener("resize", updateViewportWidth);
  }, []);

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

  async function loadPaymentRows(userId: string) {
    setPaymentLoading(true);

    const { data, error } = await supabase
      .from("membership_payments")
      .select("*")
      .eq("user_id", userId)
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
        await Promise.all([loadRows(""), loadSignupRolloutStatus()]);
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
      await loadRows(keyword);
    } catch {
      setErrorMsg(t.admin_memberships.delete_retry);
      showToast(t.admin_memberships.delete_retry);
    } finally {
      setDeleteSaving(false);
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
      await loadPaymentRows(selected.user_id);
      await loadRows(keyword);
    } finally {
      paymentSubmittingRef.current = false;
      setPaymentSaving(false);
    }
  }

  async function handleUpdatePaymentStatus(payment: MembershipPaymentRow, nextStatus: PaymentStatusKey) {
    if (!selected || paymentStatusSavingId || paymentStatusSubmittingRef.current) return;

    const noteMap: Record<PaymentStatusKey, string> = {
      confirmed: t.admin_memberships.note_restore_confirmed,
      refunded: t.admin_memberships.note_mark_refunded,
      canceled: t.admin_memberships.note_mark_canceled,
    };

    const confirmText = [
      `${t.admin_memberships.status_confirm_prefix}${getPaymentStatusLabel(
        nextStatus,
        language
      )}${t.admin_memberships.status_confirm_suffix}`,
      `${t.admin_memberships.amount_prefix}${formatPaymentAmount(
        payment.amount,
        payment.currency
      )}`,
      `${t.admin_memberships.payment_method_prefix}${getPaymentMethodLabel(
        payment.payment_method,
        language
      )}`,
      payment.payment_reference
        ? `${t.admin_memberships.transaction_prefix}${payment.payment_reference}`
        : "",
      "",
      t.admin_memberships.status_change_notice,
    ].filter(Boolean).join("\n");

    if (!window.confirm(confirmText)) return;

    paymentStatusSubmittingRef.current = true;
    setPaymentStatusSavingId(payment.id);
    setErrorMsg("");

    try {
      const { data, error } = await supabase.rpc("admin_update_membership_payment_status_json", {
        p_payment_id: payment.id,
        p_status: nextStatus,
        p_note_append: noteMap[nextStatus],
      });

      if (error) {
        logSupabaseError("admin update payment status rpc error:", error);
        setErrorMsg(
          describeSupabaseError(error, language) ||
            t.admin_memberships.payment_status_update_failed
        );
        showToast(t.admin_memberships.payment_status_update_failed);
        return;
      }

      const rawResult = firstRpcRow<unknown>(data as unknown);
      const result =
        rawResult && typeof rawResult === "object"
          ? (rawResult as PaymentStatusUpdateResult)
          : ({
              ok: false,
              error_message: "empty_rpc_result",
              error_detail: typeof rawResult === "undefined" ? "undefined" : JSON.stringify(rawResult),
            } as PaymentStatusUpdateResult);

      if (!result.ok) {
        const message =
          [result.error_message, result.error_detail]
            .filter(Boolean)
            .join(language === "en" ? "; " : "；") ||
          t.admin_memberships.payment_status_update_failed;
        setErrorMsg(message);
        showToast(t.admin_memberships.payment_status_update_failed);
        return;
      }

      showToast(t.admin_memberships.payment_status_updated);
      await loadPaymentRows(selected.user_id);
    } finally {
      paymentStatusSubmittingRef.current = false;
      setPaymentStatusSavingId(null);
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

      <section style={{ ...currentCardStyle, marginBottom: isMobileViewport ? 12 : 16 }}>
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

        <button
          type="button"
          style={secondaryButtonStyle}
          onClick={() => void loadSignupRolloutStatus()}
          disabled={rolloutLoading}
        >
          {t.admin_memberships.reload_rollout}
        </button>
      </section>

      <section style={currentCardStyle}>
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
                      {getMembershipPlanLabel(row.plan, language)} · {t.admin_memberships.capacity}{" "}
                      {formatStorageBytes(row.storage_used || 0)} / {formatStorageBytes(row.storage_limit_bytes || 0)} · {t.admin_memberships.market}{" "}
                      {Number(row.active_market_post_count || 0)} / {Number(row.market_post_limit || 0)}
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
                          <div style={paymentActionRowStyle}>
                            {payment.status !== "confirmed" ? (
                              <button
                                type="button"
                                style={miniButtonStyle}
                                onClick={() => void handleUpdatePaymentStatus(payment, "confirmed")}
                                disabled={paymentStatusSavingId === payment.id}
                              >
                                {t.admin_memberships.restore_confirmation}
                              </button>
                            ) : null}
                            {payment.status !== "refunded" ? (
                              <button
                                type="button"
                                style={miniButtonStyle}
                                onClick={() => void handleUpdatePaymentStatus(payment, "refunded")}
                                disabled={paymentStatusSavingId === payment.id}
                              >
                                {t.admin_memberships.mark_refund}
                              </button>
                            ) : null}
                            {payment.status !== "canceled" ? (
                              <button
                                type="button"
                                style={miniButtonStyle}
                                onClick={() => void handleUpdatePaymentStatus(payment, "canceled")}
                                disabled={paymentStatusSavingId === payment.id}
                              >
                                {t.admin_memberships.mark_cancel}
                              </button>
                            ) : null}
                          </div>
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

const paymentActionRowStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  marginTop: 10,
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
