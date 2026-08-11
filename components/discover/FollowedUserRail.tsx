"use client";

import { useEffect, useRef } from "react";
import UserAvatar from "@/components/social/UserAvatar";
import type { FollowedUserSummary } from "@/lib/followed-users";
import styles from "@/components/discover/FollowedProjects.module.css";
import { useLanguage } from "@/lib/i18n/useLanguage";

type Props = {
  users: FollowedUserSummary[];
  selectedUserId: string | null;
  onChange: (userId: string | null) => void;
};

export function FollowedUserRail({ users, selectedUserId, onChange }: Props) {
  const { language, t } = useLanguage();
  const buttonRefs = useRef(new Map<string, HTMLButtonElement>());
  const selectedKey = selectedUserId || "all";

  useEffect(() => {
    buttonRefs.current.get(selectedKey)?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "nearest",
    });
  }, [selectedKey]);

  function setButtonRef(key: string, node: HTMLButtonElement | null) {
    if (node) buttonRefs.current.set(key, node);
    else buttonRefs.current.delete(key);
  }

  return (
    <section className={styles.railSection}>
      <div className={styles.rail} aria-label={t.discover.followed_users}>
        <button
          ref={(node) => setButtonRef("all", node)}
          type="button"
          aria-pressed={selectedUserId === null}
          className={`${styles.userButton} ${
            selectedUserId === null ? styles.selected : ""
          }`}
          onClick={() => onChange(null)}
        >
          <span className={styles.avatarFrame} aria-hidden="true">
            <span className={styles.allAvatar}>{language === "en" ? "A" : "全"}</span>
          </span>
          <span className={styles.userName}>{t.discover.filters.all}</span>
        </button>

        {users.map((user) => (
          <button
            ref={(node) => setButtonRef(user.id, node)}
            key={user.id}
            type="button"
            aria-pressed={selectedUserId === user.id}
            className={`${styles.userButton} ${
              selectedUserId === user.id ? styles.selected : ""
            }`}
            onClick={() => onChange(user.id)}
            title={user.displayName}
          >
            <span className={styles.avatarFrame} aria-hidden="true">
              <UserAvatar
                avatarUrl={user.avatarUrl}
                size={34}
                iconSize={16}
              />
            </span>
            <span className={styles.userName}>{user.displayName}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
