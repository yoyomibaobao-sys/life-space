"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import ConfirmDialog from "@/components/ConfirmDialog";
import ExperienceCardListCard from "@/components/experience-card/ExperienceCardListCard";
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

type ArchiveExperienceCardsProps = {
  archiveId: string;
  isOwner: boolean;
  canCreate?: boolean;
  onCountChange?: (count: number) => void;
};

type ArchiveExperienceCardItem = ExperienceCardListItem & {
  isPubliclyAvailable: boolean;
};

export default function ArchiveExperienceCards({
  archiveId,
  isOwner,
  canCreate = isOwner,
  onCountChange,
}: ArchiveExperienceCardsProps) {
  const { t } = useLanguage();
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
    const hydratedRows = await hydrateExperienceCardListItems(rows);
    if (!isOwner) {
      setItems(
        hydratedRows.map((row) => ({
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
      hydratedRows.map((row, index) => ({
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
      showToast(t.experience.archive_deleted);
      setDeleteTarget(null);
      await load();
    } catch (error) {
      console.error("delete archive experience card error:", error);
      showToast(t.experience.archive_delete_failed);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <section
      style={sectionStyle}
      aria-label={t.experience.archive_panel_aria}
    >
      <div style={headerStyle}>
        <div>
          <div style={eyebrowStyle}>{t.experience.archive_panel_title}</div>
          <div style={summaryStyle}>
            {loading
              ? t.experience.reading_short
              : `${t.experience.count_prefix}${items.length}${t.experience.count_suffix}`}
          </div>
        </div>
        {isOwner && canCreate ? (
          <Link
            href={`/experience-cards/new?archiveId=${archiveId}`}
            style={createLinkStyle}
          >
            {t.experience.create_card}
          </Link>
        ) : null}
      </div>

      {!loading && items.length === 0 ? (
        <div style={emptyStyle}>
          {isOwner
            ? t.experience.empty_owner
            : t.experience.empty_public}
        </div>
      ) : null}

      {items.length > 0 ? (
        <div style={listStyle}>
          {items.map((item) => (
            <ExperienceCardListCard
              key={item.id}
              item={item}
              dateValue={item.updated_at}
              showAuthor
              status={
                isOwner ? (
                  <>
                    <span style={statusStyle(item.isPubliclyAvailable)}>
                      {item.isPubliclyAvailable
                        ? t.experience.published
                        : item.status === "published"
                          ? t.experience.public_paused
                          : t.experience.private_draft}
                    </span>
                    <span style={{ color: "#788274", fontSize: 11 }}>
                      {t.experience.bookmarked_prefix}{item.bookmarkCount}
                    </span>
                  </>
                ) : null
              }
              actions={
                <>
                  <Link
                    href={`/experience-cards/${item.id}`}
                    style={actionLinkStyle}
                  >
                    {isOwner ? t.experience.open_manage : t.experience.open}
                  </Link>
                  {isOwner ? (
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(item)}
                      style={deleteButtonStyle}
                    >
                      {t.experience.delete}
                    </button>
                  ) : null}
                </>
              }
            />
          ))}
        </div>
      ) : null}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={t.experience.delete_title}
        message={t.experience.delete_message}
        confirmText={
          deleting ? t.experience.deleting : t.experience.confirm_delete
        }
        cancelText={t.experience.cancel}
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
