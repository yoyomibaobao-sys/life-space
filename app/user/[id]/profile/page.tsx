"use client";

import Link from "next/link";
import { useEffect, useState, type CSSProperties } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { showToast } from "@/components/Toast";
import ConfirmDialog from "@/components/ConfirmDialog";
import {
  formatProfileDateTime,
  loadUserProfileData,
  type PublicUserProfileData,
} from "@/lib/user-profile-shared";
import { formatRegionDisplayFromProfile } from "@/lib/region-shared";
import {
  formatMarketTime,
  getMarketItemCategoryLabel,
  getMarketPostTypeLabel,
  type MarketPostRow,
} from "@/lib/market-types";

export default function PublicUserProfilePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const userId = params.id;

  const [viewerId, setViewerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [showUnfollowConfirm, setShowUnfollowConfirm] = useState(false);
  const [data, setData] = useState<PublicUserProfileData | null>(null);
  const [marketPosts, setMarketPosts] = useState<MarketPostRow[]>([]);

  useEffect(() => {
    async function load() {
      if (!userId) return;

      setLoading(true);

      try {
        const [{ data: authData }, profileData, marketResult] =
          await Promise.all([
            supabase.auth.getUser(),
            loadUserProfileData(supabase, userId),
            supabase
              .from("market_posts")
              .select("*")
              .eq("user_id", userId)
              .eq("status", "active")
              .order("created_at", { ascending: false })
              .limit(6),
          ]);

        const viewer = authData?.user || null;
        const realViewerId = viewer?.id || null;

        setViewerId(realViewerId);
        setData(profileData);

        if (marketResult.error) {
          console.error("load public user market posts error:", marketResult.error);
          setMarketPosts([]);
        } else {
          setMarketPosts((marketResult.data || []) as MarketPostRow[]);
        }

        if (realViewerId && realViewerId !== userId) {
          const { data: follow } = await supabase
            .from("follows")
            .select("following_id")
            .eq("follower_id", realViewerId)
            .eq("following_id", userId)
            .maybeSingle();

          setIsFollowing(!!follow);
        } else {
          setIsFollowing(false);
        }
      } catch (error) {
        console.error("load public user profile error:", error);
        setData(null);
        setMarketPosts([]);
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [userId]);

  if (loading || !data) {
    return <div style={{ padding: 40 }}>加载中...</div>;
  }

  const profile = data.profile;
  const stats = data.stats;
  const isSelf = viewerId === userId;

  if (!profile) {
    return (
      <main style={{ maxWidth: 860, margin: "0 auto", padding: "28px 16px 48px" }}>
        <section style={panelStyle}>
          <h1 style={{ marginTop: 0 }}>找不到这个用户资料页</h1>
          <div style={{ color: "#66725f", lineHeight: 1.8 }}>
            这个资料页可能还未建立，或该用户不存在。
          </div>
          <div style={{ marginTop: 16 }}>
            <Link href="/discover" style={secondaryLinkStyle}>
              返回发现页
            </Link>
          </div>
        </section>
      </main>
    );
  }

  async function handleFollowToggle() {
    const { data: auth } = await supabase.auth.getUser();
    const currentUser = auth.user;

    if (!currentUser) {
      router.push("/login");
      return;
    }

    if (currentUser.id === userId) {
      router.push("/profile");
      return;
    }

    if (isFollowing) {
      setShowUnfollowConfirm(true);
      return;
    }

    setSubmitting(true);

    const { error } = await supabase.from("follows").insert([
      {
        follower_id: currentUser.id,
        following_id: userId,
      },
    ]);

    setSubmitting(false);

    if (error) {
      showToast("关注失败");
      return;
    }

    setIsFollowing(true);
    setData((current) =>
      current
        ? {
            ...current,
            stats: {
              ...current.stats,
              followerCount: current.stats.followerCount + 1,
            },
          }
        : current
    );
    showToast("已关注该用户");
  }

  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: "24px 16px 48px" }}>
      <section style={{ ...panelStyle, padding: 24 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <div>
            <div style={{ fontSize: 13, color: "#6d7968" }}>用户信息页</div>
            <h1 style={{ margin: "6px 0 0", fontSize: 28, color: "#1f2a1f" }}>
              {profile.username || "未设置用户名"}
            </h1>
            <div style={{ marginTop: 8, fontSize: 14, color: "#63705d" }}>
              所在地区：{formatRegionDisplayFromProfile(profile)}
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Link href={`/user/${userId}`} style={secondaryLinkStyle}>
              进入空间
            </Link>

            {isSelf ? (
              <Link href="/profile" style={secondaryLinkStyle}>
                编辑我的资料
              </Link>
            ) : (
              <button
                type="button"
                onClick={handleFollowToggle}
                style={primaryButtonStyle}
              >
                {submitting ? "处理中..." : isFollowing ? "已关注" : "关注用户"}
              </button>
            )}
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 220px) minmax(0, 1fr)",
            gap: 20,
            marginTop: 20,
          }}
        >
          <section style={panelInnerStyle}>
            {profile.avatar_url ? (
              <img
                src={String(profile.avatar_url)}
                alt=""
                style={{
                  width: 92,
                  height: 92,
                  borderRadius: "50%",
                  objectFit: "cover",
                  border: "1px solid #e4ebe0",
                }}
              />
            ) : (
              <div
                style={{
                  width: 92,
                  height: 92,
                  borderRadius: "50%",
                  background: "#eef5e9",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 34,
                }}
              >
                🌱
              </div>
            )}

            <div style={{ marginTop: 14, fontSize: 13, color: "#6f7b69" }}>
              Lv.{Number(profile.level || 1)} · 🌸{" "}
              {Number(profile.flower_count || 0)}
            </div>

            <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
              <MetaItem label="关注" value={String(stats.followingCount)} />
              <MetaItem label="粉丝" value={String(stats.followerCount)} />
              <MetaItem label="公开项目" value={String(stats.publicArchiveCount)} />
              <MetaItem
                label="最近活跃"
                value={formatProfileDateTime(stats.latestRecordTime)}
              />
            </div>
          </section>

          <section style={panelInnerStyle}>
            <div style={sectionTitleStyle}>最近公开项目</div>

            {data.recentArchives.length ? (
              <div style={{ display: "grid", gap: 12 }}>
                {data.recentArchives.map((item) => (
                  <Link
                    key={item.id}
                    href={`/archive/${item.id}`}
                    style={{
                      textDecoration: "none",
                      border: "1px solid #e5ece1",
                      borderRadius: 16,
                      padding: 14,
                      color: "#22301f",
                      background: "#fff",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 12,
                        alignItems: "center",
                      }}
                    >
                      <div style={{ fontWeight: 650 }}>
                        {item.title || "未命名项目"}
                      </div>
                      <div style={{ fontSize: 12, color: "#75806f" }}>
                        {formatProfileDateTime(item.last_record_time)}
                      </div>
                    </div>

                    <div style={{ marginTop: 6, fontSize: 13, color: "#63705d" }}>
                      系统名：{item.system_name || "未填写"} · 分类：
                      {item.category || "未分类"}
                    </div>

                    <div style={{ marginTop: 6, fontSize: 12, color: "#7a8575" }}>
                      记录 {Number(item.record_count || 0)} 条 · 浏览{" "}
                      {Number(item.view_count || 0)}
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div style={{ color: "#6d7968", lineHeight: 1.8 }}>
                这个用户暂时还没有公开项目。
              </div>
            )}
          </section>
        </div>

        <section style={marketInfoSectionStyle}>
          <div style={marketInfoHeaderStyle}>
            <div>
              <div style={{ fontSize: 13, color: "#6b7b66" }}>集市信息</div>
              <h2 style={marketInfoTitleStyle}>TA 发布的集市信息</h2>
              <p style={marketInfoDescStyle}>
                当前正在进行的交换、赠送、转让或求购信息。
              </p>
            </div>

            <Link href="/market" style={smallMarketLinkStyle}>
              去集市看看
            </Link>
          </div>

          {marketPosts.length > 0 ? (
            <div style={marketListStyle}>
              {marketPosts.map((item) => (
                <Link key={item.id} href={`/market/${item.id}`} style={marketCardStyle}>
                  {item.cover_image_url ? (
                    <img src={item.cover_image_url} alt="" style={marketImageStyle} />
                  ) : (
                    <div style={marketImageFallbackStyle}>集市</div>
                  )}

                  <div style={marketContentStyle}>
                    <div style={marketTopRowStyle}>
                      <div style={marketBadgeRowStyle}>
                        <span style={marketTypeBadgeStyle}>
                          {getMarketPostTypeLabel(item.post_type)}
                        </span>
                        <span style={marketCategoryBadgeStyle}>
                          {getMarketItemCategoryLabel(item.item_category)}
                        </span>
                      </div>

                      <span style={marketTimeStyle}>
                        {formatMarketTime(item.created_at)}
                      </span>
                    </div>

                    <div style={marketTitleStyle}>{item.title}</div>

                    {item.description ? (
                      <div style={marketDescriptionStyle}>{item.description}</div>
                    ) : null}

                    <div style={marketMetaStyle}>
                      {item.location_text ? item.location_text : "未填写地区"}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div style={emptyMarketStyle}>
              TA 还没有正在进行的集市信息。
            </div>
          )}
        </section>
      </section>

      <ConfirmDialog
        open={showUnfollowConfirm}
        title="取消关注用户"
        message={`确定不再关注“${profile.username || "这个用户"}”吗？`}
        confirmText={submitting ? "处理中..." : "取消关注"}
        cancelText="保留关注"
        danger
        onClose={() => {
          if (!submitting) setShowUnfollowConfirm(false);
        }}
        onConfirm={async () => {
          if (submitting || !viewerId) return;

          setSubmitting(true);

          const { error } = await supabase
            .from("follows")
            .delete()
            .eq("follower_id", viewerId)
            .eq("following_id", userId);

          setSubmitting(false);

          if (error) {
            showToast("取消关注失败");
            return;
          }

          setShowUnfollowConfirm(false);
          setIsFollowing(false);
          setData((current) =>
            current
              ? {
                  ...current,
                  stats: {
                    ...current.stats,
                    followerCount: Math.max(0, current.stats.followerCount - 1),
                  },
                }
              : current
          );
          showToast("已取消关注该用户");
        }}
      />
    </main>
  );
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 12,
        fontSize: 13,
        color: "#5f6a5b",
      }}
    >
      <span>{label}</span>
      <span style={{ color: "#1f2a1f", fontWeight: 600 }}>{value}</span>
    </div>
  );
}

const panelStyle: CSSProperties = {
  background: "#fff",
  border: "1px solid #e7efe3",
  borderRadius: 20,
  boxShadow: "0 12px 28px rgba(32,56,24,0.06)",
};

const panelInnerStyle: CSSProperties = {
  background: "#f9fcf7",
  border: "1px solid #e5ece1",
  borderRadius: 18,
  padding: 18,
};

const sectionTitleStyle: CSSProperties = {
  fontSize: 18,
  fontWeight: 700,
  color: "#1f2a1f",
  marginBottom: 14,
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

const marketInfoSectionStyle: CSSProperties = {
  marginTop: 20,
  background: "#fffaf3",
  border: "1px solid #efe1c9",
  borderRadius: 18,
  padding: 16,
};

const marketInfoHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "flex-start",
  marginBottom: 12,
  flexWrap: "wrap",
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

const smallMarketLinkStyle: CSSProperties = {
  color: "#4f7b45",
  textDecoration: "none",
  fontSize: 13,
  fontWeight: 700,
  whiteSpace: "nowrap",
};

const marketListStyle: CSSProperties = {
  display: "grid",
  gap: 10,
};

const marketCardStyle: CSSProperties = {
  display: "flex",
  gap: 12,
  textDecoration: "none",
  color: "inherit",
  background: "#fff",
  border: "1px solid #eadfcf",
  borderRadius: 16,
  padding: 12,
};

const marketImageStyle: CSSProperties = {
  width: 78,
  height: 78,
  objectFit: "cover",
  borderRadius: 12,
  border: "1px solid #e4ece0",
  background: "#f0f4ed",
  flexShrink: 0,
};

const marketImageFallbackStyle: CSSProperties = {
  width: 78,
  height: 78,
  borderRadius: 12,
  border: "1px solid #e4ece0",
  background: "#edf4e8",
  color: "#6f7b69",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 13,
  fontWeight: 700,
  flexShrink: 0,
};

const marketContentStyle: CSSProperties = {
  minWidth: 0,
  flex: 1,
};

const marketTopRowStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  alignItems: "center",
  marginBottom: 6,
};

const marketBadgeRowStyle: CSSProperties = {
  display: "flex",
  gap: 6,
  flexWrap: "wrap",
};

const marketTypeBadgeStyle: CSSProperties = {
  borderRadius: 999,
  background: "#edf4e8",
  color: "#4f7b45",
  padding: "3px 8px",
  fontSize: 12,
  fontWeight: 700,
};

const marketCategoryBadgeStyle: CSSProperties = {
  borderRadius: 999,
  background: "#f5f3e8",
  color: "#7a6b35",
  padding: "3px 8px",
  fontSize: 12,
  fontWeight: 700,
};

const marketTimeStyle: CSSProperties = {
  color: "#8a9585",
  fontSize: 12,
  whiteSpace: "nowrap",
};

const marketTitleStyle: CSSProperties = {
  color: "#1f2a1f",
  fontSize: 15,
  fontWeight: 700,
  lineHeight: 1.5,
};

const marketDescriptionStyle: CSSProperties = {
  marginTop: 5,
  color: "#5f6a5b",
  fontSize: 13,
  lineHeight: 1.5,
  display: "-webkit-box",
  WebkitLineClamp: 2,
  WebkitBoxOrient: "vertical",
  overflow: "hidden",
};

const marketMetaStyle: CSSProperties = {
  marginTop: 6,
  color: "#7b8676",
  fontSize: 12,
};

const emptyMarketStyle: CSSProperties = {
  color: "#7b8676",
  fontSize: 13,
  background: "#fff",
  border: "1px solid #eadfcf",
  borderRadius: 12,
  padding: 12,
};