"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Crop, Trash2 } from "lucide-react";

import { fetchJsonWithAuthRetry as fetchJson } from "@/lib/store-client";
import { bannerFocusVars } from "@/lib/banner-focus-style";
import {
  DEFAULT_STOREFRONT_SETTINGS,
  getAdminStorefrontSettings,
  updateAdminStorefrontSettings,
} from "@/lib/storefront-settings";

import { AdminPanelCard } from "@/components/admin/admin-panel-card";
import { Button } from "@/components/ui/button";
import { CssVarElement } from "@/components/ui/css-var-element";
import { FilePicker } from "@/components/ui/file-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { HeroBannerEditorDialog } from "./hero-banner-editor-dialog";
import {
  ALLOWED_IMAGE_UPLOAD_MIME,
  clampPercent,
  clampRadiusScale,
  clampZoom,
  mapPanelError,
  parseRadiusScale,
  syncRuntimeStorefront,
  type StorefrontFormState,
} from "./appearance-admin-utils";
import styles from "./appearance-admin.module.css";

function formatRadiusScale(value: number) {
  return String(clampRadiusScale(value));
}

function normalizeMediaPatchValue(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("/")) return undefined;
  return trimmed;
}

function normalizeOptionalMediaPatchValue(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("/")) return undefined;
  return trimmed;
}

export function AppearanceAdmin() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [faviconUploading, setFaviconUploading] = useState(false);
  const [bannerUploading, setBannerUploading] = useState(false);
  const [bannerEditorOpen, setBannerEditorOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState<StorefrontFormState>({
    storeName: DEFAULT_STOREFRONT_SETTINGS.storeName,
    logoUrl: DEFAULT_STOREFRONT_SETTINGS.logoUrl,
    faviconUrl: DEFAULT_STOREFRONT_SETTINGS.faviconUrl,
    bannerUrl: DEFAULT_STOREFRONT_SETTINGS.heroBanner.imageUrl,
    bannerFocusX: DEFAULT_STOREFRONT_SETTINGS.heroBanner.focusX,
    bannerFocusY: DEFAULT_STOREFRONT_SETTINGS.heroBanner.focusY,
    bannerZoom: DEFAULT_STOREFRONT_SETTINGS.heroBanner.zoom,
    themeMode: DEFAULT_STOREFRONT_SETTINGS.themeMode,
    radiusScale: formatRadiusScale(DEFAULT_STOREFRONT_SETTINGS.radiusScale),
    currencyCode: DEFAULT_STOREFRONT_SETTINGS.currencyCode,
    fontUrl: "",
  });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    void getAdminStorefrontSettings()
      .then((settings) => {
        if (cancelled) return;
        setForm({
          storeName: settings.storeName,
          logoUrl: settings.logoUrl,
          faviconUrl: settings.faviconUrl,
          bannerUrl: settings.heroBanner.imageUrl,
          bannerFocusX: clampPercent(settings.heroBanner.focusX),
          bannerFocusY: clampPercent(settings.heroBanner.focusY),
          bannerZoom: clampZoom(settings.heroBanner.zoom),
          themeMode: settings.themeMode,
          radiusScale: formatRadiusScale(settings.radiusScale),
          currencyCode: settings.currencyCode,
          fontUrl: settings.font?.specimenUrl || settings.font?.cssUrl || "",
        });
      })
      .catch((err) => {
        if (cancelled) return;
        setError(mapPanelError(err, "No se pudo cargar la configuracion."));
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function uploadLogo(files: File[]) {
    const file = files[0];
    if (!file) return;

    if (!ALLOWED_IMAGE_UPLOAD_MIME.has(file.type.toLowerCase())) {
      setError("Solo puedes subir imagenes JPG, PNG o WEBP.");
      return;
    }

    try {
      setLogoUploading(true);
      setError(null);
      setMessage(null);

      const body = new FormData();
      body.append("files", file);

      const data = await fetchJson<{ files?: Array<{ url?: unknown }> }>(
        "/store/catalog/account/admin/uploads",
        {
          method: "POST",
          credentials: "include",
          body,
        }
      );

      const uploadedUrl =
        typeof data.files?.[0]?.url === "string" ? data.files[0].url.trim() : "";
      if (!uploadedUrl) {
        throw new Error("upload-missing-url");
      }

      setForm((prev) => ({ ...prev, logoUrl: uploadedUrl }));
      setMessage("Logo cargado.");
    } catch (err) {
      setError(mapPanelError(err, "No se pudo subir el logo."));
    } finally {
      setLogoUploading(false);
    }
  }

  async function uploadFavicon(files: File[]) {
    const file = files[0];
    if (!file) return;

    if (!ALLOWED_IMAGE_UPLOAD_MIME.has(file.type.toLowerCase())) {
      setError("Solo puedes subir imagenes JPG, PNG o WEBP.");
      return;
    }

    try {
      setFaviconUploading(true);
      setError(null);
      setMessage(null);

      const body = new FormData();
      body.append("files", file);

      const data = await fetchJson<{ files?: Array<{ url?: unknown }> }>(
        "/store/catalog/account/admin/uploads?variant=favicon",
        {
          method: "POST",
          credentials: "include",
          body,
        }
      );

      const uploadedUrl =
        typeof data.files?.[0]?.url === "string" ? data.files[0].url.trim() : "";
      if (!uploadedUrl) {
        throw new Error("upload-missing-url");
      }

      setForm((prev) => ({ ...prev, faviconUrl: uploadedUrl }));
      setMessage("Favicon cargado. Guarda configuracion para aplicarlo.");
    } catch (err) {
      setError(mapPanelError(err, "No se pudo subir el favicon."));
    } finally {
      setFaviconUploading(false);
    }
  }

  async function uploadBanner(files: File[]) {
    const file = files[0];
    if (!file) return;

    if (!ALLOWED_IMAGE_UPLOAD_MIME.has(file.type.toLowerCase())) {
      setError("Solo puedes subir imagenes JPG, PNG o WEBP.");
      return;
    }

    try {
      setBannerUploading(true);
      setError(null);
      setMessage(null);

      const body = new FormData();
      body.append("files", file);

      const data = await fetchJson<{ files?: Array<{ url?: unknown }> }>(
        "/store/catalog/account/admin/uploads",
        {
          method: "POST",
          credentials: "include",
          body,
        }
      );

      const uploadedUrl =
        typeof data.files?.[0]?.url === "string" ? data.files[0].url.trim() : "";
      if (!uploadedUrl) {
        throw new Error("upload-missing-url");
      }

      setForm((prev) => ({
        ...prev,
        bannerUrl: uploadedUrl,
        bannerFocusX: 50,
        bannerFocusY: 50,
        bannerZoom: 1,
      }));
      setBannerEditorOpen(true);
      setMessage("Banner cargado. Ajusta el encuadre antes de guardar.");
    } catch (err) {
      setError(mapPanelError(err, "No se pudo subir el banner."));
    } finally {
      setBannerUploading(false);
    }
  }

  function clearBanner() {
    setForm((prev) => ({
      ...prev,
      bannerUrl: "",
      bannerFocusX: 50,
      bannerFocusY: 50,
      bannerZoom: 1,
    }));
    setBannerEditorOpen(false);
    setError(null);
    setMessage("Banner quitado. Guarda configuracion para aplicarlo.");
  }

  async function save() {
    setError(null);
    setMessage(null);

    const storeName = form.storeName.trim();
    const hasVisibleLogo = form.logoUrl.trim().length > 0;
    const logoUrl = normalizeMediaPatchValue(form.logoUrl);
    const faviconUrl = normalizeMediaPatchValue(form.faviconUrl);
    const themeMode = form.themeMode;
    const radiusScale = parseRadiusScale(form.radiusScale);
    const currencyCode = form.currencyCode.trim();
    const fontUrl = form.fontUrl.trim();
    const bannerUrl = normalizeOptionalMediaPatchValue(form.bannerUrl);
    const bannerFocusX = clampPercent(form.bannerFocusX);
    const bannerFocusY = clampPercent(form.bannerFocusY);
    const bannerZoom = clampZoom(form.bannerZoom);

    if (!storeName && !hasVisibleLogo) {
      setError("Necesitas un nombre o un logo para guardar la tienda.");
      return;
    }

    try {
      setSaving(true);
      const updated = await updateAdminStorefrontSettings({
        storeName,
        logoUrl,
        faviconUrl,
        themeMode,
        radiusScale,
        currencyCode,
        fontUrl,
        bannerUrl,
        bannerFocusX: bannerUrl ? bannerFocusX : null,
        bannerFocusY: bannerUrl ? bannerFocusY : null,
        bannerZoom: bannerUrl ? bannerZoom : null,
      });
      setForm({
        storeName: updated.storeName,
        logoUrl: updated.logoUrl,
        faviconUrl: updated.faviconUrl,
        bannerUrl: updated.heroBanner.imageUrl,
        bannerFocusX: clampPercent(updated.heroBanner.focusX),
        bannerFocusY: clampPercent(updated.heroBanner.focusY),
        bannerZoom: clampZoom(updated.heroBanner.zoom),
        themeMode: updated.themeMode,
        radiusScale: formatRadiusScale(updated.radiusScale),
        currencyCode: updated.currencyCode,
        fontUrl: updated.font?.specimenUrl || updated.font?.cssUrl || "",
      });
      syncRuntimeStorefront(updated);
      setMessage("Configuracion guardada.");
    } catch (err) {
      setError(mapPanelError(err, "No se pudo guardar la configuracion."));
    } finally {
      setSaving(false);
    }
  }

  const previewBannerUrl = form.bannerUrl.trim();
  const previewBannerFocusX = clampPercent(form.bannerFocusX);
  const previewBannerFocusY = clampPercent(form.bannerFocusY);
  const previewBannerZoom = clampZoom(form.bannerZoom);

  return (
    <div className={styles.page}>
      <AdminPanelCard
        title="Apariencia de la tienda"
        className={styles.card}
        bodyClassName={styles.cardBody}
      >
        <div className={styles.formGrid}>
          <div className={`${styles.identityGrid} ${styles.span2}`}>
            <div className={styles.fieldStack}>
              <Label htmlFor="admin_store_logo_file">Logo</Label>
              <div className={styles.logoUploadRow}>
                <FilePicker
                  id="admin_store_logo_file"
                  accept="image/png,image/jpeg,image/webp"
                  size="sm"
                  className={styles.uploadPicker}
                  placeholder="Subir logo"
                  onFiles={(files) => void uploadLogo(files)}
                  disabled={loading || saving || logoUploading || faviconUploading}
                />
                {form.logoUrl.trim() ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    className={styles.uploadIconButton}
                    title="Quitar logo"
                    aria-label="Quitar logo"
                    onClick={() => setForm((prev) => ({ ...prev, logoUrl: "" }))}
                    disabled={loading || saving || logoUploading || faviconUploading}
                  >
                    <Trash2 />
                  </Button>
                ) : null}
              </div>
            </div>

            <div className={styles.fieldStack}>
              <Label htmlFor="admin_store_favicon_file">Favicon</Label>
              <div className={styles.logoUploadRow}>
                <FilePicker
                  id="admin_store_favicon_file"
                  accept="image/png,image/jpeg,image/webp"
                  size="sm"
                  className={styles.uploadPicker}
                  placeholder="Subir favicon"
                  onFiles={(files) => void uploadFavicon(files)}
                  disabled={loading || saving || logoUploading || faviconUploading}
                />
                {form.faviconUrl.trim() ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    className={styles.uploadIconButton}
                    title="Quitar favicon"
                    aria-label="Quitar favicon"
                    onClick={() => setForm((prev) => ({ ...prev, faviconUrl: "" }))}
                    disabled={loading || saving || logoUploading || faviconUploading}
                  >
                    <Trash2 />
                  </Button>
                ) : null}
              </div>
            </div>

            <div className={styles.fieldStack}>
              <Label htmlFor="admin_store_name">Nombre de la tienda</Label>
              <Input
                id="admin_store_name"
                value={form.storeName}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    storeName: event.target.value,
                  }))
                }
                disabled={loading || saving}
                placeholder="Mi tienda"
              />
            </div>

            <div className={styles.fieldStack}>
              <Label htmlFor="admin_store_currency">Moneda</Label>
              <Select
                id="admin_store_currency"
                value={form.currencyCode}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    currencyCode: event.target.value,
                  }))
                }
                disabled={loading || saving}
              >
                <option value="ARS">ARS (Peso argentino)</option>
                <option value="USD">USD (Dolar)</option>
                <option value="EUR">EUR (Euro)</option>
                <option value="BRL">BRL (Real)</option>
                <option value="CLP">CLP (Peso chileno)</option>
                <option value="UYU">UYU (Peso uruguayo)</option>
              </Select>
            </div>
          </div>

          <div className={`${styles.settingsGrid} ${styles.span2}`}>
            <div className={styles.fieldStack}>
              <Label htmlFor="admin_theme_mode">Tema global</Label>
              <Select
                id="admin_theme_mode"
                value={form.themeMode}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    themeMode: event.target.value === "dark" ? "dark" : "light",
                  }))
                }
                disabled={loading || saving}
              >
                <option value="light">Claro</option>
                <option value="dark">Oscuro</option>
              </Select>
            </div>

            <div className={styles.fieldStack}>
              <Label htmlFor="admin_radius_scale">Multiplicador de redondeo global</Label>
              <Input
                id="admin_radius_scale"
                type="number"
                inputMode="decimal"
                step="0.05"
                min="0"
                max="2"
                value={form.radiusScale}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    radiusScale: event.target.value,
                  }))
                }
                disabled={loading || saving}
                placeholder="1"
              />
            </div>
          </div>

          <div className={`${styles.fieldStack} ${styles.span2}`}>
            <Label htmlFor="admin_store_banner_file">Banner del hero</Label>
            <div className={styles.bannerGroup}>
              <div className={styles.bannerUploadRow}>
                <FilePicker
                  id="admin_store_banner_file"
                  accept="image/png,image/jpeg,image/webp"
                  size="sm"
                  className={styles.uploadPicker}
                  placeholder="Subir banner"
                  onFiles={(files) => void uploadBanner(files)}
                  disabled={loading || saving || bannerUploading}
                />
                {previewBannerUrl ? (
                  <div className={styles.uploadActions}>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-sm"
                      className={styles.uploadIconButton}
                      title="Ajustar encuadre"
                      aria-label="Ajustar encuadre"
                      onClick={() => setBannerEditorOpen(true)}
                      disabled={loading || saving || bannerUploading}
                    >
                      <Crop />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-sm"
                      className={styles.uploadIconButton}
                      title="Quitar banner"
                      aria-label="Quitar banner"
                      onClick={clearBanner}
                      disabled={loading || saving || bannerUploading}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                ) : null}
              </div>
              <article className={styles.bannerPreview}>
                {previewBannerUrl ? (
                  <CssVarElement
                    as="div"
                    className={styles.bannerPreviewMedia}
                    vars={bannerFocusVars(
                      previewBannerFocusX,
                      previewBannerFocusY,
                      previewBannerZoom
                    )}
                  >
                    <Image
                      src={previewBannerUrl}
                      alt="Preview banner"
                      fill
                      className={styles.bannerPreviewImage}
                      sizes="(max-width: 900px) 100vw, 42rem"
                      loading="lazy"
                    />
                    <div className={styles.bannerPreviewSafeDesktop} aria-hidden />
                    <div className={styles.bannerPreviewSafeTablet} aria-hidden />
                    <div className={styles.bannerPreviewSafeAll} aria-hidden />
                  </CssVarElement>
                ) : (
                  <div className={styles.bannerPreviewEmpty}>
                    No hay banner cargado. Se usa el banner por defecto.
                  </div>
                )}
              </article>
            </div>
          </div>

          <div className={`${styles.fieldStack} ${styles.span2}`}>
            <Label htmlFor="admin_store_font_url">Fuente</Label>
            <Input
              id="admin_store_font_url"
              value={form.fontUrl}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  fontUrl: event.target.value,
                }))
              }
              disabled={loading || saving}
              placeholder="https://fonts.google.com/specimen/Geist"
            />
            <p className={styles.fieldHint}>
              Busca la fuente en{" "}
              <a href="https://fonts.google.com/" target="_blank" rel="noopener noreferrer">
                Google Fonts
              </a>{" "}
              y pega aqui el enlace de la fuente.
            </p>
          </div>

        </div>

        <div className={styles.actionsRow}>
          <Button
            type="button"
            onClick={() => void save()}
            disabled={loading || saving || logoUploading || faviconUploading || bannerUploading}
          >
            {saving ? "Guardando..." : "Guardar configuracion"}
          </Button>
        </div>

        {bannerEditorOpen ? (
          <HeroBannerEditorDialog
            open={bannerEditorOpen}
            imageUrl={previewBannerUrl}
            initialFocusX={previewBannerFocusX}
            initialFocusY={previewBannerFocusY}
            initialZoom={previewBannerZoom}
            onCancel={() => setBannerEditorOpen(false)}
            onApply={(next) => {
              setForm((prev) => ({
                ...prev,
                bannerFocusX: next.focusX,
                bannerFocusY: next.focusY,
                bannerZoom: next.zoom,
              }));
              setBannerEditorOpen(false);
            }}
          />
        ) : null}

        {error ? <p className={styles.error}>{error}</p> : null}
        {message ? <p className={styles.ok}>{message}</p> : null}
      </AdminPanelCard>
    </div>
  );
}
