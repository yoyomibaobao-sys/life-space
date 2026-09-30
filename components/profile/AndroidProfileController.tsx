"use client";

import { useEffect, useState } from "react";
import MobileProfileView from "@/components/profile/MobileProfileView";
import { mobileProfileNavigation, profileIdentityAvatarStyle, profileIdentityAvatarFallbackStyle, savedUsernameStyle } from "@/components/profile/MobileProfilePresentation";
import type { MobileProfileModule } from "@/components/profile/MobileProfilePresentation";
import UiIcon from "@/components/ui/UiIcon";
import { buildLocationTextFromFields, buildRegionDisplay, getCountryName, getLocalizedCountryOptions, getRegionOptions, hasPresetRegions } from "@/lib/region-shared";
import { loadAndroidProfileLive } from "@/lib/android-profile-controller";
import type { OfflineProfileSnapshot } from "@/lib/android-offline-profile";
import { formatAccountNumber } from "@/lib/account-number";
import { formatStorage } from "@/lib/user-profile-shared";
import { getMembershipSummary, getUserTypeLabel } from "@/lib/membership";
import { useLanguage } from "@/lib/i18n/useLanguage";
import { supabase } from "@/lib/supabase";
import { Browser } from "@capacitor/browser";

type Live = Awaited<ReturnType<typeof loadAndroidProfileLive>>;

export default function AndroidProfileController({ snapshot, online, onBack, onLogout, onLogin, onProfileSaved }: {
  snapshot: OfflineProfileSnapshot;
  online: boolean;
  onBack: () => void;
  onLogout?: () => void;
  onLogin?: () => void;
  onProfileSaved?: () => void;
}) {
  const { language, t } = useLanguage();
  const [loaded, setLive] = useState<Live | null>(null);
  const live = snapshot.userId ? loaded : null;
  const [error, setError] = useState("");
  const [module, setModule] = useState<MobileProfileModule | null>(null);
  const [editingProfile, setEditingProfile] = useState(false);
  const [name, setName] = useState("");
  const [countryCode, setCountryCode] = useState("");
  const [countryName, setCountryName] = useState("");
  const [regionName, setRegionName] = useState("");
  const [cityName, setCityName] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploading, setUploading] = useState(false);
  useEffect(() => { if (!online) setEditingProfile(false); }, [online]);
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

  const membership = snapshot.userId ? live?.membership || snapshot.membership : null;
  const profile = snapshot.userId ? live?.profile : null;
  const modules = mobileProfileNavigation({
    language, native: true, admin: Boolean(live?.isAdmin),
    refundLabel: t.profile.refund_request_nav,
    legalLabel: t.profile.legal_rules_nav,
    feedbackLabel: t.feedback_and_contact,
    trashLabel: t.profile.modules.trash,
    adminSupportLabel: t.support_admin_title,
  });
  const storageUsed = Number(profile?.storage_used ?? snapshot.storageUsed ?? 0);
  const storageLimit = Number(membership?.storage_limit_bytes ?? profile?.storage_limit ?? snapshot.storageLimit ?? 0);
  const userType = getUserTypeLabel({ signedIn: Boolean(snapshot.userId), membership,
    loading: false, failed: Boolean(error) }, language);
  const needNetwork = language === "zh" ? "需要联网。" : "A network connection is required.";

  const locationParts = {
    countryCode: profile?.country_code || snapshot.countryCode,
    countryName: profile?.country_name || snapshot.countryName,
    regionName: profile?.region_name || snapshot.regionName,
    cityName: profile?.city_name || snapshot.cityName,
    location: profile?.location || snapshot.location,
  };
  function startEditing() {
    if (!online || !live) return;
    setName(profile?.username || "");
    setCountryCode(locationParts.countryCode || "");
    setCountryName(locationParts.countryName || "");
    setRegionName(locationParts.regionName || "");
    setCityName(locationParts.cityName || "");
    setEditingProfile(true);
  }
  async function saveProfile() {
    if (!online || !snapshot.userId || !live || savingProfile) return;
    const value = name.trim();
    if (value.length < 2) { setError(t.profile.username_too_short); return; }
    if (countryCode === "OTHER" && !countryName.trim()) { setError(t.profile.custom_country_required); return; }
    setSavingProfile(true);
    setError("");
    try {
      const safeCountry = countryCode === "OTHER" ? countryName.trim() : getCountryName(countryCode, countryName, language);
      const fields = { countryCode, countryName: safeCountry, regionName: regionName.trim(), cityName: cityName.trim() };
      const result = await supabase.from("profiles").update({
        username: value, country_code: countryCode || null, country_name: safeCountry || null,
        region_name: fields.regionName || null, city_name: fields.cityName || null,
        location: buildLocationTextFromFields(fields, language) || null,
      }).eq("id", snapshot.userId).select("id").single();
      if (result.error) throw result.error;
      setLive(await loadAndroidProfileLive(snapshot.userId));
      onProfileSaved?.();
      setEditingProfile(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setSavingProfile(false); }
  }
  async function uploadAvatar(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !online || !snapshot.userId || !live) return;
    if (!file.type.startsWith("image/") || file.size > 3 * 1024 * 1024) {
      setError(file.size > 3 * 1024 * 1024 ? t.profile.avatar_size_limit : t.profile.image_required);
      return;
    }
    setUploading(true);
    setError("");
    try {
      const extension = file.name.split(".").pop() || "jpg";
      const path = `${snapshot.userId}/${Date.now()}.${extension}`;
      const upload = await supabase.storage.from("avatars").upload(path, file, { cacheControl: "3600", upsert: true });
      if (upload.error) throw upload.error;
      const url = supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl;
      const update = await supabase.from("profiles").update({ avatar_url: url }).eq("id", snapshot.userId);
      if (update.error) throw update.error;
      setLive(await loadAndroidProfileLive(snapshot.userId));
      onProfileSaved?.();
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setUploading(false); event.target.value = ""; }
  }

  return <MobileProfileView
    email={snapshot.email} avatarUrl={profile?.avatar_url || snapshot.avatarUrl}
    username={profile?.username || snapshot.username || t.profile.unset_username}
    accountNumber={formatAccountNumber(profile?.account_number || snapshot.accountNumber) || "—"}
    helpfulCount={live ? String(live.stats.receivedFlowerCount) : "—"}
    userType={userType}
    membershipText={snapshot.userId ? getMembershipSummary(membership, language) : null}
    experienceCount={snapshot.userId && snapshot.experienceCardCount != null ? String(snapshot.experienceCardCount) : null}
    storageText={storageLimit ? `${formatStorage(storageUsed)} / ${formatStorage(storageLimit)}` : (language === "zh" ? "本机可用" : "Available on device")}
    identityTop={<>
      <label style={{ display: "grid", gap: 3, fontSize: 12, color: "#52654d" }}>
        {profile?.avatar_url || snapshot.avatarUrl
          ? <img src={profile?.avatar_url || snapshot.avatarUrl || ""} alt="" style={profileIdentityAvatarStyle} />
          : <span style={profileIdentityAvatarFallbackStyle}><UiIcon name="sprout" size={24} /></span>}
        {online && live ? <><span>{uploading ? t.profile.uploading : t.profile.change_avatar}</span>
          <input type="file" accept="image/*" hidden disabled={uploading} onChange={(event) => void uploadAvatar(event)} /></> : null}
      </label>
      <div style={{ minWidth: 0, flex: 1 }}>
        <label style={{ fontSize: 12, color: "#53664f" }}>{t.profile.username}</label>
        {editingProfile ? <input aria-label={t.profile.username} value={name} maxLength={60}
          onChange={(event) => setName(event.target.value)} style={{ width: "100%", fontSize: 16 }} />
          : <div style={savedUsernameStyle}>{profile?.username || snapshot.username || t.profile.unset_username}</div>}
      </div>
      <button type="button" disabled={!online || !live} onClick={() => editingProfile ? setEditingProfile(false) : startEditing()}
        style={{ fontSize: 14 }}>{editingProfile ? t.profile.cancel_edit : t.profile.edit_profile}</button>
    </>}
    identityAfterStats={editingProfile ? <section style={{ display: "grid", gap: 10, marginTop: 12 }}>
      <label>{t.profile.country_region}
        <select value={countryCode} onChange={(event) => { setCountryCode(event.target.value); setRegionName(""); }} style={{ display: "block", width: "100%", fontSize: 16 }}>
          <option value="">{t.profile.select}</option>
          {getLocalizedCountryOptions(language).map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
        </select>
      </label>
      {countryCode === "OTHER" ? <label>{t.profile.custom_country_region}<input value={countryName} onChange={(event) => setCountryName(event.target.value)} /></label> : null}
      <label>{t.profile.region}
        {hasPresetRegions(countryCode) ? <select value={regionName} onChange={(event) => setRegionName(event.target.value)}>
          <option value="">{t.profile.select}</option>
          {getRegionOptions(countryCode, language).map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select> : <input value={regionName} onChange={(event) => setRegionName(event.target.value)} />}
      </label>
      <label>{t.profile.city}<input value={cityName} onChange={(event) => setCityName(event.target.value)} /></label>
      <button type="button" disabled={savingProfile} onClick={() => void saveProfile()}>{savingProfile ? t.profile.saving : t.profile.save_profile}</button>
    </section> : <div style={{ display: "grid", gap: 3, marginTop: 12, color: "#52654d", fontSize: 14 }}>
      <span>{t.profile.location_summary}</span>
      <strong style={{ color: "#30432d" }}>{buildRegionDisplay(locationParts, language)}</strong>
      {!online && snapshot.userId ? <span>{language === "zh" ? "联网后编辑资料" : "Connect to edit your profile"}</span> : null}
    </div>}
    error={error ? <p role="alert">{error}</p> : null}
    modules={modules} activeModule={module}
    onModuleChange={(next) => setModule((current) => current === next ? null : next)}
    onBack={onBack} onLogout={snapshot.userId ? onLogout : undefined}
    onLogin={!snapshot.userId && online ? onLogin : undefined}
  >
    {module === "payment" ? (
      live ? <div data-android-profile-payments="true">
        {live.payments.length ? live.payments.map((order) => <p key={order.id}>
          {order.order_number || order.id} · {order.plan} · {order.status} · {order.currency} {order.amount}
        </p>) : <p>{t.profile.no_payment_orders}</p>}
      </div> : <p>{needNetwork}</p>
    ) : null}
    {module === "backup" ? <div><p>{language === "zh" ? "本机项目可离线使用；云端导出需联网。" : "Local projects work offline. Cloud export requires a connection."}</p>
      {online ? <button type="button" onClick={() => void Browser.open({ url: "https://life-space.uk/profile" })}>{language === "zh" ? "打开云端备份与导出" : "Open backup and export"}</button> : <p>{needNetwork}</p>}</div> : null}
    {module === "account" ? <div><p>{language === "zh" ? "退出登录不会删除本机未同步内容。" : "Sign out keeps unsynced local content."}</p>
      {online ? <div style={{ display: "grid", gap: 10 }}>
        <button type="button" onClick={() => void Browser.open({ url: "https://life-space.uk/profile" })}>{language === "zh" ? "打开账号管理" : "Open account management"}</button>
        <button type="button" onClick={() => void Browser.open({ url: "https://life-space.uk/profile#profile-module-account" })}>{t.profile.delete_account}</button>
      </div> : <p>{needNetwork}</p>}</div> : null}
  </MobileProfileView>;
}
