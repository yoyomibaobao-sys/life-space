"use client";

import { useEffect, useState } from "react";
import MobileProfileView from "@/components/profile/MobileProfileView";
import type { MobileProfileModule, MobileProfileNavItem } from "@/components/profile/MobileProfilePresentation";
import { loadAndroidProfileLive } from "@/lib/android-profile-controller";
import type { OfflineProfileSnapshot } from "@/lib/android-offline-profile";
import { formatAccountNumber } from "@/lib/account-number";
import { formatStorage } from "@/lib/user-profile-shared";
import { getUserTypeLabel } from "@/lib/membership";
import { useLanguage } from "@/lib/i18n/useLanguage";
import { supabase } from "@/lib/supabase";

type Live = Awaited<ReturnType<typeof loadAndroidProfileLive>>;

export default function AndroidProfileController({ snapshot, online, onBack, onLogout }: {
  snapshot: OfflineProfileSnapshot;
  online: boolean;
  onBack: () => void;
  onLogout: () => void;
}) {
  const { language, t } = useLanguage();
  const [live, setLive] = useState<Live | null>(null);
  const [error, setError] = useState("");
  const [module, setModule] = useState<MobileProfileModule | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState("");
  const [savingName, setSavingName] = useState(false);
  useEffect(() => {
    if (!online || !snapshot.userId) { setLive(null); return; }
    let active = true;
    setError("");
    void loadAndroidProfileLive(snapshot.userId).then((data) => {
      if (active) setLive(data);
    }).catch((cause) => {
      if (active) setError(cause instanceof Error ? cause.message : String(cause));
    });
    return () => { active = false; };
  }, [online, snapshot.userId]);

  const membership = live?.membership || snapshot.membership;
  const profile = live?.profile;
  const modules: MobileProfileNavItem[] = [
    { href: "/membership/payment", label: language === "zh" ? "开通云会员" : "Cloud Membership" },
    { value: "payment", label: language === "zh" ? "订单进度查询" : "Order progress" },
    { href: "/membership/benefits", label: language === "zh" ? "会员类别说明" : "Membership types" },
    { value: "backup", label: language === "zh" ? "备份与导出" : "Backup & export" },
    { href: "/profile/trash", label: t.profile.modules.trash },
    { value: "account", label: language === "zh" ? "账号管理" : "Account management" },
    ...(live?.isAdmin ? [{ href: "/admin/memberships", label: language === "zh" ? "用户管理" : "User management" }] : []),
  ];
  const storageUsed = Number(profile?.storage_used ?? snapshot.storageUsed ?? 0);
  const storageLimit = Number(membership?.storage_limit_bytes ?? profile?.storage_limit ?? snapshot.storageLimit ?? 0);
  const userType = getUserTypeLabel({ signedIn: Boolean(snapshot.userId), membership,
    loading: false, failed: Boolean(error) }, language);
  const needNetwork = language === "zh" ? "需要联网。" : "A network connection is required.";

  async function saveName(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!online || !snapshot.userId || !live || savingName) return;
    const value = name.trim();
    if (!value) return;
    setSavingName(true);
    setError("");
    try {
      const result = await supabase.from("profiles").update({ username: value })
        .eq("id", snapshot.userId).select("id").single();
      if (result.error) throw result.error;
      setLive(await loadAndroidProfileLive(snapshot.userId));
      setEditingName(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally { setSavingName(false); }
  }

  return <MobileProfileView
    email={snapshot.email} avatarUrl={profile?.avatar_url || snapshot.avatarUrl}
    username={profile?.username || snapshot.username || t.profile.unset_username}
    accountNumber={formatAccountNumber(profile?.account_number) || "—"}
    helpfulCount={live ? String(live.stats.receivedFlowerCount) : "—"}
    userType={userType}
    storageText={storageLimit ? `${formatStorage(storageUsed)} / ${formatStorage(storageLimit)}` : (language === "zh" ? "本机可用" : "Available on device")}
    identityAfterStats={live && online ? (
      editingName ? <form onSubmit={(event) => void saveName(event)} style={{ marginTop: 10, display: "flex", gap: 8 }}>
        <input aria-label={language === "zh" ? "用户名" : "Username"} value={name}
          maxLength={60} onChange={(event) => setName(event.target.value)} />
        <button type="submit" disabled={savingName || !name.trim()}>{language === "zh" ? "保存" : "Save"}</button>
        <button type="button" onClick={() => setEditingName(false)}>{t.cancel}</button>
      </form> : <button type="button" onClick={() => { setName(profile?.username || ""); setEditingName(true); }}
        style={{ marginTop: 10 }}>{language === "zh" ? "修改用户名" : "Edit username"}</button>
    ) : null}
    error={error ? <p role="alert">{error}</p> : null}
    modules={modules} activeModule={module}
    onModuleChange={(next) => setModule((current) => current === next ? null : next)}
    onBack={onBack} onLogout={snapshot.userId ? onLogout : undefined}
  >
    {module === "payment" ? (
      live ? <div data-android-profile-payments="true">
        {live.payments.length ? live.payments.map((order) => <p key={order.id}>
          {order.order_number || order.id} · {order.plan} · {order.status} · {order.currency} {order.amount}
        </p>) : <p>{t.profile.no_payment_orders}</p>}
      </div> : <p>{needNetwork}</p>
    ) : null}
    {module === "backup" ? <p>{language === "zh" ? "本机项目可离线使用；云端导出需要联网并在网页完成。" : "Local projects remain available offline. Cloud export requires the website."}</p> : null}
    {module === "account" ? <p>{language === "zh" ? "退出登录不会删除本机未同步内容。注销账号须联网在网页完成。" : "Sign out keeps unsynced local content. Account deletion requires the website."}</p> : null}
  </MobileProfileView>;
}
