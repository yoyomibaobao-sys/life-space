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
} from "@/lib/experience-cards";
import type {
  ExperienceCardListItem,
  ExperienceCardRow,
} from "@/lib/experience-card-types";
import { supabase } from "@/lib/supabase";
import { useLanguage } from "@/lib/i18n/useLanguage";

type CardListItem = ExperienceCardListItem & {
  isPubliclyAvailable: boolean;
};

export default function MyExperienceCardsPage() {
  const router = useRouter();
  const { language, t } = useLanguage();
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
      hydrateExperienceCardListItems(rows, language),
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
          (savedCards || []) as ExperienceCardRow[],
          language
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
  }, [language]);

  async function handleDelete() {
    if (!deleteTarget) return;
    setBusyId(deleteTarget.id);
    try {
      await deleteExperienceCard(deleteTarget.id);
      showToast(t.experience.deleted_toast);
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
      showToast(t.experience.remove_bookmark_failed);
    } else {
      showToast(t.experience.bookmark_removed);
      setSavedItems((current) => current.filter((card) => card.id !== item.id));
    }
    setBusyId(null);
  }

  async function copyExperienceCardLink(item: CardListItem) {
    try {
      await navigator.clipboard.writeText(getExperienceCardShareUrl(item.id));
      showToast(t.experience.public_link_copied);
    } catch {
      showToast(t.experience.copy_link_failed);
    }
  }

  async function shareExperienceCard(item: CardListItem) {
    const url = getExperienceCardShareUrl(item.id);

    try {
      if (navigator.share) {
        await navigator.share({ title: item.title, url });
        return;
      }
      await copyExperienceCardLink(item);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      showToast(t.experience.share_failed_use_copy);
    }
  }

  const visibleItems = activeTab === "mine" ? items : savedItems;

  return (
    <main style={pageStyle}>
      <header style={headerStyle}>
        <div>
          <Link href="/archive" style={backLinkStyle}>
            <UiIcon name="arrow-left" size={15} /> {t.experience.my_projects}
          </Link>
          <h1 style={titleStyle}>{t.experience.my_cards}</h1>
        </div>
      </header>

      <nav style={tabRowStyle} aria-label={t.experience.directory_aria}>
        <button type="button" aria-pressed={activeTab === "mine"} style={tabButtonStyle(activeTab === "mine")} onClick={() => setActiveTab("mine")}>
          {t.experience.my_cards}（{items.length}）
        </button>
        <button type="button" aria-pressed={activeTab === "saved"} style={tabButtonStyle(activeTab === "saved")} onClick={() => setActiveTab("saved")}>
          {t.experience.saved_cards}（{savedItems.length}）
        </button>
      </nav>

      {loading ? (
        <section style={emptyStyle}>{t.experience.reading}</section>
      ) : visibleItems.length === 0 ? (
        <section style={emptyStyle}>
          <h2 style={emptyTitleStyle}>
            {activeTab === "mine" ? t.experience.no_cards : t.experience.no_saved_cards}
          </h2>
          <p style={mutedStyle}>
            {activeTab === "mine"
              ? t.experience.no_cards_hint
              : t.experience.no_saved_cards_hint}
          </p>
          {activeTab === "mine" ? (
            <Link href="/archive" style={primaryLinkStyle}>{t.experience.choose_project}</Link>
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
                  <span style={statusStyle(true)}>{t.experience.saved}</span>
                ) : (
                  <>
                  <span style={statusStyle((item as CardListItem).isPubliclyAvailable)}>
                    {(item as CardListItem).isPubliclyAvailable
                      ? t.experience.published
                      : item.status === "published"
                        ? t.experience.publication_paused
                        : t.experience.private}
                  </span>
                  <span>{t.experience.bookmarked_prefix}{item.bookmarkCount}</span>
                  </>
                )
              }
              actions={
                activeTab === "saved" ? (
                  <>
                    <Link href={`/experience-cards/${item.id}`} style={primaryLinkStyle}>{t.experience.open}</Link>
                    <button
                      type="button"
                      disabled={busyId === item.id}
                      onClick={() => void handleRemoveBookmark(item)}
                      style={secondaryButtonStyle}
                    >
                      {t.experience.remove_bookmark}
                    </button>
                  </>
                ) : (
                <>
                <Link
                  href={`/experience-cards/${item.id}`}
                  style={primaryLinkStyle}
                >
                  {t.experience.open_manage}
                </Link>
                {(item as CardListItem).isPubliclyAvailable ? (
                  <>
                    <button
                      type="button"
                      onClick={() => void shareExperienceCard(item as CardListItem)}
                      style={secondaryButtonStyle}
                    >
                      {t.experience.share}
                    </button>
                    <button
                      type="button"
                      onClick={() => void copyExperienceCardLink(item as CardListItem)}
                      style={secondaryButtonStyle}
                    >
                      {t.experience.copy_link}
                    </button>
                  </>
                ) : null}
                <button
                  type="button"
                  disabled={busyId === item.id}
                  onClick={() => setDeleteTarget(item as CardListItem)}
                  style={dangerButtonStyle}
                >
                  {t.experience.delete}
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
        title={t.experience.delete_title}
        message={t.experience.delete_message}
        confirmText={busyId ? t.experience.deleting : t.experience.confirm_delete}
        cancelText={t.experience.cancel}
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

function getExperienceCardShareUrl(cardId: string) {
  return new URL(`/experience-cards/${cardId}`, window.location.origin).toString();
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
