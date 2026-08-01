"use client";

import Link from "next/link";

export function ForgotPasswordLink() {
  return (
    <div className="text-right">
      <Link
        href="/auth/forgot-password"
        className="text-[11px] text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 underline underline-offset-2"
      >
        Mot de passe oublié ?
      </Link>
    </div>
  );
}
