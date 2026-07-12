"use client";

import { Badge } from "@commerce-copilot/ui";
import { FlaskConical } from "lucide-react";
import type { ReactNode } from "react";
import { MobileNav } from "./mobile-nav.tsx";
import { SideNav } from "./side-nav.tsx";
import { ThemeToggle } from "./theme-toggle.tsx";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-[var(--canvas)] text-[var(--text)]">
      <aside className="fixed inset-y-0 left-0 hidden w-60 border-r border-[var(--border)] bg-[var(--surface)] lg:flex lg:flex-col">
        <div className="flex h-16 items-center border-b border-[var(--border)] px-5 text-sm font-semibold">
          Commerce Copilot
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          <SideNav />
        </div>
        <div className="border-t border-[var(--border)] p-4 text-xs text-[var(--text-muted)]">
          <div className="font-medium text-[var(--text)]">演示店铺</div>
          <div className="mt-1">客服主管</div>
        </div>
      </aside>
      <div className="min-w-0 lg:pl-60">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-[var(--border)] bg-[var(--surface)] px-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-2">
            <MobileNav />
            <span className="truncate text-sm font-medium">演示店铺 · 客服主管</span>
          </div>
          <ThemeToggle />
        </header>
        <div className="flex min-h-12 items-center gap-3 border-b border-[var(--warning-border)] bg-[var(--warning-soft)] px-4 py-2 text-sm text-[var(--warning-text)] sm:px-6">
          <FlaskConical aria-hidden="true" className="size-5 shrink-0" />
          <Badge status="waiting">模拟环境</Badge>
          <span>当前数据与操作仅用于演示，不会触达真实平台。</span>
        </div>
        <main className="mx-auto w-full max-w-7xl p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
