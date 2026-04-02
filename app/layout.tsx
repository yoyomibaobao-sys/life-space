import Navbar from "../components/navbar";
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
  title: "Life Space",
  description: "你的养成记录空间",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <head>
        {/* ⭐ 关键：强制手机正确渲染 */}
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
  <Navbar />

 

  {/* ✅ 页面内容 */}
  <div style={{ width: "100%" }}>
    {children}
  </div>
</body>
    </html>
  );
}