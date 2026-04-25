import Link from "next/link";

type Props = {
  title: string;
  description: string;
  href: string;
  label: string;
};

export default function ArchivePlantEmptyState({ title, description, href, label }: Props) {
  return (
    <section
      style={{
        marginTop: 16,
        padding: 24,
        border: "1px dashed #dcefdc",
        borderRadius: 18,
        background: "#f8fff8",
        color: "#4b6b4b",
      }}
    >
      <div style={{ fontSize: 18, fontWeight: 700, color: "#2f4f2f" }}>
        {title}
      </div>
      <p style={{ margin: "8px 0 14px", lineHeight: 1.7 }}>{description}</p>
      <Link
        href={href}
        style={{
          display: "inline-flex",
          padding: "9px 13px",
          borderRadius: 999,
          background: "#4CAF50",
          color: "#fff",
          fontSize: 13,
          fontWeight: 650,
          textDecoration: "none",
        }}
      >
        {label}
      </Link>
    </section>
  );
}
