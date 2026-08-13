import { HTMLAttributes } from "react";

type BadgeVariant = "default" | "success" | "warning" | "error" | "info" | "purple" | "theme" | "outline";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const variantClasses: Record<BadgeVariant, string> = {
  default: "bg-[var(--surface-muted)] text-[var(--foreground)] font-semibold",
  success: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/50 dark:text-emerald-200 font-semibold",
  warning: "bg-amber-100 text-amber-900 dark:bg-amber-900/50 dark:text-amber-200 font-semibold",
  error: "bg-red-100 text-red-900 dark:bg-red-900/50 dark:text-red-200 font-semibold",
  info: "bg-blue-100 text-blue-900 dark:bg-blue-900/50 dark:text-blue-200 font-semibold",
  purple: "bg-[var(--primary-muted)] text-[var(--primary-muted-foreground)] font-semibold border border-[var(--primary-color)]/20",
  theme: "bg-[var(--primary-muted)] text-[var(--primary-muted-foreground)] font-semibold border border-[var(--primary-color)]/20",
  outline: "border border-[var(--border-strong)] text-[var(--foreground-muted)] bg-transparent",
};

export function Badge({ variant = "default", className = "", children, ...props }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-px rounded-full text-[11px] font-semibold ${variantClasses[variant]} ${className}`}
      {...props}
    >
      {children}
    </span>
  );
}