"use client";

import type { PlantSpeciesOption } from "@/lib/archive-page-types";

type Props = {
  value: string;
  pendingName: string;
  selectedSpeciesId: string;
  suggestionsOpen: boolean;
  results: PlantSpeciesOption[];
  hasExactMatch: boolean;
  onChange: (value: string) => void;
  onSelectSpecies: (species: PlantSpeciesOption) => void;
  onSubmitPending: () => void;
  onSave: () => void;
  onCancel: () => void;
};

export default function ArchivePlantNameEditor({
  value,
  pendingName,
  selectedSpeciesId,
  suggestionsOpen,
  results,
  hasExactMatch,
  onChange,
  onSelectSpecies,
  onSubmitPending,
  onSave,
  onCancel,
}: Props) {
  return (
    <span
      onClick={(e) => e.stopPropagation()}
      style={{
        display: "inline-flex",
        gap: 6,
        alignItems: "center",
        flexWrap: "wrap",
      }}
    >
      <div style={{ position: "relative" }}>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="输入关键词后点选"
          style={{
            fontSize: 12,
            padding: "4px 6px",
            borderRadius: 6,
            border: "1px solid #ddd",
            minWidth: 180,
          }}
        />

        {suggestionsOpen && (
          <div
            style={{
              position: "absolute",
              top: 30,
              left: 0,
              width: 280,
              maxHeight: 210,
              overflow: "auto",
              background: "#fff",
              border: "1px solid #e5e5e5",
              borderRadius: 10,
              padding: 8,
              boxShadow: "0 10px 24px rgba(0,0,0,0.12)",
              zIndex: 1000,
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            {results.map((species) => (
              <button
                key={species.id}
                type="button"
                onClick={() => onSelectSpecies(species)}
                style={{
                  textAlign: "left",
                  fontSize: 12,
                  padding: "6px 8px",
                  borderRadius: 8,
                  border:
                    selectedSpeciesId === species.id
                      ? "1px solid #4CAF50"
                      : "1px solid transparent",
                  background:
                    selectedSpeciesId === species.id ? "#f0fff4" : "#fafafa",
                  cursor: "pointer",
                  color: "#222",
                }}
              >
                <strong style={{ color: "#222" }}>
                  {species.display_name || species.common_name || species.scientific_name || "未命名植物"}
                </strong>
                {species.scientific_name && (
                  <span style={{ color: "#888", marginLeft: 6 }}>
                    {species.scientific_name}
                  </span>
                )}
                {Array.isArray(species.aliases) && species.aliases.length > 0 && (
                  <div style={{ color: "#999", marginTop: 2 }}>
                    别名：{species.aliases.slice(0, 4).join("、")}
                  </div>
                )}
              </button>
            ))}

            {results.length === 0 && (
              <div style={{ fontSize: 12, color: "#999", padding: 6 }}>
                没有找到匹配植物
              </div>
            )}

            {value.trim() && !hasExactMatch && (
              <button
                type="button"
                onClick={onSubmitPending}
                style={{
                  textAlign: "left",
                  fontSize: 12,
                  padding: "6px 8px",
                  borderRadius: 8,
                  border: "1px dashed #4CAF50",
                  background: "#fff",
                  color: "#4CAF50",
                  cursor: "pointer",
                }}
              >
                + 新增候选植物：{value.trim()}
              </button>
            )}
          </div>
        )}
      </div>

      {pendingName && <span style={{ fontSize: 12, color: "#666" }}>候选：{pendingName}</span>}

      <button type="button" onClick={onSave} style={{ fontSize: 12 }}>
        保存
      </button>

      <button type="button" onClick={onCancel} style={{ fontSize: 12 }}>
        取消
      </button>
    </span>
  );
}
