import Navbar from "@/components/navbar";
import SiteFooter from "@/components/SiteFooter";
import StatusBarTheme from "@/components/StatusBarTheme";
import AnalyticsTracker from "@/components/AnalyticsTracker";
import Toast from "@/components/Toast";
import MobileBackNavigation from "@/components/MobileBackNavigation";
import KeyboardLayoutGuard from "@/components/KeyboardLayoutGuard";
import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "有时·耕作 | LifeSpace for Cultivation",
  description:
    "有时·耕作：围绕种植、养护、农法设施与生态观察的长期记录空间。 LifeSpace for long-term cultivation records.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "有时·耕作",
  },
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#f6f8f3",
  colorScheme: "light",
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <StatusBarTheme />
        <KeyboardLayoutGuard />
        <MobileBackNavigation />
        <AnalyticsTracker />
        <Navbar />
        <main className="app-main">{children}</main>
        <SiteFooter />
        <Toast />
      </body>
    </html>
  );
}
