"use client";

import Link from "next/link";
import { useEffect, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import ConfirmDialog from "@/components/ConfirmDialog";
import { showToast } from "@/components/Toast";
import {
  deleteExperienceCard,
  formatExperienceCardDate,
  unpublishExperienceCard,
} from "@/lib/experience-cards";
import type { ExperienceCardRow } from "@/lib/experience-card-types";
import { supabase } from "@/lib/supabase";
import AppIcon from "@/components/ui/AppIcon";

type CardListItem = ExperienceCardRow & {
  archiveTitle: string;
  isPubliclyAvailable: boolean;
};

export default function MyExperienceCardsPage() {
  const router = useRouter();
  const [items, setItems] = useState<CardListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CardListItem | null>(null);

  async function load() {
    setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.replace("/login");
      return;
    }

    const { data: cards } = await supabase
      .from("experience_cards")
      .select("*")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .order("id", { ascending: false });

    const rows = (cards || []) as ExperienceCardRow[];
    const archiveIds = Array.from(new Set(rows.map((row) => row.archive_id)));
    const archiveMap = new Map<string, string>();

    if (archiveIds.length > 0) {
      const { data: archives } = await supabase
        .from("archives")
        .select("id, title")
        .in("id", archiveIds);
      (archives || []).forEach((archive) => {
        archiveMap.set(archive.id, archive.title);
      });
    }

    const publicStates = await Promise.all(
      rows.map(async (row) => {
        const { data } = await supabase.rpc("is_experience_card_public", {
          p_card_id: row.id,
        });
        return Boolean(Array.isArray(data) ? data[0] : data);
      })
    );

    setItems(
      rows.map((row, index) => ({
        ...row,
        archiveTitle: archiveMap.get(row.archive_id) || "来源项目已删除",
        isPubliclyAvailable: publicStates[index],
      }))
    );
    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleUnpublish(item: CardListItem) {
    setBusyId(item.id);
    try {
      await unpublishExperienceCard(item.id);
      showToast("经验卡已取消公开");
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setBusyId(deleteTarget.id);
    try {
      await deleteExperienceCard(deleteTarget.id);
      showToast("经验卡已删除，原记录不受影响");
      setDeleteTarget(null);
      await load();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main style={pageStyle}>
      <header style={headerStyle}>
        <div>
          <Link href="/archive" style={backLinkStyle}>
            <AppIcon name="arrow-left" size={14} /> 我的项目
          </Link>
          <h1 style={titleStyle}>我的经验卡</h1>
          <p style={mutedStyle}>
            管理由原始项目记录组成的草稿和公开时间线。
          </p>
        </div>
      </header>

      <section style={guideStyle}>
        新建经验卡请先进入一个云端项目，选择“生成经验卡”。每张卡选择3～12条记录，系统按原始日期排列。
      </section>

      {loading ? (
        <section style={emptyStyle}>正在读取...</section>
      ) : items.length === 0 ? (
        <section style={emptyStyle}>
          <h2 style={emptyTitleStyle}>还没有经验卡</h2>
          <p style={mutedStyle}>
            当一个项目已经有起点、过程和结果记录后，就可以把它们串成一张经验卡。
          </p>
          <Link href="/archive" style={primaryLinkStyle}>
            选择项目
          </Link>
        </section>
      ) : (
        <section style={listStyle}>
          {items.map((item) => (
            <article key={item.id} style={cardStyle}>
              <div style={cardMainStyle}>
                <div style={statusRowStyle}>
                  <span style={statusStyle(item.isPubliclyAvailable)}>
                    {item.isPubliclyAvailable
                      ? "已公开"
                      : item.status === "published"
                        ? "公开已暂停"
                        : "私密草稿"}
                  </span>
                  <span style={dateStyle}>
                    更新于 {formatExperienceCardDate(item.updated_at)}
                  </span>
                </div>
                <h2 style={cardTitleStyle}>{item.title}</h2>
                <p style={mutedStyle}>
                  {item.archiveTitle} · {item.source_record_count}条来源记录
                </p>
              </div>

              <div style={actionRowStyle}>
                <Link
                  href={`/experience-cards/${item.id}`}
                  style={primaryLinkStyle}
                >
                  查看
                </Link>
                <Link
                  href={`/experience-cards/${item.id}/edit`}
                  style={secondaryLinkStyle}
                >
                  修改
                </Link>
                {item.status === "published" ? (
                  <button
                    type="button"
                    disabled={busyId === item.id}
                    onClick={() => void handleUnpublish(item)}
                    style={secondaryButtonStyle}
                  >
                    取消公开
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={busyId === item.id}
                  onClick={() => setDeleteTarget(item)}
                  style={dangerButtonStyle}
                >
                  删除
                </button>
              </div>
            </article>
          ))}
        </section>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="删除经验卡"
        message="只删除经验卡及其引用关系，原项目、原记录和照片不会删除。"
        confirmText={busyId ? "删除中..." : "确认删除"}
        cancelText="取消"
        danger
        confirmDisabled={Boolean(busyId)}
        cancelDisabled={Boolean(busyId)}
        onClose={() => {
          if (!busyId) setDeleteTarget(null);
        }}
        onConfirm={handleDelete}
      />
    </main>
  );
}

const pageStyle: CSSProperties = {
  maxWidth: 820,
  margin: "0 auto",
  padding: "24px 16px 70px",
  color: "#283428",
};

const headerStyle: CSSProperties = {
  marginBottom: 16,
};

const backLinkStyle: CSSProperties = {
  color: "#6c7869",
  textDecoration: "none",
  fontSize: 14,
};

const titleStyle: CSSProperties = {
  margin: "8px 0 5px",
  fontSize: 29,
};

const mutedStyle: CSSProperties = {
  margin: 0,
  color: "#738071",
  fontSize: 14,
  lineHeight: 1.65,
};

const guideStyle: CSSProperties = {
  padding: 14,
  marginBottom: 14,
  borderRadius: 14,
  background: "#f3f7f0",
  border: "1px solid #dfe8db",
  color: "#586d54",
  fontSize: 14,
  lineHeight: 1.7,
};

const listStyle: CSSProperties = {
  display: "grid",
  gap: 11,
};

const cardStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 16,
  flexWrap: "wrap",
  padding: 16,
  border: "1px solid #e0e8dd",
  borderRadius: 17,
  background: "#fff",
};

const cardMainStyle: CSSProperties = {
  minWidth: 0,
  flex: "1 1 280px",
};

const statusRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 9,
  flexWrap: "wrap",
};

function statusStyle(isPublic: boolean): CSSProperties {
  return {
    padding: "4px 9px",
    borderRadius: 999,
    background: isPublic ? "#edf6e9" : "#f3f3ef",
    color: isPublic ? "#4d7348" : "#72766e",
    fontSize: 11,
    fontWeight: 800,
  };
}

const dateStyle: CSSProperties = {
  color: "#8a9387",
  fontSize: 12,
};

const cardTitleStyle: CSSProperties = {
  margin: "8px 0 5px",
  fontSize: 19,
  lineHeight: 1.35,
};

const actionRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 7,
  flexWrap: "wrap",
};

const baseActionStyle: CSSProperties = {
  minHeight: 38,
  padding: "7px 12px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 800,
};

const primaryLinkStyle: CSSProperties = {
  ...baseActionStyle,
  display: "inline-flex",
  alignItems: "center",
  border: "1px solid #64885e",
  background: "#64885e",
  color: "#fff",
  textDecoration: "none",
};

const secondaryLinkStyle: CSSProperties = {
  ...baseActionStyle,
  display: "inline-flex",
  alignItems: "center",
  border: "1px solid #d4dfd0",
  background: "#fff",
  color: "#50604d",
  textDecoration: "none",
};

const secondaryButtonStyle: CSSProperties = {
  ...baseActionStyle,
  border: "1px solid #d4dfd0",
  background: "#fff",
  color: "#50604d",
  cursor: "pointer",
};

const dangerButtonStyle: CSSProperties = {
  ...secondaryButtonStyle,
  borderColor: "#ecd1ce",
  color: "#b1534f",
};

const emptyStyle: CSSProperties = {
  padding: 24,
  border: "1px solid #e0e8dd",
  borderRadius: 18,
  background: "#fff",
};

const emptyTitleStyle: CSSProperties = {
  margin: "0 0 7px",
  fontSize: 20,
};
