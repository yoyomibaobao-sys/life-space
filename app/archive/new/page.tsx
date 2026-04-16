"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

export default function NewArchive() {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("植物");

  const [speciesList, setSpeciesList] = useState<any[]>([]);
  const [speciesId, setSpeciesId] = useState<string | null>(null);

  const [source, setSource] = useState("");
  const [note, setNote] = useState("");

  const [loading, setLoading] = useState(false);

  const router = useRouter();

  // 加载植物百科
  useEffect(() => {
    async function loadSpecies() {
      const { data } = await supabase
        .from("plant_species")
        .select("id, common_name, scientific_name")
        .order("common_name", { ascending: true });

      setSpeciesList(data || []);
    }

    loadSpecies();
  }, []);

  async function handleCreate(e: any) {
    e.preventDefault();

    if (loading) return;

    if (!title.trim()) {
      alert("请输入名称");
      return;
    }
if (category === "植物" && !speciesId) {
  alert("请选择植物");
  setLoading(false);
  return;
}
    setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      alert("未登录");
      setLoading(false);
      return;
    }

    const { error } = await supabase
      .from("archives")
      .insert([
        {
          title: title.trim(),
          category,
          species_id: category === "植物" ? speciesId : null,
          source: source || null,
          note: note || null,
          user_id: user.id,
        },
      ]);

    setLoading(false);

    if (error) {
      alert("创建失败：" + error.message);
      return;
    }

    router.push("/archive");
  }
async function handleAddSpecies() {
  let name = prompt("输入植物名称");
  if (!name) return;

  name = name.trim();

  if (!name) return;

  // ⭐ 简单查重（可选但推荐）
  const exists = speciesList.find(
    (s) => s.common_name === name
  );

  if (exists) {
    setSpeciesId(exists.id);
    return;
  }

  // ⭐ 判断是否英文（可选优化）
  const isEnglish = /^[a-zA-Z\s]+$/.test(name);

  const { data, error } = await supabase
    .from("plant_species")
    .insert([
      {
        common_name: name,
        scientific_name: isEnglish ? name : null,
      },
    ])
    .select()
    .single();

  if (error) {
    alert("添加失败");
    return;
  }

  // ⭐ 更新列表
  setSpeciesList((prev) => [...prev, data]);

  // ⭐ 自动选中
  setSpeciesId(data.id);
}
  return (
    <main
      style={{
        padding: "30px 20px",
        maxWidth: 420,
        margin: "0 auto",
      }}
    >
      <h2 style={{ marginBottom: 20 }}>新建项目</h2>

      <form onSubmit={handleCreate}>
        {/* 名称 */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 14, marginBottom: 6 }}>
            项目名称 *
          </div>

          <input
            placeholder="例如：阳台迷迭香"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            style={{
              padding: "10px",
              width: "100%",
              border: "1px solid #ddd",
              borderRadius: "6px",
              fontSize: 14,
            }}
          />
        </div>

        {/* 种类 */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 14, marginBottom: 6 }}>
            种类 *
          </div>

          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            style={{
              padding: "10px",
              width: "100%",
              border: "1px solid #ddd",
              borderRadius: "6px",
              fontSize: 14,
              background: "#fff",
            }}
          >
            <option value="植物">🌿 植物</option>
            <option value="设施">🛠 设施</option>
          </select>
        </div>

        {/* 系统名称（植物百科） */}
        {category === "植物" && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 13, marginBottom: 4 }}>
              系统名称（选择植物）
            </div>

            <select
              value={speciesId || ""}
              onChange={(e) => {
  const value = e.target.value;

  if (value === "__new__") {
    handleAddSpecies();
  } else {
    setSpeciesId(value || null);
  }
}}

              style={{
                padding: "8px",
                width: "100%",
                border: "1px solid #ddd",
                borderRadius: "6px",
                fontSize: 13,
                background: "#fff",
              }}
            >
              <option value="">请选择植物 *</option>

              {speciesList.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.common_name || s.scientific_name}
                </option>
              ))}
              {/* ⭐ 新增这一行 */}
<option value="__new__">+ 新增植物</option>
            </select>
          </div>
        )}

        {/* 来源 */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 13, marginBottom: 4 }}>
            来源（选填）
          </div>

          <input
            placeholder="例如：市场购买 / 朋友分享"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            style={{
              padding: "8px",
              width: "100%",
              border: "1px solid #ddd",
              borderRadius: "6px",
              fontSize: 13,
            }}
          />
        </div>

        {/* 备注 */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 13, marginBottom: 4 }}>
            备注（选填）
          </div>

          <textarea
            placeholder="简单记录一下背景..."
            value={note}
            onChange={(e) => setNote(e.target.value)}
            style={{
              padding: "8px",
              width: "100%",
              border: "1px solid #ddd",
              borderRadius: "6px",
              fontSize: 13,
              minHeight: 60,
            }}
          />
        </div>

        {/* 提交 */}
        <button
          type="submit"
          disabled={loading}
          style={{
            width: "100%",
            padding: "12px",
            background: loading ? "#999" : "#4CAF50",
            color: "#fff",
            border: "none",
            borderRadius: "8px",
            fontSize: 14,
            cursor: "pointer",
          }}
        >
          {loading ? "创建中..." : "创建"}
        </button>
      </form>
    </main>
  );
}