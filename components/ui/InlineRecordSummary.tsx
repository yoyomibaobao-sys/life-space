"use client";

import { useEffect, useRef, useState } from "react";
import CompactActivityTime from "@/components/ui/CompactActivityTime";
import { fitInlineSummary } from "@/lib/fit-inline-summary";
import { useLanguage } from "@/lib/i18n/useLanguage";
import styles from "./InlineRecordSummary.module.css";

export default function InlineRecordSummary({
  text,
  time,
  className,
}: {
  text?: string | null;
  time?: string | null;
  className?: string;
}) {
  const { language } = useLanguage();
  const normalizedText = (text || "").replace(/\s+/gu, " ").trim();
  const [visibleText, setVisibleText] = useState(normalizedText);
  const containerRef = useRef<HTMLSpanElement>(null);
  const probeRef = useRef<HTMLSpanElement>(null);
  const probeTextRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    const probe = probeRef.current;
    const probeText = probeTextRef.current;
    if (!container || !probe || !probeText) return;
    let disposed = false;
    let frame = 0;
    const measure = () => {
      if (disposed || !container.clientWidth) return;
      const computed = window.getComputedStyle(container);
      const lineHeight = Number.parseFloat(computed.lineHeight) || Number.parseFloat(computed.fontSize) * 1.4;
      const fitted = fitInlineSummary(normalizedText, (candidate) => {
        probeText.textContent = candidate;
        return probe.getBoundingClientRect().height <= lineHeight * 2 + 1;
      });
      setVisibleText(fitted);
    };
    const schedule = () => {
      if (disposed) return;
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(measure);
    };
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
    observer?.observe(container);
    window.addEventListener("resize", schedule);
    void document.fonts?.ready.then(schedule);
    schedule();
    return () => {
      disposed = true;
      observer?.disconnect();
      window.removeEventListener("resize", schedule);
      window.cancelAnimationFrame(frame);
    };
  }, [normalizedText, time, language]);

  if (!normalizedText && !time) return null;

  return (
    <span ref={containerRef} className={`${styles.summary} ${className || ""}`}>
      <span className={styles.flow}>
        <span title={normalizedText || undefined}>{visibleText}</span>
        {time ? <CompactActivityTime value={time} className={styles.time} /> : null}
      </span>
      <span ref={probeRef} className={styles.probe} aria-hidden="true">
        <span ref={probeTextRef} />
        {time ? <CompactActivityTime value={time} className={styles.time} /> : null}
      </span>
    </span>
  );
}
