"use client";

import {
  CheckCircle2,
  Info,
  LoaderCircle,
  TriangleAlert,
  XCircle,
} from "lucide-react";
import { Toaster } from "sonner";
import { useTheme } from "@/components/providers/theme-provider";

export function ThemeToaster() {
  const { theme } = useTheme();

  return (
    <Toaster
      position="top-right"
      closeButton
      duration={4200}
      theme={theme}
      gap={10}
      visibleToasts={4}
      offset={{ top: 20, right: 20, bottom: 20, left: 20 }}
      icons={{
        success: <CheckCircle2 />,
        error: <XCircle />,
        warning: <TriangleAlert />,
        info: <Info />,
        loading: <LoaderCircle />,
      }}
      toastOptions={{
        classNames: {
          toast: "sejoura-toast",
          title: "sejoura-toast-title",
          description: "sejoura-toast-description",
          closeButton: "sejoura-toast-close",
        },
      }}
      className="toaster-group"
      style={{
        fontFamily: "var(--font-geist-sans), system-ui, sans-serif",
      }}
    />
  );
}
