"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Copy, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FilePicker } from "@/components/ui/file-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { STORE_BACKEND_URL } from "@/lib/store-client";
import {
  FRIENDLY_ERROR_MESSAGES,
  mapFriendlyError,
  sanitizeUserFacingMessage,
} from "@/lib/user-facing-errors";

import styles from "./page.module.css";

type ComprobanteClientProps = {
  orderId: string;
  token: string;
};

function getPublishableKey() {
  return process.env.NEXT_PUBLIC_PUBLISHABLE_API_KEY?.trim() || "";
}

async function readApiErrorMessage(res: Response) {
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const data: unknown = await res.json().catch(() => null);
    const rec =
      data && typeof data === "object" ? (data as Record<string, unknown>) : null;
    if (rec && typeof rec.message === "string" && rec.message.trim()) {
      return sanitizeUserFacingMessage(
        rec.message,
        FRIENDLY_ERROR_MESSAGES.actionFailed
      );
    }
    return FRIENDLY_ERROR_MESSAGES.actionFailed;
  }
  const text = await res.text().catch(() => "");
  return text.trim()
    ? sanitizeUserFacingMessage(text, FRIENDLY_ERROR_MESSAGES.actionFailed)
    : FRIENDLY_ERROR_MESSAGES.actionFailed;
}

export default function ComprobanteClient({ orderId, token }: ComprobanteClientProps) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{
    text: string;
    tone: "ok" | "bad" | "neutral";
  } | null>(null);
  const [status, setStatus] = useState<{
    uploaded: boolean;
    uploadedAt: string | null;
    fileCount: number;
  } | null>(null);

  const link = useMemo(() => {
    if (!orderId || !token) return "";
    return `${window.location.origin}/comprobante?order=${encodeURIComponent(
      orderId
    )}&token=${encodeURIComponent(token)}`;
  }, [orderId, token]);

  useEffect(() => {
    if (!orderId || !token) return;

    const key = getPublishableKey();
    if (!key) return;

    void (async () => {
      const res = await fetch(
        `${STORE_BACKEND_URL}/store/catalog/checkout/orders/${encodeURIComponent(
          orderId
        )}/transfer-proof?token=${encodeURIComponent(token)}`,
        {
          method: "GET",
          credentials: "include",
          headers: {
            accept: "application/json",
            "x-publishable-api-key": key,
          },
        }
      );

      if (!res.ok) return;
      const data: unknown = await res.json().catch(() => null);
      const payload =
        data && typeof data === "object" ? (data as Record<string, unknown>) : null;
      if (!payload) return;

      setStatus({
        uploaded: Boolean(payload.uploaded),
        uploadedAt: typeof payload.uploaded_at === "string" ? payload.uploaded_at : null,
        fileCount:
          typeof payload.file_count === "number"
            ? payload.file_count
            : Number(payload.file_count) || 0,
      });
    })();
  }, [orderId, token]);

  const copyLink = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setMessage({ text: "Link copiado.", tone: "ok" });
    } catch {
      setMessage({ text: "No se pudo copiar el link.", tone: "bad" });
    }
  };

  const upload = async () => {
    setMessage(null);

    if (!orderId || !token) {
      setMessage({ text: "Falta el link de carga.", tone: "bad" });
      return;
    }
    if (!file) {
      setMessage({ text: "Selecciona un archivo primero.", tone: "neutral" });
      return;
    }

    const key = getPublishableKey();
    if (!key) {
      setMessage({
        text: FRIENDLY_ERROR_MESSAGES.serviceUnavailable,
        tone: "bad",
      });
      return;
    }

    try {
      setBusy(true);

      const form = new FormData();
      form.append("token", token);
      form.append("files", file);

      const res = await fetch(
        `${STORE_BACKEND_URL}/store/catalog/checkout/orders/${encodeURIComponent(
          orderId
        )}/transfer-proof`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "x-publishable-api-key": key,
          },
          body: form,
        }
      );

      if (!res.ok) {
        throw new Error(await readApiErrorMessage(res));
      }

      setFile(null);
      setMessage({
        text: "Comprobante recibido. Queda pendiente de aprobación.",
        tone: "ok",
      });
      setStatus((prev) => ({
        uploaded: true,
        uploadedAt: new Date().toISOString(),
        fileCount: Math.max(1, prev?.fileCount ?? 0),
      }));
    } catch (err) {
      const text = mapFriendlyError(
        err,
        "No pudimos subir el comprobante. Intenta nuevamente."
      );
      setMessage({ text, tone: "bad" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={`container ${styles.inner}`}>
        <div className={styles.header}>
          <Button asChild variant="ghost" size="sm">
            <Link href="/productos">
              <ArrowLeft size={16} />
              Volver al catálogo
            </Link>
          </Button>
          <h1>Subir comprobante</h1>
          <p className={styles.subtitle}>
            Subí una foto o PDF del comprobante de transferencia para que podamos aprobar tu pago.
          </p>
        </div>

        <div className={styles.stack}>
          {!orderId || !token ? (
            <Card>
              <CardHeader>
                <CardTitle>Falta el link</CardTitle>
              </CardHeader>
              <CardContent>
                <p className={styles.message}>
                  Necesitas el link seguro que se muestra al finalizar la compra por transferencia.
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>Link seguro</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className={styles.row}>
                    <div className={styles.grow}>
                      <Input readOnly value={link} />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => void copyLink()}
                      title="Copiar link"
                      aria-label="Copiar link"
                    >
                      <Copy size={16} />
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Comprobante</CardTitle>
                </CardHeader>
                <CardContent>
                  {status?.uploaded ? (
                    <p className={`${styles.message} ${styles.messageOk}`}>
                      Ya hay un comprobante cargado
                      {status.fileCount > 1 ? ` (${status.fileCount})` : ""}.
                    </p>
                  ) : (
                    <p className={styles.message}>Todavía no recibimos el comprobante.</p>
                  )}

                  <div className={`${styles.row} ${styles.rowTopSpacing} ${styles.rowMobileStack}`}>
                    <div className={styles.grow}>
                      <Label htmlFor="proof_file">Archivo (foto o PDF)</Label>
                      <FilePicker
                        id="proof_file"
                        accept="image/jpeg,image/png,image/webp,application/pdf"
                        size="sm"
                        disabled={busy}
                        value={file ? [file] : []}
                        onFiles={(files) => setFile(files[0] ?? null)}
                      />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void upload()}
                      disabled={busy || !file}
                      title="Subir comprobante"
                    >
                      {busy ? "Subiendo..." : "Subir"}
                      <Upload size={16} />
                    </Button>
                  </div>

                  {message ? (
                    <p
                      className={[
                        styles.message,
                        message.tone === "ok"
                          ? styles.messageOk
                          : message.tone === "bad"
                            ? styles.messageBad
                            : "",
                        styles.messageTopSpacing,
                      ].join(" ")}
                    >
                      {message.text}
                    </p>
                  ) : null}
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
