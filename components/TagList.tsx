"use client";

import { getBehaviorTagLabel } from "@/lib/tag-labels";
import { supabase } from "@/lib/supabase";
import { showToast } from "@/components/Toast";
import UiIcon from "@/components/ui/UiIcon";
import { useLanguage } from "@/lib/i18n/useLanguage";

import type { CSSProperties } from "react";

type Props = {
  tags?: string[] | null;
  editable?: boolean;
  recordId?: string;
  userTags?: string[]; // 仅用户补充标签可删除
  onChange?: (tag: string, action: "remove") => void;
  containerStyle?: CSSProperties;
  tagStyle?: CSSProperties;
};

export default function TagList({
  tags,
  editable = false,
  recordId,
  userTags = [],
  onChange,
  containerStyle,
  tagStyle,
}: Props) {
  const { language, t } = useLanguage();

  if (!Array.isArray(tags) || tags.length === 0) return null;

  return (
    <div
      style={{
        display: "flex",
        gap: 6,
        flexWrap: "wrap",
        alignItems: "center",
        marginTop: 0,
        ...containerStyle,
      }}
    >
      {tags.map((tag) => {
        const isUserTag = userTags.includes(tag);

        return (
          <span
            key={tag}
            style={{
              fontSize: 12,
              padding: "4px 8px",
              borderRadius: 999,
              border: "1px solid #ddd",
              background: "#fafafa",
              color: "#555",
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              lineHeight: 1.2,
              ...tagStyle,
            }}
          >
            {getBehaviorTagLabel(tag, language)}

            {editable && isUserTag && recordId ? (
              <span
                onClick={async () => {
                  const scrollY = window.scrollY;

                  const { error } = await supabase
                    .from("record_tags")
                    .delete()
                    .eq("record_id", recordId)
                    .eq("tag", tag)
                    .eq("tag_type", "behavior")
                    .eq("source", "user");

                  if (error) {
                    showToast(t.tag_list.delete_failed);
                    return;
                  }

                  onChange?.(tag, "remove");
                  requestAnimationFrame(() => window.scrollTo({ top: scrollY }));
                  showToast(t.tag_list.deleted);
                }}
                style={{
                  cursor: "pointer",
                  fontSize: 12,
                  color: "#999",
                }}
              >
                <UiIcon name="close" size={12} />
              </span>
            ) : null}
          </span>
        );
      })}
    </div>
  );
}
