"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactElement, ReactNode } from "react";
import { cn } from "./cn.ts";

export interface DialogProps {
  trigger: ReactElement;
  title: string;
  description: string;
  children: ReactNode;
  contentClassName?: string;
}

export function Dialog({ trigger, title, description, children, contentClassName }: DialogProps) {
  return (
    <DialogPrimitive.Root>
      <DialogPrimitive.Trigger asChild>{trigger}</DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/45" />
        <DialogPrimitive.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[min(32rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5 text-[var(--text)] shadow-xl focus:outline-none",
            contentClassName,
          )}
        >
          <div className="pr-10">
            <DialogPrimitive.Title className="text-base font-semibold">
              {title}
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="mt-1 text-sm text-[var(--text-muted)]">
              {description}
            </DialogPrimitive.Description>
          </div>
          <div className="mt-5">{children}</div>
          <DialogPrimitive.Close
            aria-label="关闭"
            title="关闭"
            className="absolute right-2 top-2 inline-flex size-11 items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--surface-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
          >
            <X aria-hidden="true" className="size-5" />
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
