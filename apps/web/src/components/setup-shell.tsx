"use client";

import type { ReactNode } from "react";

import { DemoBanner } from "./demo-banner.tsx";
import { ThemeToggle } from "./theme-toggle.tsx";

export function SetupShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-[var(--canvas)] text-[var(--text)]">
      <header className="flex h-16 items-center justify-between border-b border-[var(--border)] bg-[var(--surface)] px-4 sm:px-6">
        <span className="text-sm font-semibold">Commerce Copilot</span>
        <ThemeToggle />
      </header>
      <DemoBanner />
      <main className="mx-auto w-full max-w-5xl px-4 py-4 sm:px-6">{children}</main>
    </div>
  );
}
