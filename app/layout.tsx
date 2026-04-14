import Navbar from "@/components/navbar";
import Toast from "@/components/Toast";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

// ✅ 字体
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// ✅ SEO（后面多语言会扩展这里）
export const metadata: Metadata = {
  title: "Life Space",
  description: "你的养成记录空间",
};

// ✅ 根布局
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <head>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1"
        />
      </head>

      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        style={{
          margin: 0,
          padding: 0,
          background: "#f5f5f5",
        }}
      >
        {/* ⭐ 顶部导航 */}
        <Navbar />

        {/* ⭐ 页面内容 */}
        <main style={{ width: "100%" }}>{children}</main>

        {/* ⭐ 全局提示（必须放最外层） */}
        <Toast />
      </body>
    </html>
  );
}