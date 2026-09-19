import { Suspense } from "react";
import SupportCenter from "@/components/support/SupportCenter";

export default function FeedbackPage() {
  return <Suspense fallback={null}><SupportCenter kind="feedback" /></Suspense>;
}
