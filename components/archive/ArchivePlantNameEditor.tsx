"use client";

import SystemNameSelector from "@/components/archive/SystemNameSelector";
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
      <SystemNameSelector
        value={value}
        onChange={onChange}
        candidates={results.map((species) => ({
          id: species.id,
          label: species.display_name || species.common_name || species.scientific_name || "未命名植物",
          description: [
            species.scientific_name,
            Array.isArray(species.aliases) && species.aliases.length > 0
              ? `别名：${species.aliases.slice(0, 4).join("、")}`
              : "",
          ]
            .filter(Boolean)
            .join(" · "),
        }))}
        selectedValue={selectedSpeciesId}
        suggestionsOpen={suggestionsOpen}
        hasExactMatch={hasExactMatch}
        onSelect={(candidate) => {
          const selected = results.find((species) => species.id === candidate.id);
          if (selected) onSelectSpecies(selected);
        }}
        onUseCustom={onSubmitPending}
        placeholder="输入关键词后点选"
        inputStyle={{
          fontSize: 12,
          padding: "4px 6px",
          borderRadius: 6,
          border: "1px solid #ddd",
          minWidth: 180,
        }}
        panelStyle={{
          width: 280,
          maxHeight: 210,
        }}
        optionStyle={(candidate) => ({
          border:
            selectedSpeciesId === candidate.id
              ? "1px solid #4CAF50"
              : "1px solid transparent",
          background: selectedSpeciesId === candidate.id ? "#f0fff4" : "#fafafa",
        })}
        emptyText="没有找到匹配植物"
        customActionLabel={(inputValue) => `+ 新增候选植物：${inputValue}`}
      />

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
