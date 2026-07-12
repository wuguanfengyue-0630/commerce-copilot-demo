import type { HTMLAttributes } from "react";
import { cn } from "./cn.ts";

type SkeletonBaseProps = Omit<
  HTMLAttributes<HTMLDivElement>,
  "aria-busy" | "aria-hidden" | "aria-label" | "role"
>;

export type SkeletonProps =
  | (SkeletonBaseProps & { decorative: true; label?: never })
  | (SkeletonBaseProps & { decorative?: false; label?: string });

export function Skeleton({
  decorative = false,
  label = "正在加载",
  className,
  ...props
}: SkeletonProps) {
  const classes = cn(
    "h-5 animate-pulse rounded bg-[var(--surface-strong)] motion-reduce:animate-none",
    className,
  );
  if (decorative) {
    return <div aria-hidden="true" className={classes} {...props} />;
  }

  return <div role="status" aria-busy="true" aria-label={label} className={classes} {...props} />;
}
