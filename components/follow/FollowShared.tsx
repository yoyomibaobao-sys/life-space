import Link from "next/link";
import React from "react";

export function EmptyState({
  title,
  description,
  actionLabel,
  href,
}: {
  title: string;
  description: string;
  actionLabel: string;
  href: string;
}) {
  return (
    <div style={emptyWrapStyle}>
      <div style={{ fontSize: 18, fontWeight: 650, color: "#2f3a2f" }}>{title}</div>
      <div style={{ marginTop: 8, color: "#7b8578", fontSize: 14 }}>{description}</div>
      <Link href={href} style={emptyActionStyle}>
        {actionLabel}
      </Link>
    </div>
  );
}

export function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div style={summaryCardStyle}>
      <div style={{ fontSize: 12, color: "#7b8578" }}>{label}</div>
      <div style={{ marginTop: 6, fontSize: 28, fontWeight: 700, color: "#263326" }}>{value}</div>
    </div>
  );
}

export function StatusBadge({
  children,
  kind,
}: {
  children: React.ReactNode;
  kind: "help" | "resolved" | "ended" | "normal";
}) {
  const palette = {
    help: { color: "#a65f45", background: "#fff5ee", border: "1px solid #efd8cc" },
    resolved: { color: "#4d7c5b", background: "#f1faf3", border: "1px solid #cfe4d4" },
    ended: { color: "#7f7668", background: "#f6f2ec", border: "1px solid #e4d8ca" },
    normal: { color: "#667066", background: "#f6f7f4", border: "1px solid #e6e8e1" },
  } as const;

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "4px 10px",
        borderRadius: 999,
        fontSize: 12,
        whiteSpace: "nowrap",
        ...palette[kind],
      }}
    >
      {children}
    </span>
  );
}

export const pageStyle: React.CSSProperties = {
  maxWidth: 1120,
  margin: "0 auto",
  padding: "28px 16px 56px",
};

export const heroStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 16,
  flexWrap: "wrap",
  marginBottom: 18,
};

export const eyebrowStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#6f8f62",
  fontWeight: 700,
  letterSpacing: 1.2,
};

export const titleStyle: React.CSSProperties = {
  margin: "8px 0 0",
  fontSize: 30,
  lineHeight: 1.2,
  color: "#243024",
};

export const subtitleStyle: React.CSSProperties = {
  marginTop: 10,
  color: "#6f786e",
  fontSize: 14,
};

export const summaryWrapStyle: React.CSSProperties = {
  display: "flex",
  gap: 12,
  flexWrap: "wrap",
};

export const summaryCardStyle: React.CSSProperties = {
  minWidth: 120,
  background: "#fff",
  border: "1px solid #e8eee2",
  borderRadius: 18,
  padding: "14px 16px",
  boxShadow: "0 6px 18px rgba(40, 60, 40, 0.04)",
};

export const panelStyle: React.CSSProperties = {
  background: "#fff",
  borderRadius: 24,
  border: "1px solid #e9efe3",
  boxShadow: "0 12px 32px rgba(39, 59, 39, 0.06)",
  padding: 16,
};

export const tabRowStyle: React.CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
};

export function tabButtonStyle(active: boolean): React.CSSProperties {
  return {
    border: active ? "1px solid #4f8f46" : "1px solid #dfe8d8",
    background: active ? "#4f8f46" : "#f7faf5",
    color: active ? "#fff" : "#495748",
    borderRadius: 999,
    padding: "9px 14px",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 650,
  };
}

export const toolbarStyle: React.CSSProperties = {
  display: "flex",
  gap: 10,
  marginTop: 14,
  marginBottom: 16,
  flexWrap: "wrap",
};

export const searchInputStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 240,
  borderRadius: 14,
  border: "1px solid #dfe7d8",
  background: "#fafcf8",
  padding: "12px 14px",
  fontSize: 14,
  outline: "none",
};

export const selectStyle: React.CSSProperties = {
  borderRadius: 14,
  border: "1px solid #dfe7d8",
  background: "#fafcf8",
  padding: "12px 14px",
  fontSize: 14,
  color: "#465245",
};

export const listStyle: React.CSSProperties = {
  display: "grid",
  gap: 14,
};

export const cardStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "112px minmax(0, 1fr)",
  gap: 14,
  padding: 14,
  border: "1px solid #ebf0e7",
  borderRadius: 20,
  background: "#fff",
};

export const userCardStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "72px minmax(0, 1fr)",
  gap: 14,
  padding: 14,
  border: "1px solid #ebf0e7",
  borderRadius: 20,
  background: "#fff",
};

export const coverStyle: React.CSSProperties = {
  width: 112,
  height: 112,
  borderRadius: 16,
  overflow: "hidden",
  background: "linear-gradient(135deg, #f4f7f1, #eef4ed)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "#9aaa9a",
};

export const coverImageStyle: React.CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
};

export const userAvatarWrapStyle: React.CSSProperties = {
  width: 72,
  height: 72,
};

export const userAvatarStyle: React.CSSProperties = {
  width: "100%",
  height: "100%",
  borderRadius: "50%",
  objectFit: "cover",
};

export const userAvatarFallbackStyle: React.CSSProperties = {
  width: "100%",
  height: "100%",
  borderRadius: "50%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "linear-gradient(135deg, #f0f6eb, #e7f1e1)",
  fontSize: 28,
};

export const cardBodyStyle: React.CSSProperties = {
  minWidth: 0,
};

export const cardTopRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
};

export const lineClampOneStyle: React.CSSProperties = {
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

export const projectTitleStyle: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 700,
  color: "#223022",
};

export const projectSubTitleStyle: React.CSSProperties = {
  fontSize: 15,
  color: "#5f6a60",
};

export const metaLineStyle: React.CSSProperties = {
  marginTop: 8,
  fontSize: 13,
  color: "#6b756c",
};

export const noteLineStyle: React.CSSProperties = {
  marginTop: 10,
  fontSize: 14,
  color: "#3a463b",
  lineHeight: 1.65,
};

export const statsLineStyle: React.CSSProperties = {
  marginTop: 10,
  fontSize: 13,
  color: "#7b8578",
};

export const buttonRowStyle: React.CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  marginTop: 14,
  alignItems: "center",
};

export const primaryButtonStyle: React.CSSProperties = {
  border: "1px solid #4f8f46",
  background: "#4f8f46",
  color: "#fff",
  borderRadius: 12,
  padding: "9px 14px",
  fontSize: 14,
  fontWeight: 650,
  cursor: "pointer",
};

export const ghostButtonStyle: React.CSSProperties = {
  border: "1px solid #d8e2d1",
  background: "#fff",
  color: "#455244",
  borderRadius: 12,
  padding: "9px 14px",
  fontSize: 14,
  fontWeight: 650,
  cursor: "pointer",
};

export const textLinkStyle: React.CSSProperties = {
  color: "#4d7c5b",
  textDecoration: "none",
  fontSize: 14,
  fontWeight: 650,
};

export const emptyWrapStyle: React.CSSProperties = {
  padding: "32px 16px",
  textAlign: "center",
  color: "#6d766d",
  border: "1px dashed #dbe4d6",
  borderRadius: 18,
  background: "#fafcf8",
};

export const emptyActionStyle: React.CSSProperties = {
  display: "inline-flex",
  marginTop: 14,
  borderRadius: 12,
  padding: "10px 14px",
  textDecoration: "none",
  background: "#4f8f46",
  color: "#fff",
  fontSize: 14,
  fontWeight: 650,
};
