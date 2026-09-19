import { Suspense } from "react";
import SupportCenter from "@/components/support/SupportCenter";

export default function ReportPage() {
  return <Suspense fallback={null}><SupportCenter kind="report" /></Suspense>;
}
