import Link from "next/link";

type Props = {
  badge: string;
  title: string;
  description: string;
  primaryHref: string;
  primaryLabel: string;
  secondaryHref: string;
  secondaryLabel: string;
};

export default function ArchivePlantPageHero({
  badge,
  title,
  description,
  primaryHref,
  primaryLabel,
  secondaryHref,
  secondaryLabel,
}: Props) {
  return (
    <section
      style={{
        marginTop: 14,
        padding: 22,
        border: "1px solid #eee",
        borderRadius: 20,
        background: "#fff",
      }}
    >
      <div style={{ color: "#4CAF50", fontSize: 13, marginBottom: 8 }}>
        {badge}
      </div>
      <h1 style={{ margin: 0, fontSize: 28 }}>{title}</h1>
      <p style={{ margin: "10px 0 0", color: "#666", lineHeight: 1.7 }}>
        {description}
      </p>

      <div
        style={{
          marginTop: 14,
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <Link
          href={primaryHref}
          style={{
            padding: "8px 12px",
            borderRadius: 999,
            background: "#4CAF50",
            color: "#fff",
            fontSize: 13,
            fontWeight: 650,
            textDecoration: "none",
          }}
        >
          {primaryLabel}
        </Link>
        <Link
          href={secondaryHref}
          style={{
            padding: "8px 12px",
            borderRadius: 999,
            border: "1px solid #d6ead6",
            color: "#4CAF50",
            fontSize: 13,
            fontWeight: 650,
            textDecoration: "none",
            background: "#fff",
          }}
        >
          {secondaryLabel}
        </Link>
      </div>
    </section>
  );
}
