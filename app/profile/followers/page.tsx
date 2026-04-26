"use client";

import Link from "next/link";
import { useEffect, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  buttonRowStyle,
  cardBodyStyle,
  cardTopRowStyle,
  ghostButtonStyle,
  listStyle,
  noteLineStyle,
  primaryButtonStyle,
  projectTitleStyle,
  statsLineStyle,
  userAvatarFallbackStyle,
  userAvatarStyle,
  userAvatarWrapStyle,
  userCardStyle,
} from "@/components/follow/FollowShared";
import { formatDateTime, getTimeValue } from "@/lib/follow-utils";

type FollowRow = {
  follower_id: string;
  created_at: string | null;
};

type FollowerProfile = {
  id: string;
  username: string | null;
  avatar_url: string | null;
};

type PublicArchiveRow = {
  id: string;
  user_id: string;
  title: string | null;
  last_record_time: string | null;
};

type FollowerItem = {
  id: string;
  username: string;
  avatarUrl: string | null;
  latestRecordTime: string | null;
  publicArchiveCount: number;
  recentArchiveTitles: string[];
};

export default function FollowersPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [followers, setFollowers] = useState<FollowerItem[]>([]);

  useEffect(() => {
    async function init() {
      setLoading(true);

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        router.push("/login");
        return;
      }

      const { data: followData, error: followError } = await supabase
        .from("follows")
        .select("follower_id, created_at")
        .eq("following_id", user.id)
        .order("created_at", { ascending: false });

      if (followError) {
        console.error("load followers follow rows error:", followError);
        setFollowers([]);
        setLoading(false);
        return;
      }

      const followRows = ((followData || []) as FollowRow[]).filter(
        (row) => row.follower_id
      );

      if (followRows.length === 0) {
        setFollowers([]);
        setLoading(false);
        return;
      }

      const followerIds = Array.from(
        new Set(followRows.map((row) => row.follower_id))
      );

      const [profilesResult, archivesResult] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, username, avatar_url")
          .in("id", followerIds),

        supabase
          .from("archives")
          .select("id, user_id, title, last_record_time, is_public")
          .in("user_id", followerIds)
          .eq("is_public", true),
      ]);

      if (profilesResult.error) {
        console.error("load follower profiles error:", profilesResult.error);
      }

      if (archivesResult.error) {
        console.error("load follower archives error:", archivesResult.error);
      }

      const profiles = ((profilesResult.data || []) as FollowerProfile[]).filter(
        (profile) => profile.id
      );

      const publicArchives = ((archivesResult.data || []) as PublicArchiveRow[])
        .filter((archive) => archive.user_id)
        .sort(
          (a, b) =>
            getTimeValue(b.last_record_time) - getTimeValue(a.last_record_time)
        );

      const profileMap = new Map(
        profiles.map((profile) => [profile.id, profile])
      );

      const archiveMap = new Map<string, PublicArchiveRow[]>();

      publicArchives.forEach((archive) => {
        if (!archiveMap.has(archive.user_id)) {
          archiveMap.set(archive.user_id, []);
        }

        archiveMap.get(archive.user_id)?.push(archive);
      });

      const items: FollowerItem[] = followerIds
        .map((followerId) => {
          const profile = profileMap.get(followerId);
          const archivesOfUser = archiveMap.get(followerId) || [];

          return {
            id: followerId,
            username: profile?.username || "未设置用户名",
            avatarUrl: profile?.avatar_url || null,
            latestRecordTime: archivesOfUser[0]?.last_record_time || null,
            publicArchiveCount: archivesOfUser.length,
            recentArchiveTitles: archivesOfUser
              .slice(0, 5)
              .map((archive) => archive.title || "未命名项目"),
          };
        })
        .sort(
          (a, b) =>
            getTimeValue(b.latestRecordTime) - getTimeValue(a.latestRecordTime)
        );

      setFollowers(items);
      setLoading(false);
    }

    void init();
  }, [router]);

  return (
    <main style={pageStyle}>
      <div style={shellStyle}>
        <Link href="/profile" style={backLinkStyle}>
          ← 返回个人资料
        </Link>

        <h1 style={titleStyle}>粉丝</h1>
        <div style={subtitleStyle}>正在关注你的用户</div>

        {loading ? (
          <section style={emptyStyle}>加载中...</section>
        ) : followers.length === 0 ? (
          <section style={emptyStyle}>还没有用户关注你</section>
        ) : (
          <section style={listStyle}>
            {followers.map((item) => (
              <article key={item.id} style={userCardStyle}>
                <div style={userAvatarWrapStyle}>
                  {item.avatarUrl ? (
                    <img src={item.avatarUrl} alt="" style={userAvatarStyle} />
                  ) : (
                    <div style={userAvatarFallbackStyle}>🌱</div>
                  )}
                </div>

                <div style={cardBodyStyle}>
                  <div style={cardTopRowStyle}>
                    <div style={projectTitleStyle}>{item.username}</div>
                  </div>

                  <div
                    style={{
                      ...noteLineStyle,
                      whiteSpace: "normal",
                      overflow: "visible",
                      textOverflow: "clip",
                      lineHeight: 1.6,
                    }}
                  >
                    最近更新：
                    {item.recentArchiveTitles.length
                      ? item.recentArchiveTitles.join("、")
                      : "最近还没有公开项目更新"}
                  </div>

                  <div style={statsLineStyle}>
                    {formatDateTime(item.latestRecordTime)}更新 · 共
                    {item.publicArchiveCount}个公开项目
                  </div>

                  <div style={buttonRowStyle}>
                    <button
                      type="button"
                      onClick={() => router.push(`/user/${item.id}`)}
                      style={primaryButtonStyle}
                    >
                      进入空间
                    </button>

                    <button
                      type="button"
                      onClick={() => router.push(`/user/${item.id}/profile`)}
                      style={ghostButtonStyle}
                    >
                      查看资料
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </section>
        )}
      </div>
    </main>
  );
}

const pageStyle: CSSProperties = {
  minHeight: "100vh",
  background: "#f6f8f3",
  padding: "18px 12px 36px",
};

const shellStyle: CSSProperties = {
  width: "100%",
  maxWidth: 880,
  margin: "0 auto",
};

const backLinkStyle: CSSProperties = {
  display: "inline-block",
  color: "#587050",
  textDecoration: "none",
  fontSize: 14,
  marginBottom: 10,
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: 26,
  color: "#1f2a1f",
};

const subtitleStyle: CSSProperties = {
  marginTop: 6,
  marginBottom: 16,
  color: "#6f7b69",
  fontSize: 14,
};

const emptyStyle: CSSProperties = {
  background: "#fff",
  border: "1px solid #e4ece0",
  borderRadius: 16,
  padding: 28,
  color: "#6f7b69",
  textAlign: "center",
};