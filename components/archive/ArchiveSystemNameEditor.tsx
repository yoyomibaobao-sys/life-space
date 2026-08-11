"use client";

import SystemNameSelector from "@/components/archive/SystemNameSelector";
import { useLanguage } from "@/lib/i18n/useLanguage";

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
  const { t } = useLanguage();

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
        placeholder={t.archive_workspace.input_then_select}
        emptyText={t.archive_workspace.no_matching_specific_name}
        customActionLabel={(inputValue) =>
          `+ ${t.archive_workspace.add_as_specific_name}${inputValue}`
        }
      />

      <button type="button" onClick={onSave} style={{ fontSize: 12 }}>
        {t.archive_workspace.save}
      </button>

      <button type="button" onClick={onCancel} style={{ fontSize: 12 }}>
        {t.archive_workspace.cancel}
      </button>
    </span>
  );
}
