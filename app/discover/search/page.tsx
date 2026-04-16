"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function DiscoverSearchPage() {
  const searchParams = useSearchParams();

  const tag = searchParams.get("tag");
  const species = searchParams.get("species");

  const [records, setRecords] = useState<any[]>([]);
  const [onlyHelp, setOnlyHelp] = useState(false); // ⭐ 新增

  useEffect(() => {
    async function load() {
      let query = supabase
        .from("records")
        .select(`
          *,
          record_tags ( tag ),
          archives ( species_id, title ),
          profiles ( username )
        `)
        .order("record_time", { ascending: false });

      // ⭐ 物种筛选
      if (species) {
        query = query.eq("archives.species_id", species);
      }

      const { data } = await query;

      let filtered = data || [];

      // ⭐ 标签筛选
      if (tag) {
        filtered = filtered.filter((r: any) =>
          r.record_tags?.some((t: any) => t.tag === tag)
        );
      }

      // ⭐ 求助筛选（核心新增）
      if (onlyHelp) {
        filtered = filtered.filter((r: any) => r.status === "help");
      }

      setRecords(filtered);
    }

    load();
  }, [tag, species, onlyHelp]); // ⭐ 加 onlyHelp

  return (
    <main style={{ padding: 16 }}>
      {/* ⭐ 搜索条件 */}
      <div style={{ marginBottom: 8, fontSize: 14 }}>
        🔍 {tag && `标签：${tag}`} {species && `· 同物种`}
      </div>

      {/* ⭐ 求助筛选 */}
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 13, color: "#555" }}>
          <input
            type="checkbox"
            checked={onlyHelp}
            onChange={(e) => setOnlyHelp(e.target.checked)}
            style={{ marginRight: 6 }}
          />
          仅看求助
        </label>
      </div>

      {/* ⭐ 列表 */}
      {records.length === 0 ? (
        <div style={{ color: "#999" }}>暂无记录</div>
      ) : (
        records.map((item: any) => (
          <a
            key={item.id}
            href={`/archive/${item.archive_id}?record=${item.id}`}
            style={{
              display: "block",
              padding: 12,
              marginBottom: 10,
              border: "1px solid #eee",
              borderRadius: 8,
              textDecoration: "none",
              color: "#000",
              background: "#fff",
            }}
          >
            {/* ⭐ 状态 + 内容 */}
            <div style={{ fontSize: 15 }}>
              <span style={{ marginRight: 4 }}>
                {item.status === "help" && "❗"}
                {item.status === "ok" && "✅"}
                {item.status === "problem" && "⚠️"}
              </span>
              {item.note}
            </div>

            {/* ⭐ 标签 */}
            <div style={{ marginTop: 6, fontSize: 12 }}>
              {item.record_tags?.map((t: any, i: number) => (
                <span
                  key={i}
                  style={{
                    marginRight: 6,
                    color: "#4CAF50",
                  }}
                >
                  #{t.tag}
                </span>
              ))}
            </div>

            {/* ⭐ 信息 */}
            <div style={{ fontSize: 12, color: "#999", marginTop: 6 }}>
              {item.archives?.title || "植物"} ·{" "}
              {new Date(item.record_time).toLocaleDateString()}
            </div>
          </a>
        ))
      )}
    </main>
  );
}