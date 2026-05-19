"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { supabase } from "@/lib/supabase";
import { showToast } from "@/components/Toast";
import {
  formatMembershipDate,
  formatStorageBytes,
  getMembershipPlanLabel,
  getMembershipStatusLabel,
} from "@/lib/membership";

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
  label: string;
  storageLimitBytes: number;
  baseMarketPostLimit: number;
  paidMonths: number | null;
  note: string;
};

const PLAN_PRESETS: PlanPreset[] = [
  {
    key: "trial",
    label: "免费试用",
    storageLimitBytes: 300_000_000,
    baseMarketPostLimit: 3,
    paidMonths: null,
    note: "保留原试用到期时间，仅修正试用额度。",
  },
  {
    key: "basic",
    label: "基础年费",
    storageLimitBytes: 1_000_000_000,
    baseMarketPostLimit: 10,
    paidMonths: 12,
    note: "适合普通长期用户：1GB，集市 10 条。",
  },
  {
    key: "large",
    label: "大空间",
    storageLimitBytes: 10_000_000_000,
    baseMarketPostLimit: 20,
    paidMonths: 12,
    note: "适合大量图片记录：10GB，集市略高。",
  },
  {
    key: "seller",
    label: "商家版",
    storageLimitBytes: 10_000_000_000,
    baseMarketPostLimit: 100,
    paidMonths: 12,
    note: "适合长期发布交换/求购/出售内容的账号。",
  },
  {
    key: "admin",
    label: "管理账号",
    storageLimitBytes: 20_000_000_000,
    baseMarketPostLimit: 999,
    paidMonths: 120,
    note: "仅给内部管理账号使用。",
  },
];

const PAYMENT_PLAN_OPTIONS = PLAN_PRESETS.filter(
  (preset): preset is PlanPreset & { key: PaymentPlanKey } => preset.key !== "trial"
);

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  wechat: "微信",
  alipay: "支付宝",
  paypal: "PayPal",
  manual: "人工确认",
  other: "其他",
};

const PAYMENT_STATUS_LABELS: Record<PaymentStatusKey, string> = {
  confirmed: "已确认",
  refunded: "已退款",
  canceled: "已取消",
};

function getDefaultPaymentAmount(plan: PaymentPlanKey, currency: PaymentCurrency) {
  if (plan === "basic") return currency === "CNY" ? 18 : 3;
  return 0;
}

function getPaymentPlanLabel(plan?: string | null) {
  return PAYMENT_PLAN_OPTIONS.find((item) => item.key === plan)?.label || getMembershipPlanLabel(plan);
}

function getPaymentMethodLabel(method?: string | null) {
  return PAYMENT_METHOD_LABELS[method as PaymentMethod] || method || "未记录";
}

function getPaymentStatusLabel(status?: string | null) {
  return PAYMENT_STATUS_LABELS[status as PaymentStatusKey] || status || "未记录";
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

function describeSupabaseError(error: unknown) {
  if (!error || typeof error !== "object") return String(error || "未知错误");

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
    .join("；") || "未知错误";
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
  const [userEmail, setUserEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [rows, setRows] = useState<AdminMembershipRow[]>([]);
  const [selected, setSelected] = useState<AdminMembershipRow | null>(null);
  const [plan, setPlan] = useState<PlanKey>("basic");
  const [paidUntilDate, setPaidUntilDate] = useState("");
  const [storageLimitBytes, setStorageLimitBytes] = useState("1000000000");
  const [baseMarketPostLimit, setBaseMarketPostLimit] = useState("10");
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [paymentRows, setPaymentRows] = useState<MembershipPaymentRow[]>([]);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentSaving, setPaymentSaving] = useState(false);
  const [paymentPlan, setPaymentPlan] = useState<PaymentPlanKey>("basic");
  const [paymentAmount, setPaymentAmount] = useState("18");
  const [paymentCurrency, setPaymentCurrency] = useState<PaymentCurrency>("CNY");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("manual");
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
  const [paymentPaidAtDate, setPaymentPaidAtDate] = useState(new Date().toISOString().slice(0, 10));
  const [paymentServiceMonths, setPaymentServiceMonths] = useState("12");
  const [paymentStatusSavingId, setPaymentStatusSavingId] = useState<string | null>(null);
  const paymentSubmittingRef = useRef(false);
  const paymentStatusSubmittingRef = useRef(false);

  async function loadRows(searchKeyword = keyword) {
    setLoading(true);
    setErrorMsg("");

    const { data, error } = await supabase.rpc("admin_search_memberships", {
      p_keyword: searchKeyword.trim(),
    });

    if (error) {
      logSupabaseError("admin search memberships error:", error);
      setRows([]);
      setErrorMsg(describeSupabaseError(error) || "读取会员列表失败");
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
        setUserEmail("");
        setIsAdmin(false);
        setChecking(false);
        setLoading(false);
        return;
      }

      setUserEmail(user.email || "");

      const { data: adminData, error: adminError } = await supabase.rpc("is_app_admin", {
        p_user_id: user.id,
      });

      if (adminError) {
        logSupabaseError("check admin error:", adminError);
        setIsAdmin(false);
        setErrorMsg(describeSupabaseError(adminError) || "无法确认管理员权限");
        setChecking(false);
        setLoading(false);
        return;
      }

      const allowed = Boolean(adminData);
      setIsAdmin(allowed);
      setChecking(false);

      if (allowed) {
        await loadRows("");
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      showToast("请选择会员方案");
      return;
    }

    if (plan !== "trial" && !paidUntilIso) {
      showToast("请填写付费到期日");
      return;
    }

    if (!Number.isFinite(safeStorageLimit) || safeStorageLimit <= 0) {
      showToast("容量上限必须大于 0");
      return;
    }

    if (!Number.isFinite(safeMarketLimit) || safeMarketLimit < 0) {
      showToast("集市额度不能小于 0");
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
      setErrorMsg(describeSupabaseError(error) || "更新会员失败");
      showToast("更新会员失败");
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
      const message = [result.error_message, result.error_detail].filter(Boolean).join("；") || "更新会员失败";
      setErrorMsg(message);
      showToast("更新会员失败");
      setSaving(false);
      return;
    }

    showToast("会员已更新");
    await loadRows(keyword);
    setSaving(false);
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
      showToast("付款金额必须大于 0");
      return;
    }

    if (!Number.isFinite(serviceMonthsValue) || serviceMonthsValue <= 0) {
      showToast("服务月数必须大于 0");
      return;
    }

    if (!Number.isFinite(safeStorageLimit) || safeStorageLimit <= 0) {
      showToast("容量上限必须大于 0");
      return;
    }

    if (!Number.isFinite(safeMarketLimit) || safeMarketLimit < 0) {
      showToast("集市额度不能小于 0");
      return;
    }

    const confirmText = [
      `确认要为「${selected.username || selected.email || selected.user_id}」开通 / 续费吗？`,
      `方案：${getPaymentPlanLabel(paymentPlan)}`,
      `金额：${formatPaymentAmount(amountValue, paymentCurrency)}`,
      `付款方式：${getPaymentMethodLabel(paymentMethod)}`,
      `付款编号：${finalPaymentReference}`,
      `服务月数：${serviceMonthsValue} 个月`,
      `容量：${formatStorageBytes(safeStorageLimit)}`,
      `集市额度：${safeMarketLimit} 条`,
      "",
      "确认后会同时写入付款记录并更新会员到期时间。",
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
        setErrorMsg(describeSupabaseError(error) || "记录付款失败");
        showToast("记录付款失败");
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
        const message = [result.error_message, result.error_detail].filter(Boolean).join("；") || "记录付款失败";
        setErrorMsg(message);
        showToast("记录付款失败");
        return;
      }

      showToast("付款已确认，会员已开通 / 续费");
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
      confirmed: "管理员恢复为已确认",
      refunded: "管理员标记为已退款",
      canceled: "管理员标记为已取消",
    };

    const confirmText = [
      `确认把这条付款记录改为「${getPaymentStatusLabel(nextStatus)}」吗？`,
      `金额：${formatPaymentAmount(payment.amount, payment.currency)}`,
      `付款方式：${getPaymentMethodLabel(payment.payment_method)}`,
      payment.payment_reference ? `流水号：${payment.payment_reference}` : "",
      "",
      "这个操作只修改付款记录状态，不会自动回滚会员期限。",
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
        setErrorMsg(describeSupabaseError(error) || "更新付款状态失败");
        showToast("更新付款状态失败");
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
        const message = [result.error_message, result.error_detail].filter(Boolean).join("；") || "更新付款状态失败";
        setErrorMsg(message);
        showToast("更新付款状态失败");
        return;
      }

      showToast("付款记录状态已更新");
      await loadPaymentRows(selected.user_id);
    } finally {
      paymentStatusSubmittingRef.current = false;
      setPaymentStatusSavingId(null);
    }
  }

  if (checking) {
    return <main style={pageStyle}>正在确认管理员权限...</main>;
  }

  if (!userEmail) {
    return (
      <main style={pageStyle}>
        <section style={noticeCardStyle}>
          <h1 style={titleStyle}>管理员会员管理</h1>
          <p style={mutedTextStyle}>请先登录管理员账号。</p>
          <Link href="/login" style={primaryButtonStyle}>去登录</Link>
        </section>
      </main>
    );
  }

  if (!isAdmin) {
    return (
      <main style={pageStyle}>
        <section style={noticeCardStyle}>
          <h1 style={titleStyle}>没有管理员权限</h1>
          <p style={mutedTextStyle}>当前账号：{userEmail}</p>
          <Link href="/profile" style={secondaryButtonStyle}>返回个人资料</Link>
        </section>
      </main>
    );
  }

  return (
    <main style={pageStyle}>
      <section style={headerStyle}>
        <div>
          <div style={eyebrowStyle}>后台管理</div>
          <h1 style={titleStyle}>会员手动开通</h1>
          <p style={mutedTextStyle}>
            当前用于人工开通年费、大空间或商家版。真实支付接入前，可先用这里处理测试账号和人工付款用户。
          </p>
        </div>
        <Link href="/membership" style={secondaryButtonStyle}>查看会员说明页</Link>
      </section>

      <section style={cardStyle}>
        <form onSubmit={handleSearch} style={searchRowStyle}>
          <input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="搜索邮箱、用户名或 user_id"
            style={inputStyle}
          />
          <button type="submit" style={primaryButtonStyle} disabled={loading}>
            {loading ? "搜索中..." : "搜索"}
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
            显示最近用户
          </button>
        </form>

        {errorMsg ? <p style={errorStyle}>{errorMsg}</p> : null}

        <div style={layoutStyle}>
          <div style={listStyle}>
            {loading ? (
              <div style={emptyStyle}>正在读取用户...</div>
            ) : rows.length === 0 ? (
              <div style={emptyStyle}>没有找到用户。</div>
            ) : (
              rows.map((row) => {
                const active = selected?.user_id === row.user_id;
                return (
                  <button
                    key={row.user_id}
                    type="button"
                    style={userItemStyle(active)}
                    onClick={() => setSelected(row)}
                  >
                    <div style={userTitleRowStyle}>
                      <strong style={userNameStyle}>{row.username || "未设置用户名"}</strong>
                      <span style={pillStyle}>{getMembershipStatusLabel(row.status)}</span>
                    </div>
                    <div style={smallTextStyle}>{row.email || row.user_id}</div>
                    <div style={smallTextStyle}>
                      {getMembershipPlanLabel(row.plan)} · 容量 {formatStorageBytes(row.storage_used || 0)} / {formatStorageBytes(row.storage_limit_bytes || 0)} · 集市 {Number(row.active_market_post_count || 0)} / {Number(row.market_post_limit || 0)}
                    </div>
                  </button>
                );
              })
            )}
          </div>

          <aside style={detailStyle}>
            {selected ? (
              <>
                <div style={detailTopStyle}>
                  <div>
                    <div style={sectionLabelStyle}>当前选择</div>
                    <h2 style={sectionTitleStyle}>{selected.username || selected.email || "未设置用户名"}</h2>
                    <p style={smallTextStyle}>{selected.user_id}</p>
                  </div>
                  <span style={pillStyle}>{getMembershipStatusLabel(selected.status)}</span>
                </div>

                <div style={summaryGridStyle}>
                  <InfoItem label="当前方案" value={getMembershipPlanLabel(selected.plan)} />
                  <InfoItem label="试用到期" value={formatMembershipDate(selected.trial_ends_at)} />
                  <InfoItem label="付费到期" value={formatMembershipDate(selected.paid_until)} />
                  <InfoItem label="容量" value={selectedUsageText} />
                  <InfoItem
                    label="集市额度"
                    value={`${Number(selected.active_market_post_count || 0)} / ${Number(selected.market_post_limit || 0)} 条`}
                  />
                  <InfoItem label="基础额度" value={`${Number(selected.base_market_post_limit || 0)} 条`} />
                </div>

                <div style={presetGridStyle}>
                  {PLAN_PRESETS.map((preset) => (
                    <button
                      key={preset.key}
                      type="button"
                      style={presetButtonStyle(plan === preset.key)}
                      onClick={() => handleApplyPreset(preset.key)}
                    >
                      <strong>{preset.label}</strong>
                      <span>{preset.note}</span>
                    </button>
                  ))}
                </div>

                <div style={formGridStyle}>
                  <label style={labelStyle}>
                    会员方案
                    <select
                      value={plan}
                      onChange={(event) => handleApplyPreset(event.target.value as PlanKey)}
                      style={inputStyle}
                    >
                      {PLAN_PRESETS.map((preset) => (
                        <option key={preset.key} value={preset.key}>{preset.label}</option>
                      ))}
                    </select>
                  </label>

                  <label style={labelStyle}>
                    付费到期日
                    <input
                      type="date"
                      value={paidUntilDate}
                      onChange={(event) => setPaidUntilDate(event.target.value)}
                      style={inputStyle}
                      disabled={plan === "trial"}
                    />
                  </label>

                  <label style={labelStyle}>
                    云端容量 bytes
                    <input
                      value={storageLimitBytes}
                      onChange={(event) => setStorageLimitBytes(event.target.value)}
                      style={inputStyle}
                      inputMode="numeric"
                    />
                    <span style={hintStyle}>{formatStorageBytes(Number(storageLimitBytes || 0))}</span>
                  </label>

                  <label style={labelStyle}>
                    集市基础额度
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
                    {saving ? "保存中..." : "保存会员设置"}
                  </button>
                  <button type="button" style={secondaryButtonStyle} onClick={() => void loadRows(keyword)} disabled={saving}>
                    重新读取
                  </button>
                </div>

                <div style={dividerStyle} />

                <section style={paymentSectionStyle}>
                  <div style={detailTopStyle}>
                    <div>
                      <div style={sectionLabelStyle}>人工收款</div>
                      <h3 style={subsectionTitleStyle}>确认付款并开通</h3>
                      <p style={smallTextStyle}>用于确认微信、支付宝、PayPal 或其他人工付款。保存后会同时写入付款记录，并按服务月数自动开通或续费会员。</p>
                    </div>
                  </div>

                  <div style={formGridStyle}>
                    <label style={labelStyle}>
                      付款方案
                      <select
                        value={paymentPlan}
                        onChange={(event) => handlePaymentPlanChange(event.target.value as PaymentPlanKey)}
                        style={inputStyle}
                      >
                        {PAYMENT_PLAN_OPTIONS.map((preset) => (
                          <option key={preset.key} value={preset.key}>{preset.label}</option>
                        ))}
                      </select>
                    </label>

                    <label style={labelStyle}>
                      币种
                      <select
                        value={paymentCurrency}
                        onChange={(event) => handlePaymentCurrencyChange(event.target.value as PaymentCurrency)}
                        style={inputStyle}
                      >
                        <option value="CNY">人民币 CNY</option>
                        <option value="USD">美元 USD</option>
                      </select>
                    </label>

                    <label style={labelStyle}>
                      付款金额
                      <input
                        value={paymentAmount}
                        onChange={(event) => setPaymentAmount(event.target.value)}
                        style={inputStyle}
                        inputMode="decimal"
                      />
                      <span style={hintStyle}>{formatPaymentAmount(paymentAmount, paymentCurrency)}</span>
                    </label>

                    <label style={labelStyle}>
                      付款方式
                      <select
                        value={paymentMethod}
                        onChange={(event) => {
                          const nextMethod = event.target.value as PaymentMethod;
                          setPaymentMethod(nextMethod);
                          regeneratePaymentReference(nextMethod, paymentPaidAtDate);
                        }}
                        style={inputStyle}
                      >
                        <option value="wechat">微信</option>
                        <option value="alipay">支付宝</option>
                        <option value="paypal">PayPal</option>
                        <option value="manual">人工确认</option>
                        <option value="other">其他</option>
                      </select>
                    </label>

                    <label style={labelStyle}>
                      付款日期
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
                      服务月数
                      <input
                        value={paymentServiceMonths}
                        onChange={(event) => setPaymentServiceMonths(event.target.value)}
                        style={inputStyle}
                        inputMode="numeric"
                      />
                      <span style={hintStyle}>通常基础年费填 12；系统会从当前到期日或今天起自动延长。</span>
                    </label>

                    <label style={labelStyle}>
                      付款编号 / PayPal 交易号
                      <div style={inlineFieldRowStyle}>
                        <input
                          value={paymentReference}
                          onChange={(event) => setPaymentReference(event.target.value)}
                          style={{ ...inputStyle, flex: 1 }}
                          placeholder="系统自动生成，可按实际交易号修改"
                        />
                        <button
                          type="button"
                          style={miniButtonStyle}
                          onClick={() => regeneratePaymentReference()}
                        >
                          重新生成
                        </button>
                      </div>
                      <span style={hintStyle}>用于防止重复点击或重复录入。同一用户、同一付款方式、同一编号只会确认一次。</span>
                    </label>
                  </div>

                  <label style={labelStyle}>
                    管理员备注
                    <textarea
                      value={paymentNote}
                      onChange={(event) => setPaymentNote(event.target.value)}
                      style={textareaStyle}
                      placeholder="例如：注册邮箱、付款截图说明、特殊开通原因"
                    />
                  </label>

                  <div style={{ ...actionRowStyle, marginTop: 12 }}>
                    <button type="button" style={primaryButtonStyle} onClick={handleCreatePayment} disabled={paymentSaving}>
                      {paymentSaving ? "确认中..." : "确认付款并开通"}
                    </button>
                    <button type="button" style={secondaryButtonStyle} onClick={() => void loadPaymentRows(selected.user_id)} disabled={paymentLoading}>
                      {paymentLoading ? "读取中..." : "刷新付款记录"}
                    </button>
                  </div>

                  <div style={paymentHistoryStyle}>
                    {paymentLoading ? (
                      <div style={emptyStyle}>正在读取付款记录...</div>
                    ) : paymentRows.length === 0 ? (
                      <div style={emptyStyle}>暂无付款记录。确认付款并开通后会显示在这里。</div>
                    ) : (
                      paymentRows.map((payment) => (
                        <div key={payment.id} style={paymentItemStyle}>
                          <div style={userTitleRowStyle}>
                            <strong>{formatPaymentAmount(payment.amount, payment.currency)}</strong>
                            <span style={pillStyle}>{getPaymentStatusLabel(payment.status)}</span>
                          </div>
                          <div style={smallTextStyle}>
                            {getPaymentPlanLabel(payment.plan)} · {getPaymentMethodLabel(payment.payment_method)} · 付款时间 {formatMembershipDate(payment.paid_at)}
                          </div>
                          <div style={smallTextStyle}>
                            服务期：{formatMembershipDate(payment.service_started_at)} - {formatMembershipDate(payment.service_ends_at)}
                          </div>
                          {payment.payment_reference ? <div style={smallTextStyle}>流水号：{payment.payment_reference}</div> : null}
                          {payment.note ? <div style={smallTextStyle}>备注：{payment.note}</div> : null}
                          <div style={paymentActionRowStyle}>
                            {payment.status !== "confirmed" ? (
                              <button
                                type="button"
                                style={miniButtonStyle}
                                onClick={() => void handleUpdatePaymentStatus(payment, "confirmed")}
                                disabled={paymentStatusSavingId === payment.id}
                              >
                                恢复确认
                              </button>
                            ) : null}
                            {payment.status !== "refunded" ? (
                              <button
                                type="button"
                                style={miniButtonStyle}
                                onClick={() => void handleUpdatePaymentStatus(payment, "refunded")}
                                disabled={paymentStatusSavingId === payment.id}
                              >
                                标记退款
                              </button>
                            ) : null}
                            {payment.status !== "canceled" ? (
                              <button
                                type="button"
                                style={miniButtonStyle}
                                onClick={() => void handleUpdatePaymentStatus(payment, "canceled")}
                                disabled={paymentStatusSavingId === payment.id}
                              >
                                标记取消
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
                从左侧选择一个用户，然后设置会员方案、到期日、容量和集市额度。
              </div>
            )}
          </aside>
        </div>
      </section>
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

const headerStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 16,
  alignItems: "flex-start",
  marginBottom: 20,
  flexWrap: "wrap",
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
