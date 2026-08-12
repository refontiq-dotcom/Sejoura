"use client";

import { ButtonHTMLAttributes, forwardRef } from "react";
import { Loader2 } from "lucide-react";

type Variant = "primary" | "secondary" | "outline" | "ghost" | "destructive" | "success" | "purple";
type Size = "sm" | "md" | "lg" | "icon";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-[var(--primary-color,#0C1C33)] text-[var(--primary-foreground,#ffffff)] hover:opacity-90 hover:bg-[var(--primary-hover,#162a47)] focus:ring-[var(--primary-color)] shadow-sm",
  secondary:
    "bg-slate-100 text-slate-900 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-100 dark:hover:bg-slate-600",
  outline:
    "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700",
  ghost:
    "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700",
  destructive:
    "bg-red-600 text-white hover:bg-red-700 shadow-sm dark:bg-red-500 dark:hover:bg-red-600",
  success:
    "bg-green-600 text-white hover:bg-green-700 shadow-sm dark:bg-green-500 dark:hover:bg-green-600",
  purple:
    "bg-purple-600 text-white hover:bg-purple-700 shadow-lg shadow-purple-200 dark:shadow-purple-900/40 focus:ring-purple-600",
};

const sizeClasses: Record<Size, string> = {
  sm: "h-7 px-2.5 text-[11px] rounded-md",
  md: "h-8 px-3 text-xs rounded-md",
  lg: "h-9 px-4 text-sm rounded-lg",
  icon: "h-8 w-8 rounded-md",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = "", variant = "primary", size = "md", loading, children, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={`inline-flex items-center justify-center font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-[var(--primary-color,#0C1C33)] focus:ring-offset-2 dark:focus:ring-offset-slate-800 ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
        {...props}
      >
        {loading && <Loader2 className="w-4 h-4 animate-spin" />}
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";
