import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "EchoNook · 你的安静频道",
  description: "一个可以随时对话的虚拟陪伴空间。",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
