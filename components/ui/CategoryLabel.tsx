"use client";
import { useIsNativeApp } from "@/lib/capacitor/useIsNativeApp";
export default function CategoryLabel({ label, discovery = false }: { label: string; discovery?: boolean }) {
  const native = useIsNativeApp();
  const text = native ? ({ 农法设施: "农设", 虫鱼生态: "虫鱼" }[label] || label) : label;
  return discovery && /^[\u4e00-\u9fff]{4}$/.test(text)
    ? <>{text.slice(0, 2)}<br />{text.slice(2)}</> : <>{text}</>;
}
