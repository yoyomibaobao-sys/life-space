"use client";

import type {
  CSSProperties,
  KeyboardEvent,
  ReactNode,
} from "react";

export type SystemNameSelectorCandidate = {
  id?: string | null;
  label: string;
  description?: ReactNode;
  source?: string;
  plantId?: string | null;
  plantSlug?: string | null;
  searchText?: string;
};

type CandidateStyle =
  | CSSProperties
  | ((candidate: SystemNameSelectorCandidate, selected: boolean) => CSSProperties);

type Props = {
  value: string;
  onChange: (value: string) => void;
  candidates: SystemNameSelectorCandidate[];
  placeholder?: string;
  selectedValue?: string;
  suggestionsOpen?: boolean;
  onSuggestionsOpenChange?: (open: boolean) => void;
  onSelect?: (candidate: SystemNameSelectorCandidate) => void;
  onUseCustom?: (value: string) => void;
  allowCustom?: boolean;
  hasExactMatch?: boolean;
  showSource?: boolean;
  autoFocus?: boolean;
  maxCandidates?: number;
  idleText?: ReactNode;
  emptyText?: ReactNode;
  customActionLabel?: (value: string) => ReactNode;
  containerStyle?: CSSProperties;
  inputStyle?: CSSProperties;
  panelStyle?: CSSProperties;
  optionStyle?: CandidateStyle;
  selectedOptionStyle?: CSSProperties;
  customOptionStyle?: CSSProperties;
  emptyStyle?: CSSProperties;
  sourceStyle?: CSSProperties;
  onBlur?: () => void;
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
};

function normalize(value?: string | null) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function getCandidateKey(candidate: SystemNameSelectorCandidate, index: number) {
  return `${candidate.source || "candidate"}-${candidate.id || candidate.plantId || candidate.label}-${index}`;
}

function resolveOptionStyle(
  style: CandidateStyle | undefined,
  candidate: SystemNameSelectorCandidate,
  selected: boolean
) {
  if (typeof style === "function") return style(candidate, selected);
  return style;
}

const defaultInputStyle: CSSProperties = {
  fontSize: 12,
  padding: "4px 6px",
  borderRadius: 6,
  border: "1px solid #ddd",
  minWidth: 160,
};

const defaultPanelStyle: CSSProperties = {
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
};

const defaultOptionStyle: CSSProperties = {
  textAlign: "left",
  fontSize: 12,
  padding: "6px 8px",
  borderRadius: 8,
  border: "1px solid transparent",
  background: "#fafafa",
  cursor: "pointer",
  color: "#222",
};

const defaultSelectedOptionStyle: CSSProperties = {
  border: "1px solid #4CAF50",
  background: "#f0fff4",
};

const defaultCustomOptionStyle: CSSProperties = {
  ...defaultOptionStyle,
  border: "1px dashed #4CAF50",
  background: "#fff",
  color: "#4CAF50",
};

const defaultEmptyStyle: CSSProperties = {
  fontSize: 12,
  color: "#999",
  padding: 6,
};

export default function SystemNameSelector({
  value,
  onChange,
  candidates,
  placeholder = "输入关键词后点选",
  selectedValue = "",
  suggestionsOpen = false,
  onSuggestionsOpenChange,
  onSelect,
  onUseCustom,
  allowCustom = true,
  hasExactMatch,
  showSource = false,
  autoFocus,
  maxCandidates,
  idleText = "输入关键词后，从结果中点选",
  emptyText = "没有找到匹配候选，可使用当前输入。",
  customActionLabel = (inputValue) => `使用“${inputValue}”作为新的系统名`,
  containerStyle,
  inputStyle,
  panelStyle,
  optionStyle,
  selectedOptionStyle,
  customOptionStyle,
  emptyStyle,
  sourceStyle,
  onBlur,
  onKeyDown,
}: Props) {
  const trimmedValue = normalize(value);
  const visibleCandidates =
    typeof maxCandidates === "number"
      ? candidates.slice(0, maxCandidates)
      : candidates;
  const exactMatch =
    hasExactMatch ??
    visibleCandidates.some(
      (candidate) => normalize(candidate.label).toLowerCase() === trimmedValue.toLowerCase()
    );

  function handleSelect(candidate: SystemNameSelectorCandidate) {
    onSelect?.(candidate);
    onSuggestionsOpenChange?.(false);
  }

  function handleUseCustom() {
    if (!trimmedValue) return;

    if (onUseCustom) {
      onUseCustom(trimmedValue);
    } else {
      onSelect?.({ label: trimmedValue, source: "current" });
    }
    onSuggestionsOpenChange?.(false);
  }

  return (
    <div style={{ position: "relative", ...containerStyle }}>
      <input
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          onSuggestionsOpenChange?.(true);
        }}
        onFocus={() => onSuggestionsOpenChange?.(true)}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        autoFocus={autoFocus}
        placeholder={placeholder}
        style={{ ...defaultInputStyle, ...inputStyle }}
      />

      {suggestionsOpen ? (
        <div
          onMouseDown={(event) => event.preventDefault()}
          style={{ ...defaultPanelStyle, ...panelStyle }}
        >
          {visibleCandidates.map((candidate, index) => {
            const selected = selectedValue === candidate.label;
            return (
              <button
                key={getCandidateKey(candidate, index)}
                type="button"
                onClick={() => handleSelect(candidate)}
                style={{
                  ...defaultOptionStyle,
                  ...resolveOptionStyle(optionStyle, candidate, selected),
                  ...(selected ? { ...defaultSelectedOptionStyle, ...selectedOptionStyle } : null),
                }}
              >
                <strong>{candidate.label}</strong>
                {candidate.description ? (
                  <span style={{ color: "#7b8578", marginLeft: 6 }}>
                    {candidate.description}
                  </span>
                ) : null}
                {showSource && candidate.source ? (
                  <span style={{ color: "#999", marginLeft: 6, ...sourceStyle }}>
                    {candidate.source}
                  </span>
                ) : null}
              </button>
            );
          })}

          {!visibleCandidates.length && trimmedValue ? (
            <div style={{ ...defaultEmptyStyle, ...emptyStyle }}>{emptyText}</div>
          ) : null}

          {allowCustom && trimmedValue && !exactMatch ? (
            <button
              type="button"
              onClick={handleUseCustom}
              style={{ ...defaultCustomOptionStyle, ...customOptionStyle }}
            >
              {customActionLabel(trimmedValue)}
            </button>
          ) : null}

          {!trimmedValue ? (
            <div style={{ ...defaultEmptyStyle, ...emptyStyle }}>{idleText}</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
