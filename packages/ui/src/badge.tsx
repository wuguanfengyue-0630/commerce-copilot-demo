import {
  CheckCircle2,
  CircleAlert,
  CircleDashed,
  Clock3,
  type LucideIcon,
  UserRoundCheck,
} from "lucide-react";
import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "./cn.ts";

export type BadgeStatus = "success" | "waiting" | "needs-human" | "failed" | "neutral";
const icons: Record<BadgeStatus, LucideIcon> = {
  success: CheckCircle2,
  waiting: Clock3,
  "needs-human": UserRoundCheck,
  failed: CircleAlert,
  neutral: CircleDashed,
};
const styles: Record<BadgeStatus, string> = {
  success: "border-[var(--success-border)] bg-[var(--success-soft)] text-[var(--success-text)]",
  waiting: "border-[var(--warning-border)] bg-[var(--warning-soft)] text-[var(--warning-text)]",
  "needs-human":
    "border-[var(--warning-border)] bg-[var(--warning-soft)] text-[var(--warning-text)]",
  failed: "border-[var(--danger-border)] bg-[var(--danger-soft)] text-[var(--danger-text)]",
  neutral: "border-[var(--border)] bg-[var(--surface-subtle)] text-[var(--text-muted)]",
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  status: BadgeStatus;
  icon?: LucideIcon;
  children: ReactNode;
}

export function Badge({ status, icon, className, children, ...props }: BadgeProps) {
  const Icon = icon ?? icons[status];
  return (
    <span
      className={cn(
        "inline-flex min-h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium",
        styles[status],
        className,
      )}
      {...props}
    >
      <Icon aria-hidden="true" className="size-3.5 shrink-0" />
      {children}
    </span>
  );
}
