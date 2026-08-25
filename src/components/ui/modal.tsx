"use client";

import { ReactNode, useEffect, useId, useRef } from "react";
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

// Pile globale des modals actuellement ouvertes. Elle permet de :
//   1. ne fermer que la modal la plus haute sur Escape (et pas toutes les
//      modals empilées d'un coup — ex. Facture → Envoyer la facture) ;
//   2. ne rendre le scroll au body que lorsque la DERNIÈRE modal se ferme
//      (avant, fermer une modal enfant réactivait le scroll derrière la
//      modal parent encore ouverte).
const openModalStack: symbol[] = [];

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  size = "md",
  onConfirm,
}: ModalProps) {
  const id = useId();
  const titleId = `${id}-title`;
  const descriptionId = `${id}-description`;
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const stackToken = useRef<symbol | null>(null);

  // ── Scroll-lock + pile d'ouverture + focus ──
  useEffect(() => {
    if (!open) return;

    const token = Symbol("modal-open");
    stackToken.current = token;
    openModalStack.push(token);

    // Mémorise l'élément focus avant l'ouverture pour le restaurer à la fermeture.
    previouslyFocused.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    document.body.style.overflow = "hidden";

    // Place le focus dans la dialog (le conteneur a tabIndex={-1}).
    const focusTimer = window.setTimeout(() => {
      dialogRef.current?.focus();
    }, 0);

    return () => {
      window.clearTimeout(focusTimer);
      const index = openModalStack.indexOf(token);
      if (index !== -1) openModalStack.splice(index, 1);
      stackToken.current = null;

      // Ne libère le scroll que si plus aucune modal n'est ouverte.
      if (openModalStack.length === 0) {
        document.body.style.overflow = "";
      }

      // Restaure le focus sur l'élément qui a ouvert la modal.
      previouslyFocused.current?.focus?.();
      previouslyFocused.current = null;
    };
  }, [open]);

  // ── Raccourcis clavier : uniquement quand la modal est ouverte ──
  useEffect(() => {
    if (!open) return;

    function isTopmostModal(): boolean {
      const token = stackToken.current;
      return token !== null && openModalStack[openModalStack.length - 1] === token;
    }

    function handleKeyDown(e: KeyboardEvent) {
      // Escape : seule la modal au sommet de la pile se ferme.
      if (e.key === "Escape") {
        if (!isTopmostModal()) return;
        e.stopPropagation();
        onClose();
        return;
      }

      // Raccourci de sauvegarde : Cmd+S ou Ctrl+S
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s" && onConfirm) {
        e.preventDefault();
        onConfirm();
        return;
      }

      // Piège à focus : Tab reste cyclé à l'intérieur de la dialog.
      if (e.key === "Tab") {
        const dialog = dialogRef.current;
        if (!dialog) return;
        const focusables = dialog.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const activeElement = document.activeElement;
        if (!e.shiftKey && activeElement === last) {
          e.preventDefault();
          first.focus();
        } else if (e.shiftKey && activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [open, onClose, onConfirm]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 overflow-y-auto overscroll-contain" style={{ pointerEvents: "auto" }}>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm" style={{ pointerEvents: "auto" }}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className={`relative w-full ${sizeClasses[size]} bg-[var(--surface-elevated)] border border-[var(--border)] sm:rounded-lg rounded-t-2xl shadow-[var(--shadow-xl)] animate-modal-in max-h-[92vh] flex flex-col pb-[env(safe-area-inset-bottom)] sm:pb-0 outline-none`}
        style={{ pointerEvents: "auto" }}
      >
        {/* Header */}
        {(title || description) && (
          <div className="p-3 border-b border-[var(--border)] flex items-start justify-between">
            <div>
              {title && (
                <h2 id={titleId} className="text-base font-semibold text-[var(--foreground)]">
                  {title}
                </h2>
              )}
              {description && (
                <p id={descriptionId} className="text-[11px] text-[var(--foreground-muted)] mt-0.5">
                  {description}
                </p>
              )}
            </div>
            <button
              onClick={onClose}
              className="p-1 rounded-md text-[var(--foreground-subtle)] hover:bg-[var(--surface-hover)] transition-colors"
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
            className="absolute top-2.5 right-2.5 p-1 rounded-md text-[var(--foreground-subtle)] hover:bg-[var(--surface-hover)] transition-colors z-10"
            aria-label="Fermer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}

        {/* Content */}
        <div className="p-3 sm:p-4 overflow-y-auto flex-1 overscroll-contain" style={{ WebkitOverflowScrolling: "touch" }}>{children}</div>
      </div>
    </div>
  );
}
