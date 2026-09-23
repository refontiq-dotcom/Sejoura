"use client";

import Link from "next/link";
import { Info, ArrowRight, X } from "lucide-react";
import { useState } from "react";

interface ContextualHelpProps {
  title: string;
  description: string;
  href?: string;
  actionLabel?: string;
  dismissible?: boolean;
}

export function ContextualHelp({
  title,
  description,
  href,
  actionLabel,
  dismissible = true,
}: ContextualHelpProps) {
  const [visible, setVisible] = useState(true);

  if (!visible) return null;

  return (
    <div className="mb-4 rounded-xl border border-[var(--primary-color,#0C1C33)]/10 bg-[var(--primary-color,#0C1C33)]/[0.035] px-3 py-2.5">
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--primary-color,#0C1C33)]/10 text-[var(--primary-color,#0C1C33)]">
          <Info className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-slate-800 dark:text-slate-100">{title}</p>
          <p className="mt-0.5 text-[11px] leading-4 text-slate-500 dark:text-slate-400">{description}</p>
          {href && actionLabel && (
            <Link
              href={href}
              className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--primary-color,#0C1C33)] hover:underline"
            >
              {actionLabel}
              <ArrowRight className="h-3 w-3" />
            </Link>
          )}
        </div>
        {dismissible && (
          <button
            type="button"
            onClick={() => setVisible(false)}
            aria-label="Fermer l'aide"
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
