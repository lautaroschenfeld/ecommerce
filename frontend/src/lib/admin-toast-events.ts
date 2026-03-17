"use client";

import {
  notify,
  pushToast,
  subscribeToasts,
  toasts,
  type NotifyInput,
  type ToastAction,
  type ToastInput,
  type ToastVariant,
} from "@/lib/notifications";

// Compatibilidad retroactiva con nombres previos.
export type AdminToastVariant = ToastVariant;
export type AdminToastAction = ToastAction;
export type AdminToastInput = ToastInput;
export type AdminNotifyInput = NotifyInput;

export const pushAdminToast = pushToast;
export const subscribeAdminToasts = subscribeToasts;
export const notifyAdmin = notify;
export const adminNotify = toasts;
