"use client";

import { Toaster } from "sonner";
import { useTheme } from "@/components/providers/theme-provider";

export function ThemeToaster() {
  const { theme } = useTheme();

  return <Toaster position="top-right" richColors closeButton duration={4000} theme={theme} className="toaster-group" style={{ fontFamily: "var(--font-geist-sans), system-ui, sans-serif" }} />;
}
