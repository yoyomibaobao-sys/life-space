"use client";

import { getBehaviorTagLabel } from "@/lib/tag-labels";
import { supabase } from "@/lib/supabase";
import { showToast } from "@/components/Toast";

type Props = {
  tags?: string[] | null;
  editable?: boolean;
  recordId?: string;
  userTags?: string[]; // 仅用户补充标签可删除
  onChange?: (tag: string, action: "remove") => void;
};

export default function TagList({
  tags,
  editable = false,
  recordId,
  userTags = [],
  onChange,
}: Props) {
  if (!Array.isArray(tags) || tags.length === 0) return null;

  return (
    <div
      style={{
        display: "flex",
        gap: 6,
        flexWrap: "wrap",
        marginTop: 6,
      }}
    >
      {tags.map((tag) => {
        const isUserTag = userTags.includes(tag);

        return (
          <span
            key={tag}
            style={{
              fontSize: 12,
              padding: "2px 6px",
              borderRadius: 999,
              border: "1px solid #ddd",
              background: "#fafafa",
              color: "#555",
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            {getBehaviorTagLabel(tag)}

            {editable && isUserTag && recordId && (
              <span
                onClick={async () => {
                  const { error } = await supabase
                    .from("record_tags")
                    .delete()
                    .eq("record_id", recordId)
                    .eq("tag", tag)
                    .eq("tag_type", "behavior")
                    .eq("source", "user");

                  if (error) {
                    showToast("删除标签失败");
                    return;
                  }

                  onChange?.(tag, "remove");
                  showToast("已删除标签");
                }}
                style={{
                  cursor: "pointer",
                  fontSize: 12,
                  color: "#999",
                }}
              >
                ×
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}