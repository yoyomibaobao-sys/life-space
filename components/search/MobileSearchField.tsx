"use client";

import type { ChangeEvent } from "react";
import UiIcon from "@/components/ui/UiIcon";
import styles from "@/components/search/MobileSearchField.module.css";

export default function MobileSearchField({
  value,
  onChange,
  placeholder,
  ariaLabel,
  clearAriaLabel = ariaLabel,
  autoFocus = false,
  onClear,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  ariaLabel: string;
  clearAriaLabel?: string;
  autoFocus?: boolean;
  onClear?: () => void;
}) {
  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    onChange(event.target.value);
  }

  return (
    <label className={styles.field}>
      <UiIcon name="search" size={16} strokeWidth={1.8} />
      <input
        type="text"
        value={value}
        onChange={handleChange}
        placeholder={placeholder}
        aria-label={ariaLabel}
        autoFocus={autoFocus}
        className={styles.input}
      />
      {value ? (
        <button
          type="button"
          onClick={() => (onClear ? onClear() : onChange(""))}
          aria-label={clearAriaLabel}
          className={styles.clear}
        >
          <UiIcon name="close" size={15} strokeWidth={1.8} />
        </button>
      ) : null}
    </label>
  );
}
