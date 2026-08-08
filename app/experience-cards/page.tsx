"use client";

import Link from "next/link";
import { useEffect, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import ConfirmDialog from "@/components/ConfirmDialog";
import ExperienceCardListCard from "@/components/experience-card/ExperienceCardListCard";
import UiIcon from "@/components/ui/UiIcon";
import { showToast } from "@/components/Toast";
import {
  deleteExperienceCard,
  hydrateExperienceCardListItems,
  unpublishExperienceCard,
} from "@/lib/experience-cards";
import type {
  ExperienceCardListItem,
  ExperienceCardRow,
} from "@/lib/experience-card-types";
import { supabase } from "@/lib/supabase";

type CardListItem = ExperienceCardListItem & {
  isPubliclyAvailable: boolean;
};

export default function MyExperienceCardsPage() {
  const router = useRouter();
  const [items, setItems] = useState<CardListItem[]>([]);
  const [savedItems, setSavedItems] = useState<ExperienceCardListItem[]>([]);
  const [activeTab, setActiveTab] = useState<"mine" | "saved">("mine");
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

    const [{ data: cards }, { data: bookmarks }] = await Promise.all([
      supabase
        .from("experience_cards")
        .select("*")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false })
        .order("id", { ascending: false }),
      supabase
        .from("experience_card_bookmarks")
        .select("card_id, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
    ]);

    const rows = (cards || []) as ExperienceCardRow[];
    const [hydratedRows, publicStates] = await Promise.all([
      hydrateExperienceCardListItems(rows),
      Promise.all(rows.map(async (row) => {
        const { data } = await supabase.rpc("is_experience_card_public", {
          p_card_id: row.id,
        });
        return Boolean(Array.isArray(data) ? data[0] : data);
      })),
    ]);

    setItems(
      hydratedRows.map((row, index) => ({
        ...row,
        isPubliclyAvailable: publicStates[index],
      }))
    );
    const bookmarkedIds = (bookmarks || []).map((row) => row.card_id);
    if (bookmarkedIds.length > 0) {
      const { data: savedCards } = await supabase
        .from("experience_cards")
        .select("*")
        .in("id", bookmarkedIds)
        .eq("status", "published");
      const savedById = new Map(
        (await hydrateExperienceCardListItems(
          (savedCards || []) as ExperienceCardRow[]
        )).map((item) => [item.id, item])
      );
      setSavedItems(
        bookmarkedIds
          .map((cardId) => savedById.get(cardId))
          .filter((item): item is ExperienceCardListItem => Boolean(item))
      );
    } else {
      setSavedItems([]);
    }
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

  async function handleRemoveBookmark(item: ExperienceCardListItem) {
    setBusyId(item.id);
    const { error } = await supabase
      .from("experience_card_bookmarks")
      .delete()
      .eq("card_id", item.id);
    if (error) {
      showToast("取消收藏失败");
    } else {
      showToast("已取消收藏");
      setSavedItems((current) => current.filter((card) => card.id !== item.id));
    }
    setBusyId(null);
  }

  const visibleItems = activeTab === "mine" ? items : savedItems;

  return (
    <main style={pageStyle}>
      <header style={headerStyle}>
        <div>
          <Link href="/archive" style={backLinkStyle}>
            <UiIcon name="arrow-left" size={15} /> 我的项目
          </Link>
          <h1 style={titleStyle}>我的经验卡</h1>
          <p style={mutedStyle}>
            在同一处查看、编辑和管理经验时间线。
          </p>
        </div>
      </header>

      <section style={guideStyle}>
        新建经验卡请先进入一个云端项目，选择“生成经验卡”。每张卡选择3～12条记录，系统按原始日期排列。
      </section>

      <nav style={tabRowStyle} aria-label="经验卡目录">
        <button type="button" aria-pressed={activeTab === "mine"} style={tabButtonStyle(activeTab === "mine")} onClick={() => setActiveTab("mine")}>
          我的经验卡（{items.length}）
        </button>
        <button type="button" aria-pressed={activeTab === "saved"} style={tabButtonStyle(activeTab === "saved")} onClick={() => setActiveTab("saved")}>
          我的收藏（{savedItems.length}）
        </button>
      </nav>

      {loading ? (
        <section style={emptyStyle}>正在读取...</section>
      ) : visibleItems.length === 0 ? (
        <section style={emptyStyle}>
          <h2 style={emptyTitleStyle}>
            {activeTab === "mine" ? "还没有经验卡" : "还没有收藏经验卡"}
          </h2>
          <p style={mutedStyle}>
            {activeTab === "mine"
              ? "当一个项目已经有起点、过程和结果记录后，就可以把它们串成一张经验卡。"
              : "在公开经验卡详情中选择“收藏”，会保存到这里。"}
          </p>
          {activeTab === "mine" ? (
            <Link href="/archive" style={primaryLinkStyle}>选择项目</Link>
          ) : null}
        </section>
      ) : (
        <section style={listStyle}>
          {visibleItems.map((item) => (
            <ExperienceCardListCard
              key={item.id}
              item={item}
              dateValue={activeTab === "mine" ? item.updated_at : item.published_at}
              showAuthor
              status={
                activeTab === "saved" ? (
                  <span style={statusStyle(true)}>已收藏</span>
                ) : (
                  <>
                  <span style={statusStyle((item as CardListItem).isPubliclyAvailable)}>
                    {(item as CardListItem).isPubliclyAvailable
                      ? "已公开"
                      : item.status === "published"
                        ? "公开已暂停"
                        : "私密草稿"}
                  </span>
                  <span>被收藏 {item.bookmarkCount}</span>
                  </>
                )
              }
              actions={
                activeTab === "saved" ? (
                  <>
                    <Link href={`/experience-cards/${item.id}`} style={primaryLinkStyle}>打开</Link>
                    <button
                      type="button"
                      disabled={busyId === item.id}
                      onClick={() => void handleRemoveBookmark(item)}
                      style={secondaryButtonStyle}
                    >
                      取消收藏
                    </button>
                  </>
                ) : (
                <>
                <Link
                  href={`/experience-cards/${item.id}`}
                  style={primaryLinkStyle}
                >
                  打开并管理
                </Link>
                {item.status === "published" ? (
                  <button
                    type="button"
                    disabled={busyId === item.id}
                    onClick={() => void handleUnpublish(item as CardListItem)}
                    style={secondaryButtonStyle}
                  >
                    取消公开
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={busyId === item.id}
                  onClick={() => setDeleteTarget(item as CardListItem)}
                  style={dangerButtonStyle}
                >
                  删除
                </button>
                </>
                )
              }
            />
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

const tabRowStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  marginBottom: 14,
  overflowX: "auto",
};

function tabButtonStyle(active: boolean): CSSProperties {
  return {
    minHeight: 38,
    padding: "7px 12px",
    borderRadius: 999,
    border: active ? "1px solid #9ebb96" : "1px solid #dce5d8",
    background: active ? "#edf6e9" : "#fff",
    color: active ? "#3f653a" : "#667362",
    fontSize: 13,
    fontWeight: 750,
    whiteSpace: "nowrap",
    cursor: "pointer",
  };
}

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
