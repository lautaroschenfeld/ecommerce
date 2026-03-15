"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import styles from "./confirm-modal.module.css";

type ConfirmVariant = "default" | "destructive";

export type ConfirmModalOptions = {
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: ConfirmVariant;
};

type ConfirmModalProps = ConfirmModalOptions & {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmModal({
  open,
  title,
  description,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  confirmVariant = "destructive",
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent className={styles.content}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <DialogFooter className={styles.footer}>
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            className={styles.cancelButton}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={confirmVariant}
            onClick={onConfirm}
            className={styles.confirmButton}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type ConfirmRequest = {
  options: ConfirmModalOptions;
  resolve: (confirmed: boolean) => void;
};

const DEFAULT_CONFIRM_OPTIONS: Required<
  Pick<ConfirmModalOptions, "confirmLabel" | "cancelLabel" | "confirmVariant">
> = {
  confirmLabel: "Confirmar",
  cancelLabel: "Cancelar",
  confirmVariant: "destructive",
};

export function useConfirmModal(baseOptions?: Partial<ConfirmModalOptions>) {
  const [request, setRequest] = React.useState<ConfirmRequest | null>(null);
  const requestRef = React.useRef<ConfirmRequest | null>(null);

  React.useEffect(() => {
    requestRef.current = request;
  }, [request]);

  React.useEffect(() => {
    return () => {
      requestRef.current?.resolve(false);
      requestRef.current = null;
    };
  }, []);

  const resolveRequest = React.useCallback((confirmed: boolean) => {
    setRequest((current) => {
      if (!current) return null;
      current.resolve(confirmed);
      return null;
    });
  }, []);

  const confirm = React.useCallback(
    (options: ConfirmModalOptions) =>
      new Promise<boolean>((resolve) => {
        setRequest((current) => {
          current?.resolve(false);
          const merged = {
            ...DEFAULT_CONFIRM_OPTIONS,
            ...baseOptions,
            ...options,
          };
          return { options: merged, resolve };
        });
      }),
    [baseOptions]
  );

  const confirmModal = (
    <ConfirmModal
      open={Boolean(request)}
      title={request?.options.title ?? ""}
      description={request?.options.description}
      confirmLabel={request?.options.confirmLabel}
      cancelLabel={request?.options.cancelLabel}
      confirmVariant={request?.options.confirmVariant}
      onCancel={() => resolveRequest(false)}
      onConfirm={() => resolveRequest(true)}
    />
  );

  return {
    confirm,
    confirmModal,
    confirmOpen: Boolean(request),
  };
}
