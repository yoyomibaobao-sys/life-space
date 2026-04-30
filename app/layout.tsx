import Navbar from "@/components/navbar";
import Toast from "@/components/Toast";
import type { Metadata } from "next";
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
  description: "记录持续照顾的植物与小生态，让生命有迹可循。",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <Navbar />
        <main className="app-main">{children}</main>
        <Toast />
      </body>
    </html>
  );
}
