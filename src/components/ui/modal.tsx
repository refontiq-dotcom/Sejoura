"use client";

import { ReactNode, useEffect } from "react";
import { X } from "lucide-react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  onConfirm?: () => void;
}

const sizeClasses = {
  sm: "max-w-md",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
};

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  size = "md",
  onConfirm,
}: ModalProps) {
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && open) {
        onClose();
      }
      // Raccourci de sauvegarde : Cmd+S ou Ctrl+S
      if ((e.metaKey || e.ctrlKey) && e.key === "s" && open && onConfirm) {
        e.preventDefault();
        onConfirm();
      }
      // Optionnel : Entrée s'il n'y a pas d'élément de formulaire actif type textarea
      if (e.key === "Enter" && open && onConfirm) {
        // Éviter de trigger si on est dans un textarea
        if (document.activeElement?.tagName === 'TEXTAREA') return;
        // On laisse passer si c'est un bouton pour ne pas double-trigger, mais souvent c'est utile.
        // Mieux : on empêche par défaut pour éviter le double submit avec les boutons.
        // e.preventDefault();
        // onConfirm();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose, onConfirm]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className={`relative w-full ${sizeClasses[size]} bg-white dark:bg-slate-800 rounded-lg shadow-2xl animate-modal-in max-h-[90vh] flex flex-col`}
      >
        {/* Header */}
        {(title || description) && (
          <div className="p-3 border-b border-slate-200 dark:border-slate-700 flex items-start justify-between">
            <div>
              {title && (
                <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                  {title}
                </h2>
              )}
              {description && (
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  {description}
                </p>
              )}
            </div>
            <button
              onClick={onClose}
              className="p-1 rounded-md text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
              aria-label="Fermer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Close button (when no header) */}
        {!title && !description && (
          <button
            onClick={onClose}
            className="absolute top-2.5 right-2.5 p-1 rounded-md text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors z-10"
            aria-label="Fermer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}

        {/* Content */}
        <div className="p-3 overflow-y-auto flex-1">{children}</div>
      </div>
    </div>
  );
}
