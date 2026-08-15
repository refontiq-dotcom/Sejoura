"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";

interface DropdownMenuContextValue {
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
}

const DropdownMenuContext = createContext<DropdownMenuContextValue | null>(null);

function useDropdownMenu() {
  const ctx = useContext(DropdownMenuContext);
  if (!ctx) throw new Error("DropdownMenu components must be used within <DropdownMenu>");
  return ctx;
}

// Retourne les items réellement visibles et non désactivés (les items cachés
// par des classes responsives type `md:hidden` sont ignorés par la navigation).
function getMenuItems(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>('[role="menuitem"]')).filter(
    (el) => el.offsetParent !== null && !el.hasAttribute("disabled")
  );
}

// ============================================================================
// DropdownMenu — menu déroulant autonome (gère l'ouverture, la fermeture au
// clic extérieur, la touche Échap, la navigation clavier et le positionnement
// par portail).
// ============================================================================
export function DropdownMenu({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("click", handleClickOutside);
    return () => {
      document.removeEventListener("click", handleClickOutside);
    };
  }, [open]);

  return (
    <DropdownMenuContext.Provider value={{ open, setOpen, triggerRef }}>
      <div ref={rootRef} className="relative inline-block text-left">
        {children}
      </div>
    </DropdownMenuContext.Provider>
  );
}

type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "destructive" | "success" | "purple";
type ButtonSize = "sm" | "md" | "lg" | "icon";

interface DropdownMenuTriggerProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function DropdownMenuTrigger({
  variant = "ghost",
  size = "icon",
  children,
  ...props
}: DropdownMenuTriggerProps) {
  const { open, setOpen, triggerRef } = useDropdownMenu();
  return (
    <Button
      ref={triggerRef}
      type="button"
      aria-haspopup="menu"
      aria-expanded={open}
      variant={variant}
      size={size}
      {...props}
      onClick={(e) => {
        props.onClick?.(e);
        setOpen((prev) => !prev);
      }}
    >
      {children}
    </Button>
  );
}

interface DropdownMenuContentProps {
  align?: "start" | "end";
  children: ReactNode;
  className?: string;
}

export function DropdownMenuContent({ align = "end", children, className = "" }: DropdownMenuContentProps) {
  const { open, setOpen, triggerRef } = useDropdownMenu();
  const contentRef = useRef<HTMLDivElement | null>(null);

  const measure = useCallback(() => {
    const trigger = triggerRef.current;
    const content = contentRef.current;
    if (!trigger || !content) return;
    const rect = trigger.getBoundingClientRect();
    const width = content.offsetWidth;
    const height = content.offsetHeight;
    const margin = 8;
    const left = align === "end"
      ? Math.min(Math.max(margin, rect.right - width), window.innerWidth - width - margin)
      : Math.min(Math.max(margin, rect.left), window.innerWidth - width - margin);
    const spaceBelow = window.innerHeight - rect.bottom;
    const top = spaceBelow >= height + margin
      ? rect.bottom + 6
      : Math.max(margin, rect.top - height - 6);
    content.style.top = `${top}px`;
    content.style.left = `${left}px`;
    content.style.visibility = "visible";
  }, [align, triggerRef]);

  // Positionnement + focus du premier item à l'ouverture (navigation clavier).
  useLayoutEffect(() => {
    if (!open) return;
    const content = contentRef.current;
    if (content) content.style.visibility = "hidden";
    measure();
    const raf = requestAnimationFrame(() => {
      measure();
      getMenuItems(contentRef.current!)[0]?.focus();
    });
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open, measure]);

  function handleContentKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    const content = contentRef.current;
    if (!content) return;
    const items = getMenuItems(content);
    if (items.length === 0) return;
    const active = document.activeElement as HTMLElement | null;
    const currentIndex = active && items.includes(active) ? items.indexOf(active) : -1;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        items[(currentIndex + 1) % items.length].focus();
        break;
      case "ArrowUp":
        e.preventDefault();
        items[(currentIndex - 1 + items.length) % items.length].focus();
        break;
      case "Home":
        e.preventDefault();
        items[0].focus();
        break;
      case "End":
        e.preventDefault();
        items[items.length - 1].focus();
        break;
      case "Tab":
        setOpen(false);
        break;
      case "Escape":
        e.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
        break;
    }
  }

  if (!open) return null;

  return createPortal(
    <div
      ref={contentRef}
      role="menu"
      aria-orientation="vertical"
      onKeyDown={handleContentKeyDown}
      style={{ top: -9999, left: -9999, visibility: "hidden" }}
      className={`fixed z-[70] w-56 bg-[var(--card-bg,var(--surface))] rounded-xl shadow-xl border border-[var(--border)] overflow-hidden animate-dropdown-in p-1.5 ${className}`}
    >
      {children}
    </div>,
    document.body
  );
}

export function DropdownMenuItem({
  onSelect,
  icon,
  children,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { onSelect?: () => void; icon?: ReactNode }) {
  const { setOpen, triggerRef } = useDropdownMenu();
  return (
    <button
      type="button"
      role="menuitem"
      tabIndex={-1}
      onClick={(e) => {
        props.onClick?.(e);
        onSelect?.();
        const activatedByKeyboard = e.detail === 0;
        setOpen(false);
        // Retour du focus au déclencheur uniquement pour l'activation clavier
        // (la souris n'impose pas de focusring sur le bouton •••).
        if (activatedByKeyboard) triggerRef.current?.focus();
      }}
      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-[var(--foreground)] hover:bg-[var(--surface-hover)] transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent ${className}`}
      {...props}
    >
      {icon && <span className="flex-shrink-0">{icon}</span>}
      {children}
    </button>
  );
}

export function DropdownMenuLabel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p className={`px-3 pt-2 pb-1 text-[10px] font-semibold text-[var(--muted-foreground)] uppercase tracking-wider ${className}`}>
      {children}
    </p>
  );
}

export function DropdownMenuSeparator() {
  return <div className="my-1 h-px bg-[var(--border)]" />;
}
