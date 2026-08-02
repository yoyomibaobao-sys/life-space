import type { CSSProperties, SVGProps } from "react";

export type UiIconName =
  | "arrow-left"
  | "arrow-right"
  | "bell"
  | "bookmark"
  | "bookmark-filled"
  | "calendar"
  | "check"
  | "chevron-down"
  | "chevron-up"
  | "chevron-left"
  | "chevron-right"
  | "clock"
  | "cloud"
  | "cloud-off"
  | "close"
  | "comment"
  | "duration"
  | "edit"
  | "eye"
  | "eye-off"
  | "fish"
  | "flower"
  | "follow"
  | "heart"
  | "heart-filled"
  | "home"
  | "image"
  | "lock"
  | "mail"
  | "menu"
  | "more"
  | "plus"
  | "project"
  | "record"
  | "refresh"
  | "restore"
  | "search"
  | "shapes"
  | "share"
  | "sprout"
  | "star"
  | "star-filled"
  | "store"
  | "trash"
  | "unlock"
  | "upload"
  | "user"
  | "users"
  | "view"
  | "warning"
  | "wrench";

type UiIconProps = Omit<SVGProps<SVGSVGElement>, "name"> & {
  name: UiIconName;
  size?: number | string;
  label?: string;
  strokeWidth?: number;
};

function IconPaths({ name }: { name: UiIconName }) {
  switch (name) {
    case "arrow-left":
      return <path d="m14.5 5-7 7 7 7M8 12h11" />;
    case "arrow-right":
      return <path d="m9.5 5 7 7-7 7M16 12H5" />;
    case "bell":
      return <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></>;
    case "bookmark":
    case "bookmark-filled":
      return <path d="M6 4.5A2.5 2.5 0 0 1 8.5 2h7A2.5 2.5 0 0 1 18 4.5V21l-6-3.7L6 21Z" fill={name === "bookmark-filled" ? "currentColor" : "none"} />;
    case "calendar":
      return <><rect x="3.5" y="5" width="17" height="15" rx="2" /><path d="M8 2.5v5M16 2.5v5M3.5 9.5h17" /></>;
    case "check":
      return <path d="m5 12.5 4.2 4L19 7" />;
    case "chevron-down":
      return <path d="m6 9 6 6 6-6" />;
    case "chevron-up":
      return <path d="m6 15 6-6 6 6" />;
    case "chevron-left":
      return <path d="m15 5-7 7 7 7" />;
    case "chevron-right":
      return <path d="m9 5 7 7-7 7" />;
    case "clock":
    case "duration":
      return <><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5l3.5 2" /></>;
    case "cloud":
    case "cloud-off":
      return <><path d="M17.5 18H8a5 5 0 1 1 .7-9.95A6 6 0 0 1 20 10.5a3.75 3.75 0 0 1-2.5 7.5Z" />{name === "cloud-off" ? <path d="M4 4l16 16" /> : null}</>;
    case "close":
      return <path d="m6 6 12 12M18 6 6 18" />;
    case "comment":
      return <path d="M20 11.5a7.5 7.5 0 0 1-8 7.5 9 9 0 0 1-3.4-.7L4 20l1.5-4.1A7.5 7.5 0 1 1 20 11.5Z" />;
    case "edit":
      return <><path d="M4 20h4l11-11-4-4L4 16Z" /><path d="m13.5 6.5 4 4" /></>;
    case "eye":
    case "view":
      return <><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" /><circle cx="12" cy="12" r="2.7" /></>;
    case "eye-off":
      return <><path d="M3 3 21 21M10.6 6.1A10 10 0 0 1 12 6c6 0 9.5 6 9.5 6a15 15 0 0 1-2.2 2.9M6.7 6.7C4 8.5 2.5 12 2.5 12s3.5 6 9.5 6a9 9 0 0 0 3-.5M10.2 10.2a2.7 2.7 0 0 0 3.6 3.6" /></>;
    case "fish":
      return <><path d="M16.5 7.5C12 5 7.5 7.3 4 12c3.5 4.7 8 7 12.5 4.5L21 20v-6.5L18.5 12 21 10.5V4Z" /><circle cx="14" cy="11" r=".8" fill="currentColor" stroke="none" /></>;
    case "flower":
      return <><circle cx="12" cy="12" r="2.3" /><path d="M12 9.7C8 8.5 8.1 4 12 3c3.9 1 4 5.5 0 6.7ZM14.3 12c1.2-4 5.7-3.9 6.7 0-1 3.9-5.5 4-6.7 0ZM12 14.3c4 1.2 3.9 5.7 0 6.7-3.9-1-4-5.5 0-6.7ZM9.7 12c-1.2 4-5.7 3.9-6.7 0 1-3.9 5.5-4 6.7 0Z" /></>;
    case "follow":
      return <><circle cx="9" cy="8" r="3.5" /><path d="M3 20c.5-4 2.5-6 6-6 2.1 0 3.8.7 4.8 2M17.5 10v6M14.5 13h6" /></>;
    case "heart":
    case "heart-filled":
      return <path d="M20.8 8.7c0 5.1-8.8 10.3-8.8 10.3S3.2 13.8 3.2 8.7A4.7 4.7 0 0 1 12 6.4a4.7 4.7 0 0 1 8.8 2.3Z" fill={name === "heart-filled" ? "currentColor" : "none"} />;
    case "home":
      return <><path d="m3 11 9-8 9 8" /><path d="M5.5 9.5V21h13V9.5M9.5 21v-7h5v7" /></>;
    case "image":
      return <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9" r="1.5" /><path d="m4 17 5-5 3.5 3.5 2.5-2.5 5 5" /></>;
    case "lock":
    case "unlock":
      return <><rect x="4" y="10" width="16" height="11" rx="2" /><path d={name === "unlock" ? "M8 10V7a4 4 0 0 1 7.5-2" : "M8 10V7a4 4 0 0 1 8 0v3"} /></>;
    case "mail":
      return <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m4 7 8 6 8-6" /></>;
    case "menu":
      return <path d="M4 7h16M4 12h16M4 17h16" />;
    case "more":
      return <><circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" /></>;
    case "plus":
      return <path d="M12 5v14M5 12h14" />;
    case "project":
      return <><rect x="3" y="5" width="18" height="15" rx="2" /><path d="M8 5V3h8v2M8 10h8M8 14h5" /></>;
    case "record":
      return <><path d="M6 3h9l3 3v15H6Z" /><path d="M15 3v4h4M9 11h6M9 15h6" /></>;
    case "refresh":
    case "restore":
      return <><path d="M20 7v5h-5" /><path d="M19 12a7 7 0 1 0-2 5" /></>;
    case "search":
      return <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.5 15.5 5 5" /></>;
    case "shapes":
      return <><circle cx="8" cy="8" r="3.5" /><rect x="13" y="4.5" width="6.5" height="6.5" rx="1" /><path d="m7.5 19 3.5-6 3.5 6Z" /></>;
    case "share":
      return <><circle cx="18" cy="5" r="2.5" /><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="19" r="2.5" /><path d="m8.2 10.8 7.6-4.5M8.2 13.2l7.6 4.5" /></>;
    case "sprout":
      return <><path d="M12 21v-9" /><path d="M12 13C8 13 5 10.5 5 6c4 0 7 2.5 7 7ZM12 16c4 0 7-2.5 7-7-4 0-7 2.5-7 7Z" /></>;
    case "star":
    case "star-filled":
      return <path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6-5.4-2.8-5.4 2.8 1-6-4.4-4.3 6.1-.9Z" fill={name === "star-filled" ? "currentColor" : "none"} />;
    case "store":
      return <><path d="M4 9v11h16V9M3 9l2-6h14l2 6" /><path d="M3 9a3 3 0 0 0 5 2 3 3 0 0 0 4 0 3 3 0 0 0 4 0 3 3 0 0 0 5-2M9 20v-5h6v5" /></>;
    case "trash":
      return <><path d="M4 7h16M9 3h6l1 4H8ZM7 7l1 14h8l1-14M10 11v6M14 11v6" /></>;
    case "upload":
      return <><path d="M12 16V3M7 8l5-5 5 5" /><path d="M4 14v7h16v-7" /></>;
    case "user":
      return <><circle cx="12" cy="8" r="4" /><path d="M4 21c.7-5 3.3-7 8-7s7.3 2 8 7" /></>;
    case "users":
      return <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.6-4.3 2.7-6 6.5-6s6 1.7 6.5 6M15 5.5a3.5 3.5 0 0 1 0 6.8M16 14c3.2.3 5 2 5.5 6" /></>;
    case "warning":
      return <><path d="m12 3 9 17H3Z" /><path d="M12 9v5M12 17h.01" /></>;
    case "wrench":
      return <path d="M14.7 6.3a5 5 0 0 0-6.4 6.4L3.5 17.5a2.1 2.1 0 0 0 3 3l4.8-4.8a5 5 0 0 0 6.4-6.4l-3 3-3-3Z" />;
  }
}

export default function UiIcon({
  name,
  size = 18,
  label,
  strokeWidth = 1.8,
  style,
  ...props
}: UiIconProps) {
  const mergedStyle: CSSProperties = {
    display: "inline-block",
    flex: "0 0 auto",
    verticalAlign: "-0.16em",
    ...style,
  };

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
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
      style={mergedStyle}
      {...props}
    >
      <IconPaths name={name} />
    </svg>
  );
}
