"use client";

import {
  BedDouble,
  CheckCircle2,
  RefreshCw,
  X,
  type LucideIcon,
} from "lucide-react";
import { toast, type ExternalToast } from "sonner";
import type { ReactNode } from "react";

export type SejouraFeedbackVariant =
  | "success"
  | "error"
  | "warning"
  | "info"
  | "loading"
  | "business"
  | "sync";

export type SejouraFeedbackOptions = ExternalToast & {
  description?: ReactNode;
};

type CustomToastProps = {
  id: string | number;
  variant: "business" | "sync";
  title: string;
  description?: ReactNode;
  icon?: LucideIcon;
  syncing?: boolean;
};

function CustomToast({
  id,
  variant,
  title,
  description,
  icon: Icon,
  syncing = false,
}: CustomToastProps) {
  const FallbackIcon = variant === "sync" ? RefreshCw : BedDouble;
  const ToastIcon = Icon ?? FallbackIcon;

  return (
    <div
      className={`sejoura-toast sejoura-toast--${variant}`}
      data-syncing={syncing || undefined}
      role="status"
    >
      <div className="sejoura-toast-icon" aria-hidden="true">
        <ToastIcon />
      </div>

      <div className="sejoura-toast-content">
        <p className="sejoura-toast-title">{title}</p>
        {description ? (
          <p className="sejoura-toast-description">{description}</p>
        ) : null}
      </div>

      <button
        type="button"
        className="sejoura-toast-close"
        aria-label="Fermer"
        onClick={() => toast.dismiss(id)}
      >
        <X aria-hidden="true" />
      </button>
    </div>
  );
}

function custom(
  variant: "business" | "sync",
  title: string,
  options: SejouraFeedbackOptions = {},
  icon?: LucideIcon,
) {
  const { description, ...toastOptions } = options;

  return toast.custom(
    (id) => (
      <CustomToast
        id={id}
        variant={variant}
        title={title}
        description={description}
        icon={icon}
        syncing={variant === "sync"}
      />
    ),
    {
      duration: variant === "business" ? 4000 : Infinity,
      ...toastOptions,
      className: `sejoura-toast--${variant}`,
    },
  );
}

export const feedback = {
  success: (title: string, options?: SejouraFeedbackOptions) =>
    toast.success(title, { duration: 3200, ...options }),

  error: (title: string, options?: SejouraFeedbackOptions) =>
    toast.error(title, { duration: 5000, ...options }),

  warning: (title: string, options?: SejouraFeedbackOptions) =>
    toast.warning(title, { duration: 4500, ...options }),

  info: (title: string, options?: SejouraFeedbackOptions) =>
    toast.info(title, { duration: 3600, ...options }),

  loading: (title: string, options?: SejouraFeedbackOptions) =>
    toast.loading(title, { duration: Infinity, ...options }),

  business: (
    title: string,
    options?: SejouraFeedbackOptions,
    icon?: LucideIcon,
  ) => custom("business", title, options, icon),

  sync: (
    title: string,
    options?: SejouraFeedbackOptions,
    icon?: LucideIcon,
  ) => custom("sync", title, options, icon),

  promise: <T>(
    promise: Promise<T>,
    messages: {
      loading: string;
      success: string | ((value: T) => string);
      error: string | ((error: unknown) => string);
    },
    options?: SejouraFeedbackOptions,
  ) =>
    toast.promise(promise, {
      loading: messages.loading,
      success: messages.success,
      error: messages.error,
      duration: 3200,
      ...options,
    }),

  dismiss: (id?: string | number) => toast.dismiss(id),

  icons: {
    reservation: BedDouble,
    success: CheckCircle2,
    sync: RefreshCw,
  },
};
