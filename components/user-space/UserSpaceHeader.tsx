import Link from "next/link";
import UiIcon from "@/components/ui/UiIcon";
import { useLanguage } from "@/lib/i18n/useLanguage";

type Props = {
  userId: string;
  username: string;
};

export default function UserSpaceHeader({ userId, username }: Props) {
  const { t } = useLanguage();
  return (
    <section
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 16,
        marginBottom: 18,
        flexWrap: "wrap",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <h1
          style={{
            margin: 0,
            fontSize: 22,
            color: "#1f2a1f",
            fontWeight: 650,
          }}
        >
          {username ? `${username}${t.profile.space.title_suffix}` : t.profile.space.user_space}
        </h1>

        <Link
          href={`/user/${userId}/profile`}
          style={{
            border: "1px solid #dce8d8",
            background: "#f5faf3",
            color: "#4f7b45",
            borderRadius: 999,
            padding: "4px 10px",
            cursor: "pointer",
            fontSize: 13,
            textDecoration: "none",
          }}
        >
          {t.profile.space.user_profile}
        </Link>
      </div>

      <Link
        href="/discover"
        style={{
          color: "#6b7b66",
          fontSize: 14,
          textDecoration: "none",
        }}
      >
        <UiIcon name="arrow-left" size={15} /> {t.profile.space.back_to_discover}
      </Link>
    </section>
  );
}
