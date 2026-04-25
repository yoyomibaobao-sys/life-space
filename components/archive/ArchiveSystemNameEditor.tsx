"use client";

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
            minWidth: 160,
          }}
        />

        {suggestionsOpen && (
          <div
            style={{
              position: "absolute",
              top: 30,
              left: 0,
              width: 220,
              maxHeight: 190,
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
            {options.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => onSelect(name)}
                style={{
                  textAlign: "left",
                  fontSize: 12,
                  padding: "6px 8px",
                  borderRadius: 8,
                  border:
                    selectedValue === name
                      ? "1px solid #4CAF50"
                      : "1px solid transparent",
                  background: selectedValue === name ? "#f0fff4" : "#fafafa",
                  cursor: "pointer",
                  color: "#222",
                }}
              >
                {name}
              </button>
            ))}

            {value.trim() && options.length === 0 && (
              <div style={{ fontSize: 12, color: "#999", padding: 6 }}>
                没有找到匹配系统名
              </div>
            )}

            {value.trim() && !hasExactMatch && (
              <button
                type="button"
                onClick={() => onSelect(value.trim())}
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
                + 作为备选系统名：{value.trim()}
              </button>
            )}

            {!value.trim() && (
              <div style={{ fontSize: 12, color: "#999", padding: 6 }}>
                输入关键词后，从结果中点选
              </div>
            )}
          </div>
        )}
      </div>

      <button type="button" onClick={onSave} style={{ fontSize: 12 }}>
        保存
      </button>

      <button type="button" onClick={onCancel} style={{ fontSize: 12 }}>
        取消
      </button>
    </span>
  );
}
