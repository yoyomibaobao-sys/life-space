import Link from "next/link";

type Props = {
  username: string;
  onOpenCard: () => void;
};

export default function UserSpaceHeader({ username, onOpenCard }: Props) {
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
          {username ? `${username} · 空间` : "用户空间"}
        </h1>

        <button
          type="button"
          onClick={onOpenCard}
          style={{
            border: "1px solid #dce8d8",
            background: "#f5faf3",
            color: "#4f7b45",
            borderRadius: 999,
            padding: "4px 10px",
            cursor: "pointer",
            fontSize: 13,
          }}
        >
          名片
        </button>
      </div>

      <Link
        href="/discover"
        style={{
          color: "#6b7b66",
          fontSize: 14,
          textDecoration: "none",
        }}
      >
        去发现 →
      </Link>
    </section>
  );
}
