"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import styles from "./global-alert-modal.module.css";

const FALLBACK_MESSAGE = "Se produjo un aviso del sistema.";

function normalizeAlertMessage(input: unknown) {
  if (typeof input === "string") {
    const trimmed = input.trim();
    return trimmed || FALLBACK_MESSAGE;
  }
  if (input === null || input === undefined) return FALLBACK_MESSAGE;
  const text = String(input).trim();
  return text || FALLBACK_MESSAGE;
}

export function GlobalAlertModal() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState(FALLBACK_MESSAGE);

  const queueRef = useRef<string[]>([]);
  const showingRef = useRef(false);
  const pumpRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (typeof window === "undefined") return;

    const nativeAlert = window.alert.bind(window);

    const pump = () => {
      if (showingRef.current) return;
      const next = queueRef.current.shift();
      if (next === undefined) return;
      showingRef.current = true;
      setMessage(next);
      setOpen(true);
    };

    pumpRef.current = pump;

    window.alert = (input?: unknown) => {
      queueRef.current.push(normalizeAlertMessage(input));
      pump();
    };

    return () => {
      window.alert = nativeAlert;
      queueRef.current = [];
      showingRef.current = false;
    };
  }, []);

  function closeModal() {
    setOpen(false);
    showingRef.current = false;
    globalThis.setTimeout(() => {
      pumpRef.current();
    }, 0);
  }

  return (
    <Dialog open={open}>
      <DialogContent className={styles.content} dismissible={false}>
        <DialogHeader>
          <DialogTitle>Aviso</DialogTitle>
          <DialogDescription className={styles.message}>{message}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" onClick={closeModal}>
            Entendido
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

