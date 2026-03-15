"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { X as XIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  focusFirstOverlayElement,
  isTopOverlaySurface,
  restoreFocus,
  trapOverlayTabKey,
} from "@/components/ui/overlay-a11y";
import styles from "./sheet.module.css";

type SheetCtx = {
  open: boolean;
  setOpen: (open: boolean) => void;
  titleId: string;
  descriptionId: string;
  hasTitle: boolean;
  hasDescription: boolean;
  setHasTitle: React.Dispatch<React.SetStateAction<boolean>>;
  setHasDescription: React.Dispatch<React.SetStateAction<boolean>>;
};

const SheetContext = React.createContext<SheetCtx | null>(null);

function useSheetContext() {
  const ctx = React.useContext(SheetContext);
  if (!ctx) throw new Error("Sheet components must be used within <Sheet />.");
  return ctx;
}

export function Sheet({
  open: openProp,
  onOpenChange,
  children,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}) {
  const [uncontrolled, setUncontrolled] = React.useState(false);
  const [hasTitle, setHasTitle] = React.useState(false);
  const [hasDescription, setHasDescription] = React.useState(false);
  const open = openProp ?? uncontrolled;
  const titleId = React.useId();
  const descriptionId = React.useId();

  const setOpen = React.useCallback(
    (next: boolean) => {
      onOpenChange?.(next);
      if (openProp === undefined) setUncontrolled(next);
    },
    [onOpenChange, openProp]
  );

  return (
    <SheetContext.Provider
      value={{
        open,
        setOpen,
        titleId,
        descriptionId,
        hasTitle,
        hasDescription,
        setHasTitle,
        setHasDescription,
      }}
    >
      {children}
    </SheetContext.Provider>
  );
}

export function SheetTrigger({
  asChild = false,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  asChild?: boolean;
  children: React.ReactNode;
}) {
  const { setOpen } = useSheetContext();

  if (asChild) {
    const child = React.Children.only(children) as React.ReactElement<{
      onClick?: React.MouseEventHandler;
      className?: string;
    }>;

    return React.cloneElement(child, {
      ...props,
      onClick: (e: React.MouseEvent) => {
        child.props.onClick?.(e);
        if (e.defaultPrevented) return;
        setOpen(true);
      },
    });
  }

  return (
    <button
      type="button"
      {...props}
      onClick={(e) => {
        props.onClick?.(e);
        if (e.defaultPrevented) return;
        setOpen(true);
      }}
    >
      {children}
    </button>
  );
}

export function SheetClose({
  asChild = false,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  asChild?: boolean;
  children: React.ReactNode;
}) {
  const { setOpen } = useSheetContext();

  if (asChild) {
    const child = React.Children.only(children) as React.ReactElement<{
      onClick?: React.MouseEventHandler;
      className?: string;
    }>;

    return React.cloneElement(child, {
      ...props,
      onClick: (e: React.MouseEvent) => {
        child.props.onClick?.(e);
        if (e.defaultPrevented) return;
        setOpen(false);
      },
    });
  }

  return (
    <button
      type="button"
      {...props}
      onClick={(e) => {
        props.onClick?.(e);
        if (e.defaultPrevented) return;
        setOpen(false);
      }}
    >
      {children}
    </button>
  );
}

export function SheetContent({
  className,
  dismissible = true,
  children,
}: {
  className?: string;
  dismissible?: boolean;
  children: React.ReactNode;
}) {
  const {
    open,
    setOpen,
    titleId,
    descriptionId,
    hasTitle,
    hasDescription,
  } = useSheetContext();
  const reduceMotion = useReducedMotion();
  const panelRef = React.useRef<HTMLDivElement | null>(null);
  const closeButtonRef = React.useRef<HTMLButtonElement | null>(null);

  React.useEffect(() => {
    if (!open) return;

    const prevOverflow = document.body.style.overflow;
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = "hidden";

    const onKeyDown = (e: KeyboardEvent) => {
      if (!isTopOverlaySurface(panelRef.current)) return;

      if (e.key === "Escape") {
        if (!dismissible) return;
        e.preventDefault();
        setOpen(false);
        return;
      }

      trapOverlayTabKey(e, panelRef.current);
    };

    const onFocusIn = (event: FocusEvent) => {
      const panel = panelRef.current;
      if (!panel || !isTopOverlaySurface(panel)) return;
      if (panel.contains(event.target as Node)) return;
      focusFirstOverlayElement(panel, closeButtonRef.current);
    };

    const focusTimer = window.setTimeout(() => {
      if (!isTopOverlaySurface(panelRef.current)) return;
      focusFirstOverlayElement(panelRef.current, closeButtonRef.current);
    }, 0);

    window.addEventListener("keydown", onKeyDown);
    document.addEventListener("focusin", onFocusIn);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("focusin", onFocusIn);
      document.body.style.overflow = prevOverflow;
      restoreFocus(previousFocus);
    };
  }, [dismissible, open, setOpen]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open ? (
        <motion.div
          className={styles.overlay}
          data-ui-overlay-root="true"
          role="presentation"
          onMouseDown={() => {
            if (!dismissible) return;
            setOpen(false);
          }}
          initial={reduceMotion ? undefined : { opacity: 0 }}
          animate={reduceMotion ? undefined : { opacity: 1 }}
          exit={reduceMotion ? undefined : { opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby={hasTitle ? titleId : undefined}
            aria-describedby={hasDescription ? descriptionId : undefined}
            className={cn(styles.panel, className)}
            ref={panelRef}
            data-ui-overlay-surface="true"
            onMouseDown={(e) => e.stopPropagation()}
            initial={
              reduceMotion ? undefined : { x: 28, opacity: 0, scale: 0.98 }
            }
            animate={
              reduceMotion
                ? undefined
                : {
                    x: 0,
                    opacity: 1,
                    scale: 1,
                    transition: { type: "spring", stiffness: 380, damping: 34 },
                  }
            }
            exit={
              reduceMotion
                ? undefined
                : {
                    x: 28,
                    opacity: 0,
                    scale: 0.98,
                    transition: { duration: 0.16 },
                  }
            }
            tabIndex={-1}
          >
            {dismissible ? (
              <button
                type="button"
                ref={closeButtonRef}
                className={styles.close}
                onClick={() => setOpen(false)}
                aria-label="Cerrar"
                title="Cerrar"
              >
                <XIcon size={16} />
              </button>
            ) : null}
            {children}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body
  );
}

export function SheetHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn(styles.header, className)} {...props} />;
}

export function SheetTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  const { titleId, setHasTitle } = useSheetContext();

  React.useEffect(() => {
    setHasTitle(true);
    return () => setHasTitle(false);
  }, [setHasTitle]);

  return <h2 id={props.id ?? titleId} className={cn(styles.title, className)} {...props} />;
}

export function SheetDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  const { descriptionId, setHasDescription } = useSheetContext();

  React.useEffect(() => {
    setHasDescription(true);
    return () => setHasDescription(false);
  }, [setHasDescription]);

  return (
    <p
      id={props.id ?? descriptionId}
      className={cn(styles.description, className)}
      {...props}
    />
  );
}

export function SheetFooter({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn(styles.footer, className)} {...props} />;
}
