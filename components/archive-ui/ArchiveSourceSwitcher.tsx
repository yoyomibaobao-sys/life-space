"use client";

import {
  cloneElement,
  isValidElement,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from "react";

export type ArchiveSourceOption<T extends string> = {
  value: T;
  label: string;
  count: number;
};

type Props<T extends string> = {
  options: Array<ArchiveSourceOption<T>>;
  activeValue: T;
  onSelect: (value: T) => void;
  trailingSlot?: ReactNode;
};

export default function ArchiveSourceSwitcher<T extends string>({
  options,
  activeValue,
  onSelect,
  trailingSlot,
}: Props<T>) {
  const trailing = isValidElement(trailingSlot)
    ? cloneElement(
        trailingSlot as ReactElement<{ style?: CSSProperties }>,
        {
          style: {
            ...(trailingSlot.props as { style?: CSSProperties }).style,
            border: "1px solid #4f844b",
            background: "#4f844b",
            color: "#fff",
            fontWeight: 600,
            fontSize: 14,
            marginLeft: 8,
            padding: "0 8px",
            minWidth: 0,
            whiteSpace: "nowrap",
            boxShadow: "0 3px 9px rgba(79,132,75,0.16)",
          },
        },
      )
    : trailingSlot;

  return (
    <section style={sourceSwitchStyle(Boolean(trailingSlot), options.length)}>
      {options.map((item) => (
        <button
          key={item.value}
          type="button"
          aria-pressed={activeValue === item.value}
          onClick={() => onSelect(item.value)}
          style={sourceButtonStyle(activeValue === item.value, Boolean(trailingSlot))}
        >
          {item.label} {item.count}
        </button>
      ))}
      {trailing}
    </section>
  );
}

function sourceSwitchStyle(singleLine: boolean, optionCount: number): CSSProperties {
  const compactColumns = Math.max(1, Math.min(optionCount, 3));
  return {
    margin: "0 0 12px",
    display: singleLine ? "grid" : "flex",
    gridTemplateColumns: singleLine
      ? `repeat(${compactColumns}, minmax(0, 1fr)) auto`
      : undefined,
    alignItems: "center",
    gap: singleLine ? 6 : 8,
    flexWrap: singleLine ? "nowrap" : "wrap",
  };
}

function sourceButtonStyle(active: boolean, compact: boolean): CSSProperties {
  return {
    minHeight: 34,
    padding: compact ? "0 4px" : "0 12px",
    minWidth: 0,
    borderRadius: 999,
    border: active ? "1px solid #9fc796" : "1px solid #dfe7d9",
    background: active ? "#eef7e8" : "#fff",
    color: active ? "#2f6a2c" : "#5d6957",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    whiteSpace: "nowrap",
    flexShrink: 0,
  };
}
