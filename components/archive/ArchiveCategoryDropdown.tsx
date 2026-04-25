"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  archiveCategoryOptions,
  getArchiveCategoryLabel,
  type ArchiveCategory,
} from "@/lib/archive-categories";
import type { SubTagItem } from "@/lib/archive-page-types";

type Props = {
  value: string;
  subTags: SubTagItem[];
  onChange: (value: string) => void;
};

export default function ArchiveCategoryDropdown({ value, subTags, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!wrapRef.current) return;
      if (wrapRef.current.contains(event.target as Node)) return;
      setOpen(false);
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  const currentLabel = useMemo(() => {
    const subTag = subTags.find((tag) => tag.id === value);
    if (subTag) return subTag.name;
    return getArchiveCategoryLabel(value);
  }, [subTags, value]);

  return (
    <div ref={wrapRef} style={{ position: "relative", display: "inline-flex" }}>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          setOpen((prev) => !prev);
        }}
        style={{
          border: "1px solid #edf0e8",
          borderRadius: 999,
          background: "#fbfcfa",
          color: "#667066",
          fontSize: 12,
          padding: "4px 24px 4px 10px",
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          minHeight: 28,
          lineHeight: 1.15,
          whiteSpace: "nowrap",
        }}
      >
        {currentLabel}
        <span
          style={{
            position: "absolute",
            right: 9,
            top: "50%",
            transform: "translateY(-50%)",
            color: "#999",
            pointerEvents: "none",
            fontSize: 10,
          }}
        >
          ▾
        </span>
      </button>

      {open ? (
        <div
          onClick={(event) => event.stopPropagation()}
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            zIndex: 80,
            minWidth: 220,
            maxWidth: 280,
            maxHeight: 320,
            overflowY: "auto",
            border: "1px solid #e6ebdf",
            borderRadius: 14,
            background: "#fff",
            boxShadow: "0 16px 36px rgba(44, 74, 38, 0.12)",
            padding: 6,
          }}
        >
          {archiveCategoryOptions.map((category) => {
            const categoryTags = subTags.filter((tag) => tag.category === category.value);
            const categorySelected = value === category.value;

            return (
              <div key={category.value} style={{ padding: "1px 0 4px" }}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(category.value);
                    setOpen(false);
                  }}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    border: "none",
                    background: categorySelected ? "#f0f7eb" : "transparent",
                    color: categorySelected ? "#2f6a34" : "#2c3b2c",
                    borderRadius: 10,
                    padding: "7px 10px",
                    cursor: "pointer",
                    fontSize: 14,
                    fontWeight: 700,
                    lineHeight: 1.15,
                  }}
                >
                  {category.label}
                </button>

                {categoryTags.length > 0 ? (
                  <div style={{ marginTop: 1 }}>
                    {categoryTags.map((tag) => {
                      const selected = value === tag.id;
                      return (
                        <button
                          key={tag.id}
                          type="button"
                          onClick={() => {
                            onChange(tag.id);
                            setOpen(false);
                          }}
                          style={{
                            width: "100%",
                            textAlign: "left",
                            border: "none",
                            background: selected ? "#f6faef" : "transparent",
                            color: selected ? "#3b6f3e" : "#667066",
                            borderRadius: 10,
                            padding: "6px 10px 6px 18px",
                            cursor: "pointer",
                            fontSize: 13,
                            fontWeight: 500,
                            lineHeight: 1.15,
                          }}
                        >
                          {tag.name}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
