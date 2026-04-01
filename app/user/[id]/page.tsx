"use client";

import { use } from "react";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import EditRecord from "@/components/EditRecord";
import DeleteRecordButton from "@/app/archive/[id]/DeleteRecordButton";

export default function UserPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <Content userId={id} />;
}

function Content({ userId }: { userId: string }) {
  const [user, setUser] = useState<any>(null);
  const [groups, setGroups] = useState<any[]>([]);
  const [stats, setStats] = useState({
    archives: 0,
    records: 0,
  });

  const [me, setMe] = useState<string | null>(null);

  // ✅ 当前登录用户
  useEffect(() => {
    async function getMe() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      setMe(session?.user?.id || null);
    }

    getMe();
  }, []);

  const isOwner = me === userId;

  // ✅ 数据加载
  useEffect(() => {
    async function load() {
      // 用户
      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .maybeSingle();

      setUser(profile);

      // 档案
      const { data: archives } = await supabase
        .from("archives")
        .select("*")
        .eq("user_id", userId);

      // 记录
      const { data: records } = await supabase
        .from("records")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (!records) return;

      // 统计
      setStats({
        archives: archives?.length || 0,
        records: records.length,
      });

      // media
      const recordIds = records.map((r) => r.id);
      let mediaMap: any = {};

      if (recordIds.length > 0) {
        const { data: media } = await supabase
          .from("media")
          .select("*")
          .in("record_id", recordIds);

        media?.forEach((m) => {
          if (!mediaMap[m.record_id]) mediaMap[m.record_id] = [];
          mediaMap[m.record_id].push(m);
        });
      }

      // 分组
      const map: any = {};

      records.forEach((item) => {
        const aid = item.archive_id;

        if (!map[aid]) {
          const archive = archives?.find((a) => a.id === aid);

          map[aid] = {
            archive_id: aid,
            title: archive?.title || "未命名",
            items: [],
          };
        }

        map[aid].items.push({
          ...item,
          media: mediaMap[item.id] || [],
        });
      });

      const result = Object.values(map).map((g: any) => ({
        ...g,
        items: g.items.slice(0, 3),
      }));

      setGroups(result);
    }

    load();
  }, [userId]);

  return (
    <main style={{ padding: "16px", maxWidth: "520px", margin: "0 auto" }}>
      {/* 返回 */}
      <Link href="/discover" style={{ fontSize: 13, color: "#888" }}>
        ← 返回
      </Link>

      {/* 用户信息 */}
      <div style={{ marginTop: 20, marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* 头像 */}
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: "50%",
              background: "#eee",
              overflow: "hidden",
            }}
          >
            {user?.avatar_url && (
              <img
                src={user.avatar_url}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            )}
          </div>

          {/* 名字 + 统计 */}
          <div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>
              🙂 {user?.username || "用户"}
            </div>

            <div style={{ fontSize: 12, color: "#999" }}>
              {stats.archives} 个档案 · {stats.records} 条记录
            </div>
          </div>
        </div>

        {/* 简介 */}
        {user?.bio && (
          <div style={{ marginTop: 10, fontSize: 14, color: "#555" }}>
            {user.bio}
          </div>
        )}
      </div>

      {/* 内容 */}
      <div>
        {groups.map((group: any) => (
          <div key={group.archive_id} style={{ marginBottom: 24 }}>
            {/* 档案名 */}
            <div style={{ fontWeight: 600, marginBottom: 8 }}>
              {group.title}
            </div>

            {/* 记录 */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {group.items.map((item: any) => (
                <div key={item.id}>
                  <Link
                    href={`/archive/${item.archive_id}`}
                    style={{ textDecoration: "none", color: "inherit" }}
                  >
                    <div
                      style={{
                        display: "flex",
                        gap: 10,
                        padding: 10,
                        borderRadius: 10,
                        border: "1px solid #f5f5f5",
                      }}
                    >
                      {/* 图片 */}
                      {item.media?.[0]?.url && (
                        <img
                          src={item.media[0].url}
                          style={{
                            width: 50,
                            height: 50,
                            borderRadius: 6,
                            objectFit: "cover",
                          }}
                        />
                      )}

                      {/* 内容 */}
                      <div>
                        <div>
  <EditRecord
    id={item.id}
    initialText={item.note}
    readOnly={!isOwner}
  />


</div>
                        <div style={{ fontSize: 12, color: "#999" }}>
                          {new Date(item.created_at).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                  </Link>

                  {/* ✅ 只有自己能操作 */}
                  <div
  style={{
    marginTop: 6,
    display: "flex",
    gap: 10,
    fontSize: 12,
    color: "#bbb",
  }}
>
  {isOwner && <DeleteRecordButton id={item.id} />}
</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}