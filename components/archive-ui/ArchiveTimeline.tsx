"use client";

import type { CSSProperties, ReactNode } from "react";

type Props = {
  id?: string;
  mobileMode?: boolean;
  children: ReactNode;
};

export default function ArchiveTimeline({ id, mobileMode = false, children }: Props) {
  return (
    <section
      id={id}
      style={
        mobileMode
          ? mobileTimelineStyle
          : desktopTimelineStyle
      }
    >
      {!mobileMode ? <div style={desktopLineStyle} /> : null}
      {children}
    </section>
  );
}

const desktopTimelineStyle: CSSProperties = {
  position: "relative",
  paddingLeft: 22,
  scrollMarginTop: 76,
};

const mobileTimelineStyle: CSSProperties = {
  position: "relative",
  paddingLeft: 0,
  scrollMarginTop: 64,
};

const desktopLineStyle: CSSProperties = {
  position: "absolute",
  left: 9,
  top: 0,
  bottom: 0,
  width: 2,
  background: "#e8eee5",
};
