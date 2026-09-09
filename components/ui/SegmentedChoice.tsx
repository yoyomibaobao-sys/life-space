"use client";
import { useRef, type ReactNode } from "react";
export default function SegmentedChoice<T extends string>({ label, value, options, onChange, disabled = false }: {
  label: string; value: T; options: { value: T; label: ReactNode; disabled?: boolean }[];
  onChange: (value: T) => void; disabled?: boolean;
}) {
  const start = useRef<number | null>(null);
  const suppressClick = useRef(false);
  function select(next: T) { if (!disabled && next !== value && !options.find((o) => o.value === next)?.disabled) onChange(next); }
  return <div role="group" aria-label={label} onPointerDown={(event) => { start.current = event.clientX; suppressClick.current = false; }}
    onPointerUp={(event) => { if (start.current !== null && Math.abs(event.clientX - start.current) > 30 && options.length) { suppressClick.current = true; select(options[event.clientX > start.current ? options.length - 1 : 0].value); } start.current = null; }}
    onPointerCancel={() => { start.current = null; }}
    style={{ display: "flex", gap: 2, padding: 3, borderRadius: 999, background: "#f0f4ed", minWidth: 0, touchAction: "pan-y" }}>
    {options.map((option) => <button type="button" key={option.value} aria-pressed={value === option.value} disabled={disabled || option.disabled} onClick={() => { if (suppressClick.current) { suppressClick.current = false; return; } select(option.value); }}
      style={{ minHeight: 36, padding: "5px 10px", border: 0, borderRadius: 999, font: "inherit", fontSize: 14, fontWeight: 600, whiteSpace: "nowrap", color: value === option.value ? "#fff" : "#63715d", background: value === option.value ? "#4f7b45" : "transparent", opacity: disabled || option.disabled ? .6 : 1 }}>{option.label}</button>)}
  </div>;
}
