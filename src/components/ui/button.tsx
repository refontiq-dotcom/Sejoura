"use client";

import { ButtonHTMLAttributes, forwardRef } from "react";
import { Loader2 } from "lucide-react";

type Variant = "primary" | "secondary" | "outline" | "ghost" | "destructive" | "success" | "purple";
type Size = "sm" | "md" | "lg" | "xl" | "icon";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-[var(--primary-color,#0C1C33)] text-[var(--primary-foreground,#ffffff)] hover:opacity-90 hover:bg-[var(--primary-hover,#162a47)] focus:ring-[var(--primary-color)] shadow-sm",
  secondary:
    "bg-[var(--surface-muted)] text-[var(--foreground)] hover:bg-[var(--surface-active)]",
  outline:
    "border border-[var(--border-strong)] bg-[var(--surface)] text-[var(--foreground-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]",
  ghost:
    "text-[var(--foreground-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]",
  destructive:
    "bg-[var(--destructive)] text-[var(--destructive-foreground)] hover:opacity-90 shadow-sm",
  success:
    "bg-[var(--success)] text-[var(--success-foreground)] hover:opacity-90 shadow-sm",
  purple:
    "bg-purple-600 text-white hover:bg-purple-700 shadow-lg shadow-purple-200 dark:shadow-purple-900/40 focus:ring-purple-600",
};

const sizeClasses: Record<Size, string> = {
  sm: "h-7 px-2.5 text-[11px] rounded-md",
  md: "h-8 px-3 text-xs rounded-md",
  lg: "h-9 px-4 text-sm rounded-lg",
  xl: "h-12 px-4 text-sm rounded-xl",
  icon: "h-8 w-8 rounded-md",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = "", variant = "primary", size = "md", loading, children, disabled, type = "button", ...props }, ref) => {
    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled || loading}
        className={`inline-flex items-center justify-center font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-[var(--primary-color,#0C1C33)] focus:ring-offset-2 focus:ring-offset-[var(--ring-offset)] ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
        {...props}
      >
        {loading && <Loader2 className="w-4 h-4 animate-spin" />}
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";