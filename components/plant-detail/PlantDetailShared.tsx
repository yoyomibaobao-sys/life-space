import type { ReactNode } from "react";

export function TextBlock({ text }: { text?: string | null }) {
  if (!text || !text.trim()) return null;

  return (
    <div
      style={{
        color: "#555",
        fontSize: 15,
        lineHeight: 1.95,
        whiteSpace: "pre-line",
      }}
    >
      {text}
    </div>
  );
}

export function Card({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: string | null;
}) {
  if (value === null || value === undefined || value === "" || value === false) {
    return null;
  }

  return (
    <div
      style={{
        padding: 12,
        border: "1px solid #eee",
        borderRadius: 14,
        background: "#fafafa",
      }}
    >
      <div
        style={{
          fontSize: 14,
          fontWeight: 700,
          color: "#555",
          marginBottom: 8,
          lineHeight: 1.5,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 17, fontWeight: 700, color: "#2f2f2f" }}>{value}</div>
      {hint && <div style={{ marginTop: 4, color: "#999", fontSize: 12 }}>{hint}</div>}
    </div>
  );
}

export function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  if (!children) return null;

  return (
    <section
      style={{
        marginTop: 16,
        padding: 20,
        border: "1px solid #eee",
        borderRadius: 18,
        background: "#fff",
      }}
    >
      <h2
        style={{
          margin: "0 0 14px",
          fontSize: 21,
          fontWeight: 700,
          color: "#222",
        }}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

export function TempCard({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  if (!value) return null;
  return <Card label={label} value={value} />;
}
