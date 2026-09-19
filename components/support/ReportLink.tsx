"use client";
import Link from "next/link";
import { useLanguage } from "@/lib/i18n/useLanguage";
import { getSupportCopy } from "@/lib/i18n/support-workflow";
import { buildReportHref } from "@/lib/support-links";

export default function ReportLink({ targetUrl }: { targetUrl: string }) {
  const { language } = useLanguage();
  return <Link href={buildReportHref(targetUrl)} style={{ color: "#6c7868", fontSize: 12, padding: "10px 0", display: "inline-block" }}>{getSupportCopy(language).reportThis}</Link>;
}
