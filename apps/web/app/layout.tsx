import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppShell } from "../src/components/app-shell.tsx";
import { Providers } from "./providers.tsx";
import "./globals.css";

export const metadata: Metadata = {
  title: "Commerce Copilot",
  description: "客户服务运营控制台",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body>
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
