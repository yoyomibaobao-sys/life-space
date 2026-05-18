"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { showToast } from "@/components/Toast";
import type { AppProfile, SupabaseUser } from "@/lib/domain-types";
import { formatProfileDateTime, formatStorage, loadUserProfileData, type UserProfileStats } from "@/lib/user-profile-shared";
import {
  formatMembershipDate,
  getMembershipEndDate,
  getMembershipPlanLabel,
  getMembershipStatusLabel,
  getMembershipSummary,
  normalizeMembershipRpcResult,
  type MyMembership,
} from "@/lib/membership";
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
  const [marketPostCount, setMarketPostCount] = useState(0);
  const [membership, setMembership] = useState<MyMembership | null>(null);
  const [membershipError, setMembershipError] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [username, setUsername] = useState("");
  const [countryCode, setCountryCode] = useState("");
  const [customCountryName, setCustomCountryName] = useState("");
  const [regionName, setRegionName] = useState("");
  const [cityName, setCityName] = useState("");
  const [initLoading, setInitLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [viewportWidth, setViewportWidth] = useState(1200);

  useEffect(() => {
    const updateViewportWidth = () => setViewportWidth(window.innerWidth);
    updateViewportWidth();
    window.addEventListener("resize", updateViewportWidth);
    return () => window.removeEventListener("resize", updateViewportWidth);
  }, []);

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
      const [marketCountResult, membershipResult, adminResult] = await Promise.all([
        supabase
          .from("market_posts")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id),
        supabase.rpc("get_my_membership"),
        supabase.rpc("is_app_admin", { p_user_id: user.id }),
      ]);

      if (marketCountResult.error) {
        console.error("load my market post count error:", marketCountResult.error);
        setMarketPostCount(0);
      } else {
        setMarketPostCount(Number(marketCountResult.count || 0));
      }

      if (membershipResult.error) {
        console.error("load membership error:", membershipResult.error);
        setMembership(null);
        setMembershipError("暂时无法读取试用与额度信息");
      } else {
        setMembership(normalizeMembershipRpcResult(membershipResult.data));
        setMembershipError("");
      }

      if (adminResult.error) {
        console.error("load admin status error:", adminResult.error);
        setIsAdmin(false);
      } else {
        setIsAdmin(Boolean(adminResult.data));
      }

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
    const limit = formatStorage(Number(membership?.storage_limit_bytes || profile?.storage_limit || 0));
    return `${used} / ${limit}`;
  }, [profile, membership]);

  const membershipEndDate = getMembershipEndDate(membership);
  const membershipStatusText = membershipError || getMembershipSummary(membership);
  const marketQuotaText = membership
    ? `${Number(membership.active_market_post_count || 0)} / ${Number(membership.market_post_limit || 0)} 条`
    : "暂无";

  const privateArchiveCount = Math.max(0, Number(stats?.archiveCount || 0) - Number(stats?.publicArchiveCount || 0));
  const planHint = getPlanHint(stats?.planNames || [], Number(stats?.planCount || 0));
  const topGridColumns = viewportWidth < 820 ? "1fr" : "minmax(280px, 0.95fr) minmax(420px, 1.05fr)";
  const formGridColumns = viewportWidth < 560 ? "1fr" : "repeat(2, minmax(0, 1fr))";
  const statsGridColumns = viewportWidth < 640
    ? "1fr"
    : viewportWidth < 900
      ? "repeat(2, minmax(0, 1fr))"
      : "repeat(3, minmax(0, 1fr))";

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


  async function handleExport() {
    if (!user || exporting) return;

    setExporting(true);
    setErrorMsg("");

    try {
      const {
        data: { session },
        error,
      } = await supabase.auth.getSession();

      if (error || !session?.access_token) {
        setErrorMsg("请先重新登录后再导出");
        showToast("请先重新登录后再导出");
        router.push("/login");
        return;
      }

      const response = await fetch("/api/export/my-records", {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (!response.ok) {
        const text = await response.text();
        const message = text || "导出失败，请稍后再试";
        setErrorMsg(message);
        showToast(message);
        return;
      }

      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition") || "";
      const fileNameMatch = disposition.match(/filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i);
      const fileName = fileNameMatch?.[1]
        ? decodeURIComponent(fileNameMatch[1])
        : fileNameMatch?.[2] || `有时耕作-我的记录-${new Date().toISOString().slice(0, 10)}.zip`;

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      showToast("导出完成，文件已交给浏览器下载；请查看浏览器下载栏或“下载”文件夹。");
    } catch {
      setErrorMsg("导出失败，请稍后再试");
      showToast("导出失败，请稍后再试");
    } finally {
      setExporting(false);
    }
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
    <main style={{ maxWidth: 1040, margin: "0 auto", padding: "16px 14px 32px" }}>
      <section style={{ background: "#fff", border: "1px solid #e7efe3", borderRadius: 18, padding: 18, boxShadow: "0 10px 24px rgba(32,56,24,0.05)" }}>
        <div>
          <div style={{ fontSize: 13, color: "#6b7b66" }}>我的资料</div>
          <h1 style={{ margin: "4px 0 0", fontSize: 24, color: "#1f2a1f" }}>用户信息页</h1>
        </div>

        {errorMsg ? (
          <div style={{ marginTop: 16, background: "#fff2f0", border: "1px solid #ffd6cf", color: "#c23a2b", padding: "10px 12px", borderRadius: 12, fontSize: 14 }}>
            {errorMsg}
          </div>
        ) : null}

        <div style={{ display: "grid", gridTemplateColumns: topGridColumns, gap: 14, marginTop: 14, alignItems: "start" }}>
          <section style={panelStyle}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {profile.avatar_url ? (
                <img src={String(profile.avatar_url)} alt="" style={{ width: 72, height: 72, borderRadius: "50%", objectFit: "cover", border: "1px solid #e4ebe0" }} />
              ) : (
                <div style={{ width: 72, height: 72, borderRadius: "50%", background: "#eef5e9", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28 }}>🌱</div>
              )}

              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 19, fontWeight: 700, color: "#1f2a1f" }}>{profile.username || "未设置用户名"}</div>
                <div style={{ marginTop: 3, fontSize: 13, color: "#6f7b69", wordBreak: "break-all" }}>{user.email}</div>
                <div style={{ marginTop: 5, fontSize: 13, color: "#6f7b69" }}>
                  所在地区：{locationPreview}
                </div>
              </div>
            </div>

            <div style={{ marginTop: 12 }}>
              <label style={fieldLabelStyle}>更换头像</label>
              <input type="file" accept="image/*" onChange={handleUpload} />
              <div style={{ marginTop: 4, fontSize: 12, color: "#7b8676" }}>
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
            <div style={{ ...formGridStyle, gridTemplateColumns: formGridColumns }}>
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

            <div style={{ marginTop: 8, fontSize: 13, color: "#5e6959" }}>
              显示为：<span style={{ fontWeight: 700, color: "#243123" }}>{locationPreview}</span>
            </div>

            <div style={{ marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" onClick={handleSave} disabled={saving} style={primaryButtonStyle}>{saving ? "保存中..." : "保存资料"}</button>
              <Link href={`/user/${user.id}/profile`} style={secondaryLinkStyle}>查看公开资料页</Link>
              <Link href="/archive" style={secondaryLinkStyle}>进入我的空间</Link>
              <Link href="/membership" style={secondaryLinkStyle}>会员与续费</Link>
              {isAdmin ? (
                <Link href="/admin/memberships" style={adminLinkStyle}>会员管理</Link>
              ) : null}
            </div>
          </section>
        </div>

        <section style={membershipSectionStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 13, color: "#6b7b66" }}>我的会员</div>
              <h2 style={{ margin: "4px 0 0", fontSize: 20, color: "#1f2a1f" }}>当前会员与额度</h2>
              <p style={{ margin: "8px 0 0", color: "#6f7b69", fontSize: 13, lineHeight: 1.6 }}>
                {membershipStatusText}
              </p>
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={handleExport}
                disabled={exporting}
                style={{
                  ...secondaryLinkStyle,
                  cursor: exporting ? "not-allowed" : "pointer",
                  opacity: exporting ? 0.65 : 1,
                }}
              >
                {exporting ? "正在打包记录和图片..." : "导出我的记录"}
              </button>
              <Link href="/membership" style={secondaryLinkStyle}>
                查看会员与续费
              </Link>
            </div>
            {exporting ? (
              <p style={{ margin: "8px 0 0", color: "#7b8676", fontSize: 13, lineHeight: 1.5 }}>
                正在打包你的记录和图片，图片较多时可能需要 1～3 分钟，请不要关闭页面。导出完成后，文件会保存到浏览器默认下载位置；如果浏览器设置了下载前询问，会弹出保存位置选择。
              </p>
            ) : null}
          </div>

          <div style={{ ...statsGridStyle, gridTemplateColumns: statsGridColumns, marginTop: 14 }}>
            <InfoCard
              label="当前方案"
              value={membership ? getMembershipPlanLabel(membership.plan) : "暂无"}
              hint={membership ? getMembershipStatusLabel(membership.status) : "试用记录生成后显示"}
            />
            <InfoCard
              label="有效期至"
              value={formatMembershipDate(membershipEndDate)}
              hint={membership?.can_create_content === false ? "已限制新增，仍可查看和导出" : "到期前可继续新增记录"}
            />
            <InfoCard
              label="云端容量"
              value={storageText}
              hint="容量主要用于照片与媒体文件"
            />
            <InfoCard
              label="集市发布"
              value={marketQuotaText}
              hint={membership?.can_create_market_post === false ? "当前不可继续发布" : "同时在线发布数量"}
            />
          </div>
        </section>

        <section style={statsSectionStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 13, color: "#6b7b66" }}>我的空间</div>
              <h2 style={{ margin: "4px 0 0", fontSize: 20, color: "#1f2a1f" }}>空间、关注与互动</h2>
            </div>
          </div>

          <div style={{ ...statsGridStyle, gridTemplateColumns: statsGridColumns }}>
              <StatLinkCard
                href="/archive"
                label="我的项目"
                value={String(stats.archiveCount)}
                hint={`公开 ${stats.publicArchiveCount} · 私密 ${privateArchiveCount}`}
              />
              <StatLinkCard
  href="/profile/recent"
  label="最近浏览"
  value="进入"
  hint="最近看过的项目"
/>
              <StatLinkCard
  href="/follow?tab=projects"
  label="我关注的项目"
  value={String(stats.projectFollowCount)}
  hint="我关注的项目"
/>
              <StatLinkCard
                href="/follow?tab=users"
                label="我关注的用户"
                value={String(stats.followingCount)}
                hint="我在关注谁"
              />
              <StatLinkCard
  href="/profile/followers"
  label="粉丝"
  value={String(stats.followerCount)}
  hint="谁在关注我"
/>
              <StatLinkCard
                href="/profile/flowers"
                label="花朵来源"
                value={String(stats.receivedFlowerCount)}
                hint="查看谁给我送花"
              />
              <StatLinkCard
                href="/profile/flowers?tab=sent"
                label="花朵送给谁"
                value={String(stats.sentFlowerCount || 0)}
                hint="查看我送出的花"
              />

  <StatLinkCard
  href="/notifications"
  label="通知"
  value="进入"
  hint="关注、送花和互动提醒"
/>
                    </div>
        </section>

        <section style={plantInfoSectionStyle}>
          <div style={plantInfoHeaderStyle}>
            <div>
              <div style={{ fontSize: 13, color: "#6b7b66" }}>植物资料</div>
              <h2 style={plantInfoTitleStyle}>我的植物计划与收藏</h2>
              <p style={plantInfoDescStyle}>
                管理还没有正式建档的种植准备和感兴趣植物。开始记录后，可以再转入项目档案。
              </p>
            </div>
          </div>

          <div style={plantInfoGridStyle}>
            <Link href="/archive/plans" style={plantInfoCardStyle}>
              <div style={plantInfoCardLabelStyle}>种植计划</div>
              <div style={plantInfoCardValueStyle}>{stats.planCount}</div>
              <div style={plantInfoCardHintStyle}>{planHint}</div>
            </Link>

            <Link href="/archive/interests" style={plantInfoCardStyle}>
              <div style={plantInfoCardLabelStyle}>植物收藏</div>
              <div style={plantInfoCardValueStyle}>{stats.interestCount}</div>
              <div style={plantInfoCardHintStyle}>{getInterestHint(Number(stats.interestCount || 0))}</div>
            </Link>
          </div>
        </section>

        <section style={marketInfoSectionStyle}>
          <div style={marketInfoHeaderStyle}>
            <div>
              <div style={{ fontSize: 13, color: "#6b7b66" }}>集市信息</div>
              <h2 style={marketInfoTitleStyle}>我的集市</h2>
              <p style={marketInfoDescStyle}>
                管理你的交换、赠送、转让和求购信息。
              </p>
            </div>
          </div>

          <div style={marketInfoGridStyle}>
            <Link href="/market/mine" style={marketInfoCardStyle}>
              <div style={marketInfoCardLabelStyle}>我的集市发布</div>
              <div style={marketInfoCardValueStyle}>{marketPostCount}</div>
              <div style={marketInfoCardHintStyle}>
                查看和管理我发布的集市信息
              </div>
            </Link>

            <Link href="/market/new" style={marketInfoCardStyle}>
              <div style={marketInfoCardLabelStyle}>发布新信息</div>
              <div style={marketInfoCardValueStyle}>＋</div>
              <div style={marketInfoCardHintStyle}>
                发布交换、赠送、转让或求购
              </div>
            </Link>
          </div>
        </section>
      </section>
    </main>
  );
}

function getPlanHint(planNames: string[], planCount: number) {
  if (!planCount) return "还没有种植计划";
  if (!planNames.length) return "查看我的种植计划";
  const suffix = planCount > planNames.length ? "等" : "";
  return `${planNames.join("、")}${suffix}`;
}

function getInterestHint(interestCount: number) {
  if (!interestCount) return "还没有植物收藏";
  return "查看我感兴趣的植物";
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13, color: "#5f6a5b" }}>
      <span>{label}</span>
      <span style={{ color: "#1f2a1f", fontWeight: 600 }}>{value}</span>
    </div>
  );
}

function StatLinkCard({ href, label, value, hint }: { href: string; label: string; value: string; hint: string }) {
  return (
    <Link href={href} style={{ ...statCardBaseStyle, textDecoration: "none" }}>
      <div style={{ fontSize: 14, color: "#6d7968" }}>{label}</div>
      <div style={{ marginTop: 6, fontSize: 24, fontWeight: 700, color: "#22301f" }}>{value}</div>
      <div style={{ marginTop: 6, fontSize: 13, color: "#7b8676", lineHeight: 1.35 }}>{hint}</div>
    </Link>
  );
}

function InfoCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div style={statCardBaseStyle}>
      <div style={{ fontSize: 14, color: "#6d7968" }}>{label}</div>
      <div style={{ marginTop: 6, fontSize: 22, fontWeight: 700, color: "#22301f" }}>{value}</div>
      <div style={{ marginTop: 6, fontSize: 13, color: "#7b8676", lineHeight: 1.35 }}>{hint}</div>
    </div>
  );
}

function StatActionCard({
  label,
  value,
  hint,
  onClick,
}: {
  label: string;
  value: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} style={statActionCardStyle}>
      <div style={{ fontSize: 14, color: "#6d7968" }}>{label}</div>
      <div style={{ marginTop: 6, fontSize: 24, fontWeight: 700, color: "#22301f" }}>{value}</div>
      <div style={{ marginTop: 6, fontSize: 13, color: "#7b8676", lineHeight: 1.35 }}>{hint}</div>
    </button>
  );
}

const panelStyle: CSSProperties = {
  background: "#fff",
  border: "1px solid #e8efe4",
  borderRadius: 16,
  padding: 14,
};

const membershipSectionStyle: CSSProperties = {
  marginTop: 14,
  background: "#f8fbf3",
  border: "1px solid #e1ecd9",
  borderRadius: 18,
  padding: 14,
};

const statsSectionStyle: CSSProperties = {
  marginTop: 14,
  background: "#fbfdf9",
  border: "1px solid #e6eee2",
  borderRadius: 18,
  padding: 14,
};
const plantInfoSectionStyle: CSSProperties = {
  marginTop: 14,
  background: "#f8fff8",
  border: "1px solid #dcebd6",
  borderRadius: 18,
  padding: 14,
};

const plantInfoHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "flex-start",
  marginBottom: 14,
};

const plantInfoTitleStyle: CSSProperties = {
  margin: "4px 0 0",
  color: "#1f2a1f",
  fontSize: 20,
};

const plantInfoDescStyle: CSSProperties = {
  margin: "5px 0 0",
  color: "#6f7b69",
  fontSize: 13,
  lineHeight: 1.6,
};

const plantInfoGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

const plantInfoCardStyle: CSSProperties = {
  display: "block",
  textDecoration: "none",
  background: "#fff",
  border: "1px solid #e2ecdc",
  borderRadius: 16,
  padding: 14,
  color: "#1f2a1f",
};

const plantInfoCardLabelStyle: CSSProperties = {
  fontSize: 14,
  color: "#6d7968",
};

const plantInfoCardValueStyle: CSSProperties = {
  marginTop: 6,
  fontSize: 24,
  fontWeight: 700,
  color: "#22301f",
};

const plantInfoCardHintStyle: CSSProperties = {
  marginTop: 6,
  fontSize: 13,
  color: "#7b8676",
  lineHeight: 1.35,
};

const marketInfoSectionStyle: CSSProperties = {
  marginTop: 14,
  background: "#fffaf3",
  border: "1px solid #efe1c9",
  borderRadius: 18,
  padding: 14,
};

const marketInfoHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "flex-start",
  marginBottom: 14,
};

const marketInfoTitleStyle: CSSProperties = {
  margin: "4px 0 0",
  color: "#1f2a1f",
  fontSize: 20,
};

const marketInfoDescStyle: CSSProperties = {
  margin: "5px 0 0",
  color: "#6f7b69",
  fontSize: 13,
  lineHeight: 1.6,
};

const marketInfoGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 10,
};

const marketInfoCardStyle: CSSProperties = {
  textDecoration: "none",
  color: "inherit",
  background: "#fff",
  border: "1px solid #eadfcf",
  borderRadius: 16,
  padding: 14,
  display: "block",
  minHeight: 104,
  boxSizing: "border-box",
};

const marketInfoCardLabelStyle: CSSProperties = {
  color: "#6d5f45",
  fontSize: 14,
};

const marketInfoCardValueStyle: CSSProperties = {
  marginTop: 6,
  color: "#22301f",
  fontSize: 24,
  fontWeight: 700,
};

const marketInfoCardHintStyle: CSSProperties = {
  marginTop: 6,
  color: "#7b8676",
  fontSize: 13,
  lineHeight: 1.35,
};
const fieldLabelStyle: CSSProperties = {
  display: "block",
  marginBottom: 5,
  fontSize: 13,
  color: "#5e6959",
  fontWeight: 600,
};

const inputStyle: CSSProperties = {
  width: "100%",
  padding: "9px 11px",
  borderRadius: 10,
  border: "1px solid #d8e3d3",
  fontSize: 14,
  outline: "none",
  boxSizing: "border-box",
};

const formGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 10,
};

const sectionTitleStyle: CSSProperties = {
  fontSize: 17,
  fontWeight: 700,
  color: "#1f2a1f",
  marginBottom: 10,
};

const metaListStyle: CSSProperties = {
  display: "grid",
  gap: 7,
  marginTop: 12,
};

const primaryButtonStyle: CSSProperties = {
  border: "none",
  background: "#4f7b45",
  color: "#fff",
  borderRadius: 12,
  padding: "10px 14px",
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
  padding: "9px 13px",
  fontSize: 14,
  fontWeight: 600,
};

const adminLinkStyle: CSSProperties = {
  ...secondaryLinkStyle,
  border: "1px solid #c9d8be",
  background: "#edf6e8",
  color: "#2f5a27",
};

const statsGridStyle: CSSProperties = {
  display: "grid",
  gap: 10,
  marginTop: 14,
};

const statCardBaseStyle: CSSProperties = {
  background: "#fff",
  border: "1px solid #e4ece0",
  borderRadius: 16,
  padding: 14,
  display: "block",
  color: "inherit",
  minHeight: 104,
  boxSizing: "border-box",
};

const statActionCardStyle: CSSProperties = {
  ...statCardBaseStyle,
  width: "100%",
  textAlign: "left",
  cursor: "pointer",
  font: "inherit",
};
