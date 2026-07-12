import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes, ReactElement, ReactNode } from "react";
import { cn } from "./cn.ts";

const buttonVariants = cva(
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface)] disabled:pointer-events-none disabled:opacity-50 motion-reduce:transition-none",
  {
    variants: {
      intent: {
        primary: "bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)]",
        secondary:
          "border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:bg-[var(--surface-subtle)]",
        danger: "bg-[var(--danger)] text-white hover:bg-[var(--danger-hover)]",
        ghost: "text-[var(--text-muted)] hover:bg-[var(--surface-subtle)] hover:text-[var(--text)]",
      },
    },
    defaultVariants: { intent: "primary" },
  },
);

type NativeButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children">;
type StandardButtonIntent = Exclude<
  NonNullable<VariantProps<typeof buttonVariants>["intent"]>,
  "danger"
>;

type StandardButtonProps = NativeButtonProps & {
  intent?: StandardButtonIntent;
  impactLabel?: never;
  children?: ReactNode;
};

type DangerButtonProps = NativeButtonProps & {
  intent: "danger";
  impactLabel: string;
  children?: ReactElement;
};

export type ButtonProps = StandardButtonProps | DangerButtonProps;

export function Button({
  className,
  intent = "primary",
  impactLabel,
  type = "button",
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(buttonVariants({ intent }), className)}
      data-intent={intent}
      {...props}
    >
      {children}
      {intent === "danger" && <span>{impactLabel}</span>}
    </button>
  );
}
