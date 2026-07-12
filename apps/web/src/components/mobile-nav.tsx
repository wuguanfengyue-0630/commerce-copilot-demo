"use client";

import { Dialog } from "@commerce-copilot/ui";
import { Menu } from "lucide-react";
import { SideNav } from "./side-nav.tsx";

export function MobileNav() {
  return (
    <Dialog
      trigger={
        <button
          type="button"
          aria-label="打开导航"
          title="打开导航"
          className="inline-flex size-11 items-center justify-center rounded-md hover:bg-[var(--surface-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] lg:hidden"
        >
          <Menu aria-hidden="true" className="size-5" />
        </button>
      }
      title="主导航"
      description="客户服务控制台导航"
      contentClassName="left-0 top-0 h-dvh w-[min(20rem,calc(100vw-2rem))] max-h-dvh -translate-x-0 -translate-y-0 rounded-none border-y-0 border-l-0"
    >
      <SideNav />
    </Dialog>
  );
}
