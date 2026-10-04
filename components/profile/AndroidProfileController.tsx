"use client";

import { useEffect, useState, type CSSProperties } from "react";
import MobileProfileView from "@/components/profile/MobileProfileView";
import {
  androidProfileIdentityAvatarFallbackStyle,
  androidProfileIdentityAvatarStyle,
  androidProfileIdentityEmailStyle,
  androidProfileIdentityUsernameStyle,
  mobileProfileNavigation,
  profileIdentityAvatarColumnStyle,
  profileIdentityDetailsStyle,
  profileIdentityInlineControlStyle,
  profileIdentityLocationButtonStyle,
  profileIdentityLocationRowStyle,
  profileIdentityMemberNumberStyle,
  profileIdentityMembershipStyle,
} from "@/components/profile/MobileProfilePresentation";
import type { MobileProfileModule } from "@/components/profile/MobileProfilePresentation";
import UiIcon from "@/components/ui/UiIcon";
import { buildLocationTextFromFields, buildRegionDisplay, getCountryName, getLocalizedCountryOptions, getRegionOptions, hasPresetRegions } from "@/lib/region-shared";
import { loadAndroidProfileLive } from "@/lib/android-profile-controller";
import type { OfflineProfileSnapshot } from "@/lib/android-offline-profile";
import { parseAccountNumber } from "@/lib/account-number";
import { formatStorage } from "@/lib/user-profile-shared";
import { formatMembershipDate, getMembershipEndDate, getUserTypeLabel } from "@/lib/membership";
import { useLanguage } from "@/lib/i18n/useLanguage";
import { supabase } from "@/lib/supabase";
import { Browser } from "@capacitor/browser";

type Live = Awaited<ReturnType<typeof loadAndroidProfileLive>>;

export default function AndroidProfileController({ snapshot, online, onBack, onLogout, onLogin, onProfileSaved, localSpaceVisible, onLocalSpaceVisibilityChange }: {
  snapshot: OfflineProfileSnapshot;
  online: boolean;
  onBack: () => void;
  onLogout?: () => void;
  onLogin?: () => void;
  onProfileSaved?: () => void;
  localSpaceVisible?: boolean;
  onLocalSpaceVisibilityChange?: (visible: boolean) => void;
}) {
  const { language, t } = useLanguage();
  const [loaded, setLive] = useState<Live | null>(null);
  const live = snapshot.userId ? loaded : null;
  const [error, setError] = useState("");
  const [module, setModule] = useState<MobileProfileModule | null>(null);
  const [editingProfile, setEditingProfile] = useState<"username" | "location" | null>(null);
  const [name, setName] = useState("");
  const [countryCode, setCountryCode] = useState("");
  const [countryName, setCountryName] = useState("");
  const [regionName, setRegionName] = useState("");
  const [cityName, setCityName] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploading, setUploading] = useState(false);
  useEffect(() => { if (!online) setEditingProfile(null); }, [online]);
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
  const parsedAccountNumber = parseAccountNumber(profile?.account_number || snapshot.accountNumber);
  const accountNumber = parsedAccountNumber
    ? `No.${String(parsedAccountNumber.registrationSequence).padStart(5, "0")}`
    : "";
  const membershipEndDate = getMembershipEndDate(membership);
  const hasMembershipTerm = Boolean(
    membershipEndDate && membership && ["trial", "basic", "large"].includes(String(membership.plan)),
  );
  const membershipLine = hasMembershipTerm
    ? `${userType} · ${membership?.can_create_content === true
      ? (language === "en" ? "Valid until" : "有效至")
      : (language === "en" ? "Ended" : "已到期")} ${formatMembershipDate(membershipEndDate, language)}`
    : userType;

  const locationParts = {
    countryCode: profile?.country_code || snapshot.countryCode,
    countryName: profile?.country_name || snapshot.countryName,
    regionName: profile?.region_name || snapshot.regionName,
    cityName: profile?.city_name || snapshot.cityName,
    location: profile?.location || snapshot.location,
  };
  function startEditing(field: "username" | "location") {
    if (!online || !live) return;
    setName(profile?.username || "");
    setCountryCode(locationParts.countryCode || "");
    setCountryName(locationParts.countryName || "");
    setRegionName(locationParts.regionName || "");
    setCityName(locationParts.cityName || "");
    setEditingProfile(field);
  }
  async function saveProfile() {
    if (!online || !snapshot.userId || !live || savingProfile) return;
    const value = name.trim();
    if (value.length < 2) { setError(t.profile.username_too_short); return; }
    if (countryCode === "OTHER" && !countryName.trim()) { setError(t.profile.custom_country_required); return; }
    const editingMode = editingProfile;
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
      setEditingProfile((current) => current === editingMode ? null : current);
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

  const countryDisplay = getCountryName(locationParts.countryCode, locationParts.countryName, language);
  const locationDisplayParts = [countryDisplay, locationParts.regionName, locationParts.cityName]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  const locationDisplay = locationDisplayParts.length
    ? locationDisplayParts.join(" · ")
    : buildRegionDisplay(locationParts, language);

  return <MobileProfileView
    email={snapshot.email} avatarUrl={profile?.avatar_url || snapshot.avatarUrl}
    username={profile?.username || snapshot.username || t.profile.unset_username}
    accountNumber={accountNumber}
    helpfulCount={live ? String(live.stats.receivedFlowerCount) : "—"}
    userType={userType}
    membershipLine={membershipLine}
    androidIdentityLayout
    storageText={storageLimit ? `${formatStorage(storageUsed)} / ${formatStorage(storageLimit)}` : (language === "zh" ? "本机可用" : "Available on device")}
    identityTop={<>
      <label
        style={{ ...profileIdentityAvatarColumnStyle, cursor: online && live ? "pointer" : "default" }}
        title={online && live ? (uploading ? t.profile.uploading : t.profile.change_avatar) : undefined}
      >
        {profile?.avatar_url || snapshot.avatarUrl
          ? <img src={profile?.avatar_url || snapshot.avatarUrl || ""} alt="" style={androidProfileIdentityAvatarStyle} />
          : <span style={androidProfileIdentityAvatarFallbackStyle}><UiIcon name="sprout" size={24} /></span>}
        {accountNumber ? <span style={profileIdentityMemberNumberStyle}>{uploading ? t.profile.uploading : accountNumber}</span> : null}
        {online && live ? <input type="file" accept="image/*" hidden disabled={uploading} onChange={(event) => void uploadAvatar(event)} /> : null}
      </label>
      <div style={profileIdentityDetailsStyle}>
        {editingProfile === "username" ? (
          <input
            aria-label={t.profile.username}
            value={name}
            maxLength={60}
            autoFocus
            disabled={savingProfile}
            onChange={(event) => setName(event.target.value)}
            onBlur={() => void saveProfile()}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
              if (event.key === "Escape") setEditingProfile(null);
            }}
            style={{ ...profileIdentityInlineControlStyle, width: "100%", maxWidth: "100%", height: 30, minHeight: 30, flex: "none", fontSize: 16, fontWeight: 800 }}
          />
        ) : (
          <button
            type="button"
            disabled={!online || !live}
            onClick={() => startEditing("username")}
            style={{ ...androidProfileIdentityUsernameStyle, border: 0, padding: 0, background: "transparent", textAlign: "left", cursor: online && live ? "text" : "default" }}
          >
            {profile?.username || snapshot.username || t.profile.unset_username}
          </button>
        )}
        {snapshot.email ? <div style={androidProfileIdentityEmailStyle} title={snapshot.email}>{snapshot.email}</div> : null}
        <div style={profileIdentityMembershipStyle}>{membershipLine}</div>
      </div>
    </>}
    identityAfterStats={editingProfile === "location" ? (
      <div
        style={profileIdentityLocationRowStyle}
        onBlur={(event) => {
          if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
          void saveProfile();
        }}
      >
        <select
          aria-label={t.profile.country_region}
          value={countryCode}
          autoFocus
          disabled={savingProfile}
          onChange={(event) => { setCountryCode(event.target.value); setRegionName(""); }}
          style={profileIdentityInlineControlStyle}
        >
          <option value="">{t.profile.select}</option>
          {getLocalizedCountryOptions(language).map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
        </select>
        {countryCode === "OTHER" ? (
          <input
            aria-label={t.profile.custom_country_region}
            value={countryName}
            disabled={savingProfile}
            onChange={(event) => setCountryName(event.target.value)}
            style={profileIdentityInlineControlStyle}
          />
        ) : null}
        <span>·</span>
        {hasPresetRegions(countryCode) ? (
          <select
            aria-label={t.profile.region}
            value={regionName}
            disabled={savingProfile}
            onChange={(event) => setRegionName(event.target.value)}
            style={profileIdentityInlineControlStyle}
          >
            <option value="">{t.profile.select}</option>
            {getRegionOptions(countryCode, language).map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        ) : (
          <input
            aria-label={t.profile.region}
            value={regionName}
            disabled={savingProfile}
            onChange={(event) => setRegionName(event.target.value)}
            style={profileIdentityInlineControlStyle}
          />
        )}
        <span>·</span>
        <input
          aria-label={t.profile.city}
          value={cityName}
          disabled={savingProfile}
          onChange={(event) => setCityName(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}
          style={profileIdentityInlineControlStyle}
        />
      </div>
    ) : (
      <div style={profileIdentityLocationRowStyle}>
        <button
          type="button"
          disabled={!online || !live}
          onClick={() => startEditing("location")}
          style={{ ...profileIdentityLocationButtonStyle, cursor: online && live ? "text" : "default" }}
        >
          {locationDisplay || t.profile.not_assigned}
        </button>
        {!online && snapshot.userId ? <span>{language === "zh" ? "联网后编辑资料" : "Connect to edit your profile"}</span> : null}
      </div>
    )}
    error={error ? <p role="alert">{error}</p> : null}
    preferencesExtra={onLocalSpaceVisibilityChange ? (
      <div style={localSpacePreferenceGroupStyle}>
        <div style={localSpacePreferenceRowStyle}>
          <span>{language === "zh" ? "显示本地空间" : "Show local space"}</span>
          <button
            type="button"
            role="switch"
            aria-checked={Boolean(localSpaceVisible)}
            aria-label={language === "zh" ? "显示本地空间" : "Show local space"}
            onClick={() => onLocalSpaceVisibilityChange(!localSpaceVisible)}
            style={localSpaceToggleStyle(Boolean(localSpaceVisible))}
          >
            <span style={localSpaceToggleThumbStyle(Boolean(localSpaceVisible))} />
          </button>
        </div>
        <p style={localSpacePreferenceHintStyle}>
          {language === "zh"
            ? "无本地内容时自动隐藏；关闭后只隐藏本地空间入口，不删除本机数据。"
            : "Hidden automatically when there is no local content. Turning this off only hides the local-space entry; device data is not deleted."}
        </p>
      </div>
    ) : undefined}
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

const localSpacePreferenceGroupStyle: CSSProperties = {
  borderBottom: "1px solid #edf1e9",
};

const localSpacePreferenceHintStyle: CSSProperties = {
  margin: "-2px 12px 10px",
  color: "#7a8675",
  fontSize: 12,
  lineHeight: 1.5,
};

const localSpacePreferenceRowStyle: CSSProperties = {
  minHeight: 50,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  padding: "0 12px",
  color: "#334c32",
  fontSize: 15,
  fontWeight: 800,
};

function localSpaceToggleStyle(active: boolean): CSSProperties {
  return {
    position: "relative",
    width: 48,
    height: 28,
    flex: "0 0 48px",
    padding: 0,
    border: "1px solid #cad8c6",
    borderRadius: 999,
    background: active ? "#56854e" : "#e8eee5",
    cursor: "pointer",
  };
}

function localSpaceToggleThumbStyle(active: boolean): CSSProperties {
  return {
    position: "absolute",
    top: 3,
    left: active ? 23 : 3,
    width: 20,
    height: 20,
    borderRadius: 999,
    background: "#fff",
    boxShadow: "0 1px 4px rgba(31, 46, 30, .25)",
    transition: "left 160ms ease",
  };
}
