"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import ConfirmDialog from "@/components/ConfirmDialog";
import { showToast } from "@/components/Toast";
import {
  deleteExperienceCard,
  formatExperienceCardDate,
} from "@/lib/experience-cards";
import type { ExperienceCardRow } from "@/lib/experience-card-types";
import { supabase } from "@/lib/supabase";

type ArchiveExperienceCardsProps = {
  archiveId: string;
  isOwner: boolean;
  onCountChange?: (count: number) => void;
};

type ArchiveExperienceCardItem = ExperienceCardRow & {
  isPubliclyAvailable: boolean;
};

export default function ArchiveExperienceCards({
  archiveId,
  isOwner,
  onCountChange,
}: ArchiveExperienceCardsProps) {
  const [items, setItems] = useState<ArchiveExperienceCardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] =
    useState<ArchiveExperienceCardItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("experience_cards")
      .select("*")
      .eq("archive_id", archiveId)
      .order("updated_at", { ascending: false })
      .order("id", { ascending: false });

    if (error) {
      console.error("load archive experience cards error:", error);
      setItems([]);
      setLoading(false);
      return;
    }

    const rows = (data || []) as ExperienceCardRow[];
    onCountChange?.(rows.length);
    if (!isOwner) {
      setItems(
        rows.map((row) => ({
          ...row,
          isPubliclyAvailable: true,
        }))
      );
      setLoading(false);
      return;
    }

    const publicStates = await Promise.all(
      rows.map(async (row) => {
        const { data: publicData } = await supabase.rpc(
          "is_experience_card_public",
          { p_card_id: row.id }
        );
        return Boolean(
          Array.isArray(publicData) ? publicData[0] : publicData
        );
      })
    );

    setItems(
      rows.map((row, index) => ({
        ...row,
        isPubliclyAvailable: publicStates[index],
      }))
    );
    setLoading(false);
  }, [archiveId, isOwner, onCountChange]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleDelete() {
    if (!deleteTarget || deleting) return;

    setDeleting(true);
    try {
      await deleteExperienceCard(deleteTarget.id);
      showToast("经验卡已删除，原记录不受影响");
      setDeleteTarget(null);
      await load();
    } catch (error) {
      console.error("delete archive experience card error:", error);
      showToast("删除经验卡失败");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <section
      style={sectionStyle}
      aria-label="项目经验卡"
    >
      <div style={headerStyle}>
        <div>
          <div style={eyebrowStyle}>经验卡</div>
          <div style={summaryStyle}>
            {loading ? "正在读取..." : `共 ${items.length} 张`}
          </div>
        </div>
        {isOwner ? (
          <Link
            href={`/experience-cards/new?archiveId=${archiveId}`}
            style={createLinkStyle}
          >
            生成经验卡
          </Link>
        ) : null}
      </div>

      {!loading && items.length === 0 ? (
        <div style={emptyStyle}>
          {isOwner
            ? "还没有经验卡。项目已有起点、过程和结果记录后，可以从这里生成。"
            : "这个项目暂时没有公开经验卡。"}
        </div>
      ) : null}

      {items.length > 0 ? (
        <div style={listStyle}>
          {items.map((item) => (
            <article key={item.id} style={cardStyle}>
              <div style={cardMainStyle}>
                <div style={statusRowStyle}>
                  {isOwner ? (
                    <span style={statusStyle(item.isPubliclyAvailable)}>
                      {item.isPubliclyAvailable
                        ? "已公开"
                        : item.status === "published"
                          ? "公开已暂停"
                          : "私密草稿"}
                    </span>
                  ) : null}
                  <span style={dateStyle}>
                    {formatExperienceCardDate(item.updated_at)}
                  </span>
                </div>
                <div style={titleStyle}>{item.title}</div>
                <div style={metaStyle}>
                  {item.source_record_count} 条来源记录
                </div>
              </div>

              <div style={actionsStyle}>
                <Link
                  href={`/experience-cards/${item.id}`}
                  style={actionLinkStyle}
                >
                  查看
                </Link>
                {isOwner ? (
                  <>
                    <Link
                      href={`/experience-cards/${item.id}/edit`}
                      style={actionLinkStyle}
                    >
                      编辑
                    </Link>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(item)}
                      style={deleteButtonStyle}
                    >
                      删除
                    </button>
                  </>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      ) : null}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="删除经验卡"
        message="只删除经验卡及其引用关系，原项目、原记录和照片不会删除。"
        confirmText={deleting ? "删除中..." : "确认删除"}
        cancelText="取消"
        danger
        confirmDisabled={deleting}
        cancelDisabled={deleting}
        onClose={() => {
          if (!deleting) setDeleteTarget(null);
        }}
        onConfirm={handleDelete}
      />
    </section>
  );
}

const sectionStyle: CSSProperties = {
  marginTop: 12,
  padding: 14,
  border: "1px solid #e3e9df",
  borderRadius: 15,
  background: "#fbfdf9",
};

const headerStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
};

const eyebrowStyle: CSSProperties = {
  color: "#2d3a2c",
  fontSize: 14,
  fontWeight: 800,
};

const summaryStyle: CSSProperties = {
  marginTop: 3,
  color: "#788274",
  fontSize: 12,
};

const createLinkStyle: CSSProperties = {
  flexShrink: 0,
  border: "1px solid #cbdcc5",
  borderRadius: 999,
  background: "#f0f7ed",
  color: "#3d6338",
  padding: "7px 11px",
  fontSize: 12,
  fontWeight: 800,
  textDecoration: "none",
};

const emptyStyle: CSSProperties = {
  marginTop: 12,
  color: "#71806e",
  fontSize: 13,
  lineHeight: 1.65,
};

const listStyle: CSSProperties = {
  display: "grid",
  gap: 8,
  marginTop: 12,
};

const cardStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
  padding: "10px 11px",
  border: "1px solid #e6ebe3",
  borderRadius: 12,
  background: "#fff",
};

const cardMainStyle: CSSProperties = {
  minWidth: 0,
};

const statusRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
};

function statusStyle(isPublic: boolean): CSSProperties {
  return {
    borderRadius: 999,
    background: isPublic ? "#eaf6e7" : "#f2f3ef",
    color: isPublic ? "#396637" : "#697168",
    padding: "2px 7px",
    fontSize: 11,
    fontWeight: 800,
  };
}

const dateStyle: CSSProperties = {
  color: "#8a9387",
  fontSize: 11,
};

const titleStyle: CSSProperties = {
  marginTop: 6,
  color: "#2b382b",
  fontSize: 14,
  fontWeight: 800,
  overflowWrap: "anywhere",
};

const metaStyle: CSSProperties = {
  marginTop: 3,
  color: "#788274",
  fontSize: 12,
};

const actionsStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
  gap: 7,
  flexWrap: "wrap",
  flexShrink: 0,
};

const actionLinkStyle: CSSProperties = {
  border: "1px solid #d9e2d5",
  borderRadius: 999,
  background: "#fff",
  color: "#50624c",
  padding: "6px 9px",
  fontSize: 12,
  fontWeight: 750,
  textDecoration: "none",
};

const deleteButtonStyle: CSSProperties = {
  ...actionLinkStyle,
  border: "1px solid #ecd8d5",
  color: "#bd625c",
  cursor: "pointer",
};
