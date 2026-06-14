import Navbar from "@/components/navbar";
import StatusBarTheme from "@/components/StatusBarTheme";
import Toast from "@/components/Toast";
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
  title: "有时 · 耕作",
  description: "有时·耕作是种植、养护、农法设施和生态观察的记录工具。",
};

export const viewport: Viewport = {
  themeColor: "#fbfcf7",
  colorScheme: "light",
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
        <Navbar />
        <main className="app-main">{children}</main>
        <Toast />
      </body>
    </html>
  );
}
