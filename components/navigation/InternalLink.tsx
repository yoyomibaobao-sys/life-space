"use client";

import Link from "next/link";
import {
  createContext,
  useContext,
  type ComponentProps,
  type MouseEvent,
  type ReactNode,
} from "react";

export type InternalNavigateHandler = (href: string) => boolean;

const InternalNavigationContext = createContext<InternalNavigateHandler | null>(null);

export function InternalNavigationProvider({
  onNavigate,
  children,
}: {
  onNavigate: InternalNavigateHandler;
  children: ReactNode;
}) {
  return (
    <InternalNavigationContext.Provider value={onNavigate}>
      {children}
    </InternalNavigationContext.Provider>
  );
}

export function useInternalNavigate() {
  return useContext(InternalNavigationContext);
}

function hrefToString(href: ComponentProps<typeof Link>["href"]) {
  if (typeof href === "string") return href;
  if (href && typeof href === "object" && "pathname" in href) {
    const path = href.pathname || "";
    const search = href.search || "";
    const hash = href.hash || "";
    return `${path}${search}${hash}`;
  }
  return String(href);
}

export default function InternalLink({
  href,
  onClick,
  ...props
}: ComponentProps<typeof Link>) {
  const navigate = useContext(InternalNavigationContext);
  const hrefValue = hrefToString(href);

  if (!navigate) {
    return <Link href={href} onClick={onClick} {...props} />;
  }

  return (
    <a
      href={hrefValue}
      onClick={(event: MouseEvent<HTMLAnchorElement>) => {
        onClick?.(event);
        if (event.defaultPrevented) return;
        if (navigate(hrefValue)) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
      {...props}
    />
  );
}
