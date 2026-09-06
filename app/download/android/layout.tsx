import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "下载安卓版 | 有时·耕作",
  description:
    "从有时·耕作官方网站下载经过固定密钥签名的 Android 安装包。",
};

export default function AndroidDownloadLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
