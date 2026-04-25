"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { showToast } from "@/components/Toast";
import type { AppProfile, SupabaseUser } from "@/lib/domain-types";
import { formatProfileDateTime, formatStorage, loadUserProfileData, type UserProfileStats } from "@/lib/user-profile-shared";
import {
  buildLocationTextFromFields,
  buildRegionDisplay,
  countryOptions,
  getCountryName,
  getRegionOptions,
  hasPresetRegions,
  parseLegacyLocation,
  type RegionOption,
} from "@/lib/region-shared";

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [profile, setProfile] = useState<AppProfile | null>(null);
  const [stats, setStats] = useState<UserProfileStats | null>(null);
  const [username, setUsername] = useState("");
  const [countryCode, setCountryCode] = useState("");
  const [customCountryName, setCustomCountryName] = useState("");
  const [regionName, setRegionName] = useState("");
  const [cityName, setCityName] = useState("");
  const [initLoading, setInitLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    async function init() {
      setInitLoading(true);
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();

      if (error || !user) {
        router.push("/login");
        return;
      }

      setUser(user);
      const data = await loadUserProfileData(supabase, user.id);
      setProfile(data.profile);
      setStats(data.stats);
      setUsername(String(data.profile?.username || ""));

      const legacy = parseLegacyLocation(data.profile?.location);
      setCountryCode(String(data.profile?.country_code || legacy.countryCode || ""));
      setCustomCountryName(String(data.profile?.country_name || legacy.countryName || ""));
      setRegionName(String(data.profile?.region_name || legacy.regionName || ""));
      setCityName(String(data.profile?.city_name || legacy.cityName || ""));
      setInitLoading(false);
    }

    void init();
  }, [router]);

  const regionOptions = useMemo<RegionOption[]>(() => getRegionOptions(countryCode), [countryCode]);
  const useRegionSelect = hasPresetRegions(countryCode);
  const showCustomCountryInput = countryCode === "OTHER";

  const locationPreview = useMemo(() => {
    return buildRegionDisplay({
      countryCode,
      countryName: customCountryName,
      regionName,
      cityName,
      location: profile?.location,
    });
  }, [countryCode, customCountryName, regionName, cityName, profile]);

  const storageText = useMemo(() => {
    const used = formatStorage(Number(profile?.storage_used || 0));
    const limit = formatStorage(Number(profile?.storage_limit || 0));
    return `${used} / ${limit}`;
  }, [profile]);

  async function refreshStats(targetUserId: string) {
    const data = await loadUserProfileData(supabase, targetUserId);
    setProfile(data.profile);
    setStats(data.stats);
  }

  async function handleSave() {
    if (!user) return;

    const safeUsername = username.trim();
    const safeCountryCode = countryCode || null;
    const safeCountryName = countryCode === "OTHER"
      ? customCountryName.trim()
      : getCountryName(countryCode, customCountryName);
    const safeRegionName = regionName.trim();
    const safeCityName = cityName.trim();

    if (safeUsername.length < 2) {
      setErrorMsg("用户名至少2个字符");
      showToast("用户名至少2个字符");
      return;
    }

    if (countryCode === "OTHER" && !safeCountryName) {
      setErrorMsg("请填写自定义国家 / 地区");
      showToast("请填写自定义国家 / 地区");
      return;
    }

    setSaving(true);
    setErrorMsg("");

    const locationText = buildLocationTextFromFields({
      countryCode,
      countryName: safeCountryName,
      regionName: safeRegionName,
      cityName: safeCityName,
    });

    const { error } = await supabase
      .from("profiles")
      .update({
        username: safeUsername,
        country_code: safeCountryCode,
        country_name: safeCountryName || null,
        region_name: safeRegionName || null,
        city_name: safeCityName || null,
        location: locationText || null,
      })
      .eq("id", user.id);

    setSaving(false);

    if (error) {
      setErrorMsg(error.message || "保存失败");
      showToast("保存失败");
      return;
    }

    showToast("资料已保存");
    void refreshStats(user.id);
  }

  async function handleUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (!file.type.startsWith("image/")) {
      setErrorMsg("请上传图片文件");
      showToast("请上传图片文件");
      return;
    }

    if (file.size > 3 * 1024 * 1024) {
      setErrorMsg("头像请控制在 3MB 以内");
      showToast("头像请控制在 3MB 以内");
      return;
    }

    setUploading(true);
    setErrorMsg("");

    const ext = file.name.split(".").pop() || "jpg";
    const filePath = `${user.id}/${Date.now()}.${ext}`;

    const { error } = await supabase.storage.from("avatars").upload(filePath, file, {
      cacheControl: "3600",
      upsert: true,
    });

    if (error) {
      setUploading(false);
      setErrorMsg("上传失败");
      showToast("头像上传失败");
      return;
    }

    const { data } = supabase.storage.from("avatars").getPublicUrl(filePath);
    const url = data.publicUrl;

    const { error: updateError } = await supabase
      .from("profiles")
      .update({ avatar_url: url })
      .eq("id", user.id);

    setUploading(false);

    if (updateError) {
      setErrorMsg("头像保存失败");
      showToast("头像保存失败");
      return;
    }

    showToast("头像已更新");
    void refreshStats(user.id);
  }

  if (initLoading || !user || !profile || !stats) {
    return <div style={{ padding: 40 }}>加载中...</div>;
  }

  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: "24px 16px 48px" }}>
      <section style={{ background: "#fff", border: "1px solid #e7efe3", borderRadius: 20, padding: 24, boxShadow: "0 12px 28px rgba(32,56,24,0.06)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 13, color: "#6b7b66" }}>我的资料</div>
            <h1 style={{ margin: "6px 0 0", fontSize: 28, color: "#1f2a1f" }}>用户信息页</h1>
            <div style={{ marginTop: 8, color: "#61705c", fontSize: 14 }}>
              管理头像、用户名和所在地区，并从这里进入我的空间、关注、计划、感兴趣和花朵来源。
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <QuickLink href="/archive" label="我的空间" />
            <QuickLink href="/follow" label="我的关注" />
            <QuickLink href="/archive/plans" label="种植计划" />
            <QuickLink href="/archive/interests" label="感兴趣" />
          </div>
        </div>

        {errorMsg ? (
          <div style={{ marginTop: 16, background: "#fff2f0", border: "1px solid #ffd6cf", color: "#c23a2b", padding: "10px 12px", borderRadius: 12, fontSize: 14 }}>
            {errorMsg}
          </div>
        ) : null}

        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 280px) minmax(0, 1fr)", gap: 20, marginTop: 20 }}>
          <section style={panelStyle}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              {profile.avatar_url ? (
                <img src={String(profile.avatar_url)} alt="" style={{ width: 88, height: 88, borderRadius: "50%", objectFit: "cover", border: "1px solid #e4ebe0" }} />
              ) : (
                <div style={{ width: 88, height: 88, borderRadius: "50%", background: "#eef5e9", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 34 }}>🌱</div>
              )}

              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: "#1f2a1f" }}>{profile.username || "未设置用户名"}</div>
                <div style={{ marginTop: 4, fontSize: 14, color: "#6f7b69", wordBreak: "break-all" }}>{user.email}</div>
                <div style={{ marginTop: 8, fontSize: 13, color: "#6f7b69" }}>
                  所在地区：{locationPreview}
                </div>
              </div>
            </div>

            <div style={{ marginTop: 18 }}>
              <label style={fieldLabelStyle}>更换头像</label>
              <input type="file" accept="image/*" onChange={handleUpload} />
              <div style={{ marginTop: 6, fontSize: 12, color: "#7b8676" }}>
                建议上传正方形图片，3MB 以内。{uploading ? "上传中..." : ""}
              </div>
            </div>

            <div style={metaListStyle}>
              <MetaItem label="账号等级" value={`Lv.${Number(profile.level || 1)}`} />
              <MetaItem label="花朵" value={`🌸 ${Number(profile.flower_count || 0)}`} />
              <MetaItem label="存储" value={storageText} />
              <MetaItem label="加入时间" value={formatProfileDateTime(profile.created_at)} />
            </div>
          </section>

          <section style={panelStyle}>
            <div style={sectionTitleStyle}>基础信息</div>
            <div style={formGridStyle}>
              <div>
                <label style={fieldLabelStyle}>用户名</label>
                <input value={username} onChange={(e) => setUsername(e.target.value)} style={inputStyle} placeholder="输入你的用户名" />
              </div>
              <div>
                <label style={fieldLabelStyle}>国家 / 地区</label>
                <select value={countryCode} onChange={(e) => { setCountryCode(e.target.value); setRegionName(""); }} style={inputStyle}>
                  <option value="">请选择</option>
                  {countryOptions.map((item) => (
                    <option key={item.code} value={item.code}>{item.name}</option>
                  ))}
                </select>
              </div>
              {showCustomCountryInput ? (
                <div>
                  <label style={fieldLabelStyle}>自定义国家 / 地区</label>
                  <input value={customCountryName} onChange={(e) => setCustomCountryName(e.target.value)} style={inputStyle} placeholder="例如：巴西" />
                </div>
              ) : null}
              <div>
                <label style={fieldLabelStyle}>省 / 州 / 地域</label>
                {useRegionSelect ? (
                  <select value={regionName} onChange={(e) => setRegionName(e.target.value)} style={inputStyle}>
                    <option value="">请选择</option>
                    {regionOptions.map((item) => (
                      <option key={item.value} value={item.value}>{item.label}</option>
                    ))}
                  </select>
                ) : (
                  <input value={regionName} onChange={(e) => setRegionName(e.target.value)} style={inputStyle} placeholder="例如：浙江 / California" />
                )}
              </div>
              <div>
                <label style={fieldLabelStyle}>城市</label>
                <input value={cityName} onChange={(e) => setCityName(e.target.value)} style={inputStyle} placeholder="例如：宁波 / Tokyo" />
              </div>
            </div>

            <div style={{ marginTop: 10, fontSize: 13, color: "#5e6959" }}>
              显示为：<span style={{ fontWeight: 700, color: "#243123" }}>{locationPreview}</span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12, marginTop: 20 }}>
              <StatCard label="项目" value={String(stats.archiveCount)} hint={`公开 ${stats.publicArchiveCount}`} />
              <StatCard label="关注" value={String(stats.followingCount)} hint="我在关注谁" />
              <StatCard label="粉丝" value={String(stats.followerCount)} hint="谁在关注我" />
              <StatLinkCard href="/profile/flowers" label="花朵来源" value={`🌸 ${Number(profile.flower_count || 0)}`} hint="查看谁给我送花" />
              <StatCard label="计划" value={String(stats.planCount)} hint="待种清单" />
              <StatLinkCard href="/profile/flowers?tab=sent" label="送给谁" value={String(stats.sentFlowerCount || 0)} hint="查看我送出的花" />
              <StatCard label="感兴趣" value={String(stats.interestCount)} hint="想再看看" />
              <StatCard label="最近更新" value={formatProfileDateTime(stats.latestRecordTime)} hint="按公开项目统计" />
            </div>

            <div style={{ marginTop: 20, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button type="button" onClick={handleSave} disabled={saving} style={primaryButtonStyle}>{saving ? "保存中..." : "保存资料"}</button>
              <Link href={`/user/${user.id}/profile`} style={secondaryLinkStyle}>查看公开资料页</Link>
              <Link href="/archive" style={secondaryLinkStyle}>进入我的空间</Link>
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}

function QuickLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} style={{ textDecoration: "none", padding: "10px 14px", borderRadius: 999, border: "1px solid #dce8d8", background: "#f8fbf6", color: "#476b3d", fontSize: 14 }}>
      {label}
    </Link>
  );
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13, color: "#5f6a5b" }}>
      <span>{label}</span>
      <span style={{ color: "#1f2a1f", fontWeight: 600 }}>{value}</span>
    </div>
  );
}

function StatCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div style={{ background: "#f8fbf6", border: "1px solid #e4ece0", borderRadius: 16, padding: 14 }}>
      <div style={{ fontSize: 13, color: "#6d7968" }}>{label}</div>
      <div style={{ marginTop: 6, fontSize: 20, fontWeight: 700, color: "#22301f" }}>{value}</div>
      <div style={{ marginTop: 6, fontSize: 12, color: "#7b8676", lineHeight: 1.5 }}>{hint}</div>
    </div>
  );
}

function StatLinkCard({ href, label, value, hint }: { href: string; label: string; value: string; hint: string }) {
  return (
    <Link href={href} style={{ ...statCardBaseStyle, textDecoration: "none" }}>
      <div style={{ fontSize: 13, color: "#6d7968" }}>{label}</div>
      <div style={{ marginTop: 6, fontSize: 20, fontWeight: 700, color: "#22301f" }}>{value}</div>
      <div style={{ marginTop: 6, fontSize: 12, color: "#7b8676", lineHeight: 1.5 }}>{hint}</div>
    </Link>
  );
}

const panelStyle: CSSProperties = {
  background: "#fff",
  border: "1px solid #e8efe4",
  borderRadius: 18,
  padding: 18,
};

const fieldLabelStyle: CSSProperties = {
  display: "block",
  marginBottom: 8,
  fontSize: 13,
  color: "#5e6959",
  fontWeight: 600,
};

const inputStyle: CSSProperties = {
  width: "100%",
  padding: "11px 12px",
  borderRadius: 12,
  border: "1px solid #d8e3d3",
  fontSize: 14,
  outline: "none",
  boxSizing: "border-box",
};

const formGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 14,
};

const sectionTitleStyle: CSSProperties = {
  fontSize: 18,
  fontWeight: 700,
  color: "#1f2a1f",
  marginBottom: 14,
};

const metaListStyle: CSSProperties = {
  display: "grid",
  gap: 10,
  marginTop: 18,
};

const primaryButtonStyle: CSSProperties = {
  border: "none",
  background: "#4f7b45",
  color: "#fff",
  borderRadius: 12,
  padding: "12px 18px",
  cursor: "pointer",
  fontSize: 14,
  fontWeight: 600,
};

const secondaryLinkStyle: CSSProperties = {
  textDecoration: "none",
  border: "1px solid #d7e2d2",
  background: "#fff",
  color: "#40583a",
  borderRadius: 12,
  padding: "11px 16px",
  fontSize: 14,
  fontWeight: 600,
};

const statCardBaseStyle: CSSProperties = {
  background: "#f8fbf6",
  border: "1px solid #e4ece0",
  borderRadius: 16,
  padding: 14,
  display: "block",
};
