import type { HTMLAttributes } from "react";
import { cn } from "./cn.ts";

export interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  label?: string;
}

export function Skeleton({ label = "正在加载", className, ...props }: SkeletonProps) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={label}
      className={cn(
        "h-5 animate-pulse rounded bg-[var(--surface-strong)] motion-reduce:animate-none",
        className,
      )}
      {...props}
    />
  );
}
