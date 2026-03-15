"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { X as XIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  focusFirstOverlayElement,
  isTopOverlaySurface,
  restoreFocus,
  trapOverlayTabKey,
} from "@/components/ui/overlay-a11y";
import styles from "./dialog.module.css";

type DialogCtx = {
  open: boolean;
  setOpen: (open: boolean) => void;
  titleId: string;
  descriptionId: string;
  hasTitle: boolean;
  hasDescription: boolean;
  setHasTitle: React.Dispatch<React.SetStateAction<boolean>>;
  setHasDescription: React.Dispatch<React.SetStateAction<boolean>>;
};

const DialogContext = React.createContext<DialogCtx | null>(null);

function useDialogContext() {
  const ctx = React.useContext(DialogContext);
  if (!ctx) throw new Error("Dialog components must be used within <Dialog />.");
  return ctx;
}

export function Dialog({
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
    <DialogContext.Provider
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
    </DialogContext.Provider>
  );
}

export function DialogTrigger({
  asChild = false,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  asChild?: boolean;
  children: React.ReactNode;
}) {
  const { setOpen } = useDialogContext();

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

export function DialogContent({
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
  } = useDialogContext();
  const contentRef = React.useRef<HTMLDivElement | null>(null);
  const closeButtonRef = React.useRef<HTMLButtonElement | null>(null);

  React.useEffect(() => {
    if (!open) return;

    const prevOverflow = document.body.style.overflow;
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = "hidden";

    const onKeyDown = (e: KeyboardEvent) => {
      if (!isTopOverlaySurface(contentRef.current)) return;

      if (e.key === "Escape") {
        if (!dismissible) return;
        e.preventDefault();
        setOpen(false);
        return;
      }

      trapOverlayTabKey(e, contentRef.current);
    };

    const onFocusIn = (event: FocusEvent) => {
      const content = contentRef.current;
      if (!content || !isTopOverlaySurface(content)) return;
      if (content.contains(event.target as Node)) return;
      focusFirstOverlayElement(content, closeButtonRef.current);
    };

    const focusTimer = window.setTimeout(() => {
      if (!isTopOverlaySurface(contentRef.current)) return;
      focusFirstOverlayElement(contentRef.current, closeButtonRef.current);
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

  if (!open) return null;

  return createPortal(
    <div
      className={styles.overlay}
      data-ui-overlay-root="true"
      onMouseDown={() => {
        if (!dismissible) return;
        setOpen(false);
      }}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={hasTitle ? titleId : undefined}
        aria-describedby={hasDescription ? descriptionId : undefined}
        className={cn(styles.content, className)}
        ref={contentRef}
        data-ui-overlay-surface="true"
        onMouseDown={(e) => e.stopPropagation()}
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
      </div>
    </div>,
    document.body
  );
}

export function DialogHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn(styles.header, className)} {...props} />;
}

export function DialogTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  const { titleId, setHasTitle } = useDialogContext();

  React.useEffect(() => {
    setHasTitle(true);
    return () => setHasTitle(false);
  }, [setHasTitle]);

  return <h2 id={props.id ?? titleId} className={cn(styles.title, className)} {...props} />;
}

export function DialogDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  const { descriptionId, setHasDescription } = useDialogContext();

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

export function DialogFooter({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn(styles.footer, className)} {...props} />;
}
