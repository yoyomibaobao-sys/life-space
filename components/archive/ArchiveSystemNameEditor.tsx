"use client";

import SystemNameSelector from "@/components/archive/SystemNameSelector";

type Props = {
  value: string;
  selectedValue: string;
  options: string[];
  suggestionsOpen: boolean;
  hasExactMatch: boolean;
  onChange: (value: string) => void;
  onSelect: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
};

export default function ArchiveSystemNameEditor({
  value,
  selectedValue,
  options,
  suggestionsOpen,
  hasExactMatch,
  onChange,
  onSelect,
  onSave,
  onCancel,
}: Props) {
  return (
    <span
      onClick={(e) => e.stopPropagation()}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        position: "relative",
        flexWrap: "wrap",
      }}
    >
      <SystemNameSelector
        value={value}
        selectedValue={selectedValue}
        candidates={options.map((label) => ({ label }))}
        suggestionsOpen={suggestionsOpen}
        hasExactMatch={hasExactMatch}
        onChange={onChange}
        onSelect={(candidate) => onSelect(candidate.label)}
        placeholder="输入关键词后点选"
        emptyText="没有找到匹配具体名称"
        customActionLabel={(inputValue) => `+ 新增为具体名称：${inputValue}`}
      />

      <button type="button" onClick={onSave} style={{ fontSize: 12 }}>
        保存
      </button>

      <button type="button" onClick={onCancel} style={{ fontSize: 12 }}>
        取消
      </button>
    </span>
  );
}
