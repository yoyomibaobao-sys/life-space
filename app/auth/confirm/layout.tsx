import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "邮件确认 · LifeSpace",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

export default function ConfirmLayout({ children }: { children: React.ReactNode }) {
  return children;
}
