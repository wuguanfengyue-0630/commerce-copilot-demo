"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

export function ThemeToggle() {
  const [mounted, setMounted] = useState(false);
  const { resolvedTheme, setTheme } = useTheme();
  useEffect(() => setMounted(true), []);

  const controlClass =
    "inline-flex size-11 items-center justify-center rounded-md text-[var(--text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]";
  if (!mounted) {
    return (
      <button
        type="button"
        aria-label="主题设置加载中"
        title="主题设置加载中"
        disabled
        className={controlClass}
      >
        <span aria-hidden="true" className="size-5 rounded bg-[var(--surface-strong)]" />
      </button>
    );
  }

  const dark = resolvedTheme === "dark";
  const label = dark ? "切换到浅色主题" : "切换到深色主题";
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={() => setTheme(dark ? "light" : "dark")}
      className={`${controlClass} hover:bg-[var(--surface-subtle)] hover:text-[var(--text)]`}
    >
      {dark ? (
        <Sun aria-hidden="true" className="size-5" />
      ) : (
        <Moon aria-hidden="true" className="size-5" />
      )}
    </button>
  );
}
