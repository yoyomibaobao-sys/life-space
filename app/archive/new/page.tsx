"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

type ArchiveCategory = "plant" | "system";

export default function NewArchive() {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<ArchiveCategory>("plant");

  const [speciesList, setSpeciesList] = useState<any[]>([]);
  const [speciesId, setSpeciesId] = useState<string | null>(null);
  const [pendingSpeciesName, setPendingSpeciesName] = useState<string | null>(
    null
  );

  const [source, setSource] = useState("");
  const [note, setNote] = useState("");

  const [loading, setLoading] = useState(false);

  const router = useRouter();

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

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (loading) return;

    if (!title.trim()) {
      alert("请输入名称");
      return;
    }

    if (category === "plant" && !speciesId && !pendingSpeciesName) {
      alert("请选择植物，或新增一个候选植物");
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

    const selectedSpecies = speciesList.find((s) => s.id === speciesId);
    const speciesNameSnapshot =
      category === "plant"
        ? pendingSpeciesName ||
          selectedSpecies?.common_name ||
          selectedSpecies?.scientific_name ||
          null
        : null;

    const { error } = await supabase.from("archives").insert([
      {
        title: title.trim(),
        category,
        species_id: category === "plant" ? speciesId : null,
        species_name_snapshot: speciesNameSnapshot,
        source: source.trim() || null,
        note: note.trim() || null,
        user_id: user.id,
        is_public: true,
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

    const exists = speciesList.find(
      (s) => s.common_name === name || s.scientific_name === name
    );

    if (exists) {
      setSpeciesId(exists.id);
      setPendingSpeciesName(null);
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error } = await supabase.from("plant_species_pending").insert([
      {
        user_id: user?.id || null,
        submitted_name: name,
        language_code: "zh",
        status: "pending",
      },
    ]);

    if (error) {
      alert("提交候选植物失败：" + error.message);
      return;
    }

    setSpeciesId(null);
    setPendingSpeciesName(name);

    alert(`已加入候选植物：${name}\n当前可继续创建档案。`);
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
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 14, marginBottom: 6 }}>项目名称 *</div>

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

        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 14, marginBottom: 6 }}>种类 *</div>

          <select
            value={category}
            onChange={(e) => {
              const next = e.target.value as ArchiveCategory;
              setCategory(next);

              if (next !== "plant") {
                setSpeciesId(null);
                setPendingSpeciesName(null);
              }
            }}
            style={{
              padding: "10px",
              width: "100%",
              border: "1px solid #ddd",
              borderRadius: "6px",
              fontSize: 14,
              background: "#fff",
            }}
          >
            <option value="plant">🌿 植物</option>
            <option value="system">🛠 设施</option>
          </select>
        </div>

        {category === "plant" && (
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
                  return;
                }

                setSpeciesId(value || null);
                setPendingSpeciesName(null);
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

              <option value="__new__">+ 新增植物</option>
            </select>

            {pendingSpeciesName && (
              <div
                style={{
                  marginTop: 8,
                  fontSize: 12,
                  color: "#666",
                  lineHeight: 1.6,
                }}
              >
                当前使用候选植物：
                <strong>{pendingSpeciesName}</strong>
              </div>
            )}
          </div>
        )}

        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 13, marginBottom: 4 }}>来源（选填）</div>

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

        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 13, marginBottom: 4 }}>备注（选填）</div>

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
