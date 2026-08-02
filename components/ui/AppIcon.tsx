import type { CSSProperties, ReactNode } from "react";

export type AppIconName =
  | "archive"
  | "arrow-left"
  | "arrow-right"
  | "bell"
  | "bookmark"
  | "calendar"
  | "camera"
  | "check"
  | "chevron-down"
  | "chevron-left"
  | "chevron-right"
  | "chevron-up"
  | "clock"
  | "close"
  | "cloud"
  | "cloud-off"
  | "comment"
  | "download"
  | "edit"
  | "eye"
  | "eye-off"
  | "filter"
  | "fish"
  | "flower"
  | "globe"
  | "heart"
  | "home"
  | "info"
  | "leaf"
  | "list"
  | "lock"
  | "map-pin"
  | "menu"
  | "more-horizontal"
  | "pause"
  | "photo"
  | "play"
  | "plus"
  | "puzzle"
  | "refresh"
  | "search"
  | "share"
  | "sprout"
  | "star"
  | "tools"
  | "trash"
  | "unlock"
  | "upload"
  | "user"
  | "user-plus"
  | "warning";

type Props = {
  name: AppIconName;
  size?: number;
  strokeWidth?: number;
  title?: string;
  className?: string;
  style?: CSSProperties;
};

export default function AppIcon({
  name,
  size = 18,
  strokeWidth = 1.9,
  title,
  className,
  style,
}: Props) {
  const labelled = Boolean(title);

  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={labelled ? undefined : true}
      aria-label={title || undefined}
      role={labelled ? "img" : undefined}
      focusable="false"
      className={className}
      style={{ display: "inline-block", flexShrink: 0, verticalAlign: "-0.16em", ...style }}
    >
      {title ? <title>{title}</title> : null}
      {renderIcon(name)}
    </svg>
  );
}

function renderIcon(name: AppIconName): ReactNode {
  switch (name) {
    case "archive":
      return (
        <>
          <path d="M4 7.5h16v12H4z" />
          <path d="M3 4.5h18v3H3z" />
          <path d="M9 11h6" />
        </>
      );
    case "arrow-left":
      return (
        <>
          <path d="M19 12H5" />
          <path d="m11 18-6-6 6-6" />
        </>
      );
    case "arrow-right":
      return (
        <>
          <path d="M5 12h14" />
          <path d="m13 6 6 6-6 6" />
        </>
      );
    case "bell":
      return (
        <>
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Z" />
          <path d="M10 21h4" />
        </>
      );
    case "bookmark":
      return <path d="M6.5 4.5h11v15l-5.5-3.4-5.5 3.4z" />;
    case "calendar":
      return (
        <>
          <rect x="3.5" y="5.5" width="17" height="15" rx="2.5" />
          <path d="M8 3.5v4M16 3.5v4M3.5 10h17" />
        </>
      );
    case "camera":
      return (
        <>
          <path d="M4 7.5h3l1.5-2h7l1.5 2h3v11H4z" />
          <circle cx="12" cy="13" r="3.2" />
        </>
      );
    case "check":
      return <path d="m5 12.5 4.2 4.2L19 7" />;
    case "chevron-down":
      return <path d="m6 9 6 6 6-6" />;
    case "chevron-left":
      return <path d="m15 18-6-6 6-6" />;
    case "chevron-right":
      return <path d="m9 6 6 6-6 6" />;
    case "chevron-up":
      return <path d="m6 15 6-6 6 6" />;
    case "clock":
      return (
        <>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 7.5V12l3 2" />
        </>
      );
    case "close":
      return <path d="M6 6l12 12M18 6 6 18" />;
    case "cloud":
      return <path d="M17.5 18H8a5 5 0 1 1 .7-9.95A6 6 0 0 1 20 10.5a3.75 3.75 0 0 1-2.5 7.5Z" />;
    case "cloud-off":
      return (
        <>
          <path d="M17.5 18H8a5 5 0 0 1-3.9-8.13M8.7 8.05A6 6 0 0 1 20 10.5a3.75 3.75 0 0 1-.45 1.79" />
          <path d="M4 4l16 16" />
        </>
      );
    case "comment":
      return <path d="M5 5.5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-8l-5 3v-3H5a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2Z" />;
    case "download":
      return (
        <>
          <path d="M12 4v11" />
          <path d="m7.5 11 4.5 4.5 4.5-4.5" />
          <path d="M5 20h14" />
        </>
      );
    case "edit":
      return (
        <>
          <path d="m4 16-.5 4.5L8 20l10.5-10.5-4-4Z" />
          <path d="m13.5 6.5 4 4" />
        </>
      );
    case "eye":
      return (
        <>
          <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
          <circle cx="12" cy="12" r="2.5" />
        </>
      );
    case "eye-off":
      return (
        <>
          <path d="M4.3 4.3 19.7 19.7" />
          <path d="M9.8 6.25A10.2 10.2 0 0 1 12 6c6 0 9.5 6 9.5 6a15 15 0 0 1-2.25 3.1M6.2 7.2C3.8 9 2.5 12 2.5 12s3.5 6 9.5 6a9.8 9.8 0 0 0 3-.45" />
          <path d="M10.25 10.25a2.5 2.5 0 0 0 3.5 3.5" />
        </>
      );
    case "filter":
      return <path d="M4 6h16M7 12h10M10 18h4" />;
    case "fish":
      return (
        <>
          <path d="M3 12c3.3-4.2 7.3-6.1 11.5-4.4 2 .8 3.7 2.4 5.5 4.4-1.8 2-3.5 3.6-5.5 4.4C10.3 18.1 6.3 16.2 3 12Z" />
          <path d="m3 12-2.2-3v6Z" />
          <circle cx="15.5" cy="10.5" r=".7" fill="currentColor" stroke="none" />
        </>
      );
    case "flower":
      return (
        <>
          <circle cx="12" cy="12" r="2.1" />
          <path d="M12 9.9c-2.7 0-4.2-1.2-4.2-3a2.4 2.4 0 0 1 4.2-1.5 2.4 2.4 0 0 1 4.2 1.5c0 1.8-1.5 3-4.2 3ZM14.1 12c0-2.7 1.2-4.2 3-4.2a2.4 2.4 0 0 1 1.5 4.2 2.4 2.4 0 0 1-1.5 4.2c-1.8 0-3-1.5-3-4.2ZM12 14.1c2.7 0 4.2 1.2 4.2 3a2.4 2.4 0 0 1-4.2 1.5 2.4 2.4 0 0 1-4.2-1.5c0-1.8 1.5-3 4.2-3ZM9.9 12c0 2.7-1.2 4.2-3 4.2A2.4 2.4 0 0 1 5.4 12a2.4 2.4 0 0 1 1.5-4.2c1.8 0 3 1.5 3 4.2Z" />
        </>
      );
    case "globe":
      return (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M3.5 12h17M12 3c2.3 2.5 3.5 5.5 3.5 9s-1.2 6.5-3.5 9c-2.3-2.5-3.5-5.5-3.5-9S9.7 5.5 12 3Z" />
        </>
      );
    case "heart":
      return <path d="M20.5 9.5c0 5.2-8.5 10-8.5 10s-8.5-4.8-8.5-10A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 8.5 2.5Z" />;
    case "home":
      return (
        <>
          <path d="m3 11 9-7 9 7" />
          <path d="M5.5 10v10h13V10M9.5 20v-6h5v6" />
        </>
      );
    case "info":
      return (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 10.5V17" />
          <circle cx="12" cy="7.2" r=".8" fill="currentColor" stroke="none" />
        </>
      );
    case "leaf":
      return (
        <>
          <path d="M19.5 4.5C12 4.5 6.5 8 6.5 13.1c0 3.2 2.4 5.4 5.5 5.4 5.1 0 7.5-5.4 7.5-14Z" />
          <path d="M4.5 20c2.2-4.9 6.4-8.4 11.7-10.7" />
        </>
      );
    case "list":
      return (
        <>
          <path d="M8 6h12M8 12h12M8 18h12" />
          <circle cx="4" cy="6" r=".8" fill="currentColor" stroke="none" />
          <circle cx="4" cy="12" r=".8" fill="currentColor" stroke="none" />
          <circle cx="4" cy="18" r=".8" fill="currentColor" stroke="none" />
        </>
      );
    case "lock":
      return (
        <>
          <rect x="5" y="10" width="14" height="10" rx="2" />
          <path d="M8.5 10V7.5a3.5 3.5 0 0 1 7 0V10" />
        </>
      );
    case "map-pin":
      return (
        <>
          <path d="M20 10c0 5.8-8 11-8 11S4 15.8 4 10a8 8 0 1 1 16 0Z" />
          <circle cx="12" cy="10" r="2.5" />
        </>
      );
    case "menu":
      return <path d="M4 7h16M4 12h16M4 17h16" />;
    case "more-horizontal":
      return (
        <>
          <circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" />
          <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
          <circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" />
        </>
      );
    case "pause":
      return <path d="M8 5v14M16 5v14" />;
    case "photo":
      return (
        <>
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <circle cx="8.5" cy="9" r="1.5" />
          <path d="m4.5 17 4.5-4 3.5 3 2.5-2.5 4.5 3.5" />
        </>
      );
    case "play":
      return <path d="m8 5 11 7-11 7Z" />;
    case "plus":
      return <path d="M12 5v14M5 12h14" />;
    case "puzzle":
      return <path d="M9 4h3a2.5 2.5 0 1 1 4.8 1H20v5h-2a2.5 2.5 0 1 0 0 5h2v5h-5v-2a2.5 2.5 0 1 0-5 0v2H4v-6h2a2.5 2.5 0 1 0 0-5H4V4h5Z" />;
    case "refresh":
      return (
        <>
          <path d="M20 7v5h-5" />
          <path d="M18.2 16a8 8 0 1 1 .8-8l1 4" />
        </>
      );
    case "search":
      return (
        <>
          <circle cx="10.5" cy="10.5" r="6.5" />
          <path d="m15.5 15.5 5 5" />
        </>
      );
    case "share":
      return (
        <>
          <circle cx="18" cy="5" r="2" />
          <circle cx="6" cy="12" r="2" />
          <circle cx="18" cy="19" r="2" />
          <path d="m8 11 8-5M8 13l8 5" />
        </>
      );
    case "sprout":
      return (
        <>
          <path d="M12 21V10" />
          <path d="M12 13c-4.2 0-7-2.5-7-6 4.2 0 7 2.5 7 6ZM12 10c0-4 2.6-6.5 7-6.5 0 4-2.6 6.5-7 6.5Z" />
          <path d="M7 21h10" />
        </>
      );
    case "star":
      return <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.6l6.2-.9Z" />;
    case "tools":
      return (
        <>
          <path d="M14.5 6.5a4.5 4.5 0 0 0-5.8 5.8L3.8 17.2a2.1 2.1 0 1 0 3 3l4.9-4.9a4.5 4.5 0 0 0 5.8-5.8l-2.8 2.8-3-3Z" />
          <path d="m15 15 5 5" />
        </>
      );
    case "trash":
      return (
        <>
          <path d="M4 7h16M9 4h6l1 3H8l1-3ZM7 7l1 13h8l1-13M10 11v5M14 11v5" />
        </>
      );
    case "unlock":
      return (
        <>
          <rect x="5" y="10" width="14" height="10" rx="2" />
          <path d="M8.5 10V7.5a3.5 3.5 0 0 1 6.7-1.4" />
        </>
      );
    case "upload":
      return (
        <>
          <path d="M12 20V9" />
          <path d="m7.5 13.5 4.5-4.5 4.5 4.5" />
          <path d="M5 4h14" />
        </>
      );
    case "user":
      return (
        <>
          <circle cx="12" cy="8" r="4" />
          <path d="M4.5 20c.8-4 3.5-6 7.5-6s6.7 2 7.5 6" />
        </>
      );
    case "user-plus":
      return (
        <>
          <circle cx="9" cy="8" r="3.5" />
          <path d="M3 20c.7-4 2.8-6 6-6 1.7 0 3.1.5 4.1 1.4M17 11v6M14 14h6" />
        </>
      );
    case "warning":
      return (
        <>
          <path d="M12 3 2.8 20h18.4Z" />
          <path d="M12 9v5" />
          <circle cx="12" cy="17" r=".8" fill="currentColor" stroke="none" />
        </>
      );
  }
}
