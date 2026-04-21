"use client";

import { Suspense, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { getBehaviorTagLabel } from "@/lib/tag-labels";
import TagList from "@/components/TagList";

type RawRecordTag = {
  tag: string;
  tag_type: string;
  source: string;
  is_active: boolean;
};

type SearchItem = {
  id: string;
  archive_id: string;
  user_id: string;
  note: string | null;
  record_time: string;
  status_tag: string | null;
  parsed_actions: string[] | null;
  primary_image_url: string | null;
  record_tags?: RawRecordTag[];
  archives?: {
    id: string;
    title: string;
    species_id: string | null;
    species_name_snapshot?: string | null;
    user_id: string;
    is_public: boolean;
  } | null;
  profiles?: {
    username: string | null;
  } | null;
  display_tags?: string[];
};

export default function DiscoverSearchPage() {
  return (
    <Suspense
      fallback={
        <main style={{ padding: 14, maxWidth: 640, margin: "0 auto" }}>
          加载中...
        </main>
      }
    >
      <DiscoverSearchContent />
    </Suspense>
  );
}

function DiscoverSearchContent() {
  const searchParams = useSearchParams();

  const tag = searchParams.get("tag");
  const species = searchParams.get("species");
  const name = searchParams.get("name");

  const [items, setItems] = useState<SearchItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);

      let query = supabase
        .from("records")
        .select(`
          id,
          archive_id,
          user_id,
          note,
          record_time,
          status_tag,
          parsed_actions,
          primary_image_url,
          visibility,
          record_tags (
            tag,
            tag_type,
            source,
            is_active
          ),
          archives!inner (
            id,
            title,
            species_id,
            species_name_snapshot,
            user_id,
            is_public
          )
        `)
        .eq("visibility", "public")
        .eq("archives.is_public", true)
        .order("record_time", { ascending: false });

      if (species) {
        query = query.eq("archives.species_id", species);
      } else if (name) {
        query = query.eq("archives.species_name_snapshot", name);
      }

      const { data, error } = await query;

      if (error) {
        console.error("discover search load error:", error);
        setItems([]);
        setLoading(false);
        return;
      }

      const rawRecords: SearchItem[] = Array.isArray(data)
        ? (data as unknown as SearchItem[])
        : [];

      let records = rawRecords.map((item) => {
        const behaviorTags =
          item.record_tags
            ?.filter(
              (t) => t.tag_type === "behavior" && t.is_active !== false
            )
            .map((t) => t.tag) || [];

        const displayTags = Array.from(new Set(behaviorTags));

        return {
          ...item,
          display_tags: displayTags,
        };
      });

      if (tag) {
        records = records.filter((item) => {
          const tags = Array.isArray(item.display_tags)
            ? item.display_tags
            : [];
          return tags.includes(tag);
        });
      }

      const userIds = Array.from(
        new Set(records.map((item) => item.user_id).filter(Boolean))
      );

      const profileMap = new Map<string, { username: string | null }>();

      if (userIds.length > 0) {
        const { data: profilesData } = await supabase
          .from("profiles")
          .select("id, username")
          .in("id", userIds);

        (profilesData || []).forEach((p: any) => {
          profileMap.set(p.id, { username: p.username });
        });
      }

      const finalList = records.map((item) => ({
        ...item,
        profiles: profileMap.get(item.user_id) || { username: "用户" },
      }));

      setItems(finalList);
      setLoading(false);
    }

    load();
  }, [tag, species, name]);

  return (
    <main style={{ padding: 14, maxWidth: 640, margin: "0 auto" }}>
      <div style={{ marginBottom: 16 }}>
        <Link href="/discover" style={{ fontSize: 14, color: "#666" }}>
          ← 返回发现页
        </Link>
      </div>

      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 6 }}>
          相关记录
        </div>

        <div style={{ fontSize: 13, color: "#666" }}>
          {tag ? <>标签：{getBehaviorTagLabel(tag)}</> : <>全部标签</>}
          {species ? <> · 已限定同植物</> : null}
          {!species && name ? <> · 已按植物名称筛选：{name}</> : null}
        </div>
      </div>

      {loading ? (
        <div style={{ padding: "24px 0", color: "#888" }}>加载中...</div>
      ) : items.length === 0 ? (
        <div style={{ padding: "24px 0", color: "#888" }}>暂无相关记录</div>
      ) : (
        items.map((item) => (
          <Link
            key={item.id}
            href={`/archive/${item.archive_id}`}
            style={{
              display: "flex",
              gap: 10,
              padding: 10,
              marginBottom: 12,
              border: "1px solid #eee",
              borderRadius: 10,
              background: "#fff",
              color: "#000",
              textDecoration: "none",
            }}
          >
            {item.primary_image_url ? (
              <img
                src={item.primary_image_url}
                alt="record cover"
                style={{
                  width: 64,
                  height: 64,
                  objectFit: "cover",
                  borderRadius: 8,
                  flexShrink: 0,
                }}
              />
            ) : null}

            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  marginBottom: 4,
                  wordBreak: "break-word",
                }}
              >
                {item.archives?.title || "未命名项目"}

                {(item.archives?.species_name_snapshot ||
                  item.archives?.species_id) && (
                  <span
                    style={{
                      marginLeft: 6,
                      fontSize: 12,
                      color: "#4CAF50",
                      fontWeight: 400,
                    }}
                  >
                    · 🌿 {item.archives?.species_name_snapshot || "未知植物"}
                  </span>
                )}
              </div>

              <div
                style={{
                  fontSize: 13,
                  color: "#333",
                  wordBreak: "break-word",
                }}
              >
                {item.note || "（无文字内容）"}
              </div>

              <TagList tags={item.display_tags} />

              <div style={{ fontSize: 12, color: "#888", marginTop: 6 }}>
                {item.profiles?.username || "用户"} ·{" "}
                {new Date(item.record_time).toLocaleDateString("zh-CN")}
                {item.status_tag === "help" ? " · 求助" : ""}
              </div>
            </div>
          </Link>
        ))
      )}
    </main>
  );
}
