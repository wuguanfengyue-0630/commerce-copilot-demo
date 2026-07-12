import type { HTMLAttributes } from "react";
import { cn } from "./cn.ts";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5", className)}
      {...props}
    />
  );
}
