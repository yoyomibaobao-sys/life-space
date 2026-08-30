"use client";

import { useEffect, useId, useRef, useState } from "react";
import type {
  CSSProperties,
  KeyboardEvent,
  ReactNode,
} from "react";
import { useLanguage } from "@/lib/i18n/useLanguage";
import { getArchiveCategoryLabel, type ArchiveCategory } from "@/lib/archive-categories";
import { resolveExactSystemNameCandidate } from "@/lib/system-name-candidates";

export type SystemNameSelectorCandidate = {
  id?: string | null;
  label: string;
  description?: ReactNode;
  source?: string;
  plantId?: string | null;
  plantSlug?: string | null;
  searchText?: string;
  aliases?: string[];
  category?: ArchiveCategory;
  sectionName?: string;
  sectionNameEn?: string;
};

type CandidateStyle =
  | CSSProperties
  | ((candidate: SystemNameSelectorCandidate, selected: boolean) => CSSProperties);

type Props = {
  value: string;
  onChange: (value: string) => void;
  candidates: SystemNameSelectorCandidate[];
  resolutionCandidates?: SystemNameSelectorCandidate[];
  placeholder?: string;
  selectedValue?: string;
  suggestionsOpen?: boolean;
  onSuggestionsOpenChange?: (open: boolean) => void;
  onSelect?: (candidate: SystemNameSelectorCandidate) => void;
  onResolveCandidate?: (candidate: SystemNameSelectorCandidate) => void;
  onUseCustom?: (value: string) => void;
  allowCustom?: boolean;
  hasExactMatch?: boolean;
  showSource?: boolean;
  showCategory?: boolean;
  loading?: boolean;
  required?: boolean;
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
  top: "calc(100% + 4px)",
  left: 0,
  width: "100%",
  boxSizing: "border-box",
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
  resolutionCandidates = candidates,
  placeholder,
  selectedValue = "",
  suggestionsOpen = false,
  onSuggestionsOpenChange,
  onSelect,
  onResolveCandidate,
  onUseCustom,
  allowCustom = true,
  hasExactMatch,
  showSource = false,
  showCategory = false,
  loading = false,
  required = false,
  autoFocus,
  maxCandidates,
  idleText,
  emptyText,
  customActionLabel,
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
  const { language, t } = useLanguage();
  const listId = useId();
  const resolvedKeyRef = useRef("");
  const [isComposing, setIsComposing] = useState(false);
  const resolvedPlaceholder = placeholder || t.archive_workspace.input_then_select;
  const resolvedIdleText = idleText ?? t.archive.candidate_idle;
  const resolvedEmptyText = emptyText ?? t.archive.candidate_empty;
  const resolvedCustomActionLabel =
    customActionLabel ||
    ((inputValue: string) => `${t.archive.use_as_system_name}: ${inputValue}`);
  const trimmedValue = normalize(value);
  useEffect(() => {
    if (!onResolveCandidate || loading || isComposing) return;
    const resolved = resolveExactSystemNameCandidate(resolutionCandidates, value);
    const key = resolved ? `${value}:${resolved.category}:${resolved.id || resolved.label}` : "";
    if (key === resolvedKeyRef.current) return;
    resolvedKeyRef.current = key;
    if (resolved) onResolveCandidate(resolved);
  }, [resolutionCandidates, value, onResolveCandidate, loading, isComposing]);
  const visibleCandidates =
    typeof maxCandidates === "number"
      ? candidates.slice(0, maxCandidates)
      : candidates;
  const exactMatch = Boolean(resolveExactSystemNameCandidate(resolutionCandidates, value)) || (
    hasExactMatch ??
    visibleCandidates.some(
      (candidate) => normalize(candidate.label).toLowerCase() === trimmedValue.toLowerCase()
    ));

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
        onBlur={(event) => {
          if (!event.currentTarget.parentElement?.contains(event.relatedTarget)) onBlur?.();
        }}
        onKeyDown={(event) => {
          if (!isComposing && !event.nativeEvent.isComposing) onKeyDown?.(event);
        }}
        onCompositionStart={() => setIsComposing(true)}
        onCompositionEnd={() => setIsComposing(false)}
        autoFocus={autoFocus}
        required={required}
        role="combobox"
        aria-required={required || undefined}
        aria-expanded={suggestionsOpen}
        aria-controls={suggestionsOpen ? listId : undefined}
        aria-autocomplete="list"
        aria-label={resolvedPlaceholder}
        placeholder={resolvedPlaceholder}
        style={{ ...defaultInputStyle, ...inputStyle }}
      />

      {suggestionsOpen ? (
        <div
          id={listId}
          role="listbox"
          onMouseDown={(event) => event.preventDefault()}
          style={{ ...defaultPanelStyle, ...panelStyle }}
        >
          {visibleCandidates.map((candidate, index) => {
            const selected = selectedValue === candidate.label;
            return (
              <button
                key={getCandidateKey(candidate, index)}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => handleSelect(candidate)}
                style={{
                  ...defaultOptionStyle,
                  ...resolveOptionStyle(optionStyle, candidate, selected),
                  ...(selected ? { ...defaultSelectedOptionStyle, ...selectedOptionStyle } : null),
                }}
              >
                <strong>{candidate.label}</strong>
                {showCategory && candidate.category ? (
                  <span style={{ display: "block", color: "#63745d", fontSize: 12, lineHeight: 1.5, marginTop: 3 }}>
                    {getArchiveCategoryLabel(candidate.category, language)}
                    {(language === "en" ? candidate.sectionNameEn || candidate.sectionName : candidate.sectionName) ? ` · ${language === "en" ? candidate.sectionNameEn || candidate.sectionName : candidate.sectionName}` : ""}
                  </span>
                ) : null}
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

          {loading ? <div role="status" style={{ ...defaultEmptyStyle, ...emptyStyle }}>{t.archive.loading}</div> : null}

          {!loading && !visibleCandidates.length && trimmedValue ? (
              <div style={{ ...defaultEmptyStyle, ...emptyStyle }}>{resolvedEmptyText}</div>
          ) : null}

          {allowCustom && !loading && trimmedValue && !exactMatch ? (
            <button
              type="button"
              onClick={handleUseCustom}
              style={{ ...defaultCustomOptionStyle, ...customOptionStyle }}
            >
                {resolvedCustomActionLabel(trimmedValue)}
            </button>
          ) : null}

          {!trimmedValue ? (
            <div style={{ ...defaultEmptyStyle, ...emptyStyle }}>{resolvedIdleText}</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
