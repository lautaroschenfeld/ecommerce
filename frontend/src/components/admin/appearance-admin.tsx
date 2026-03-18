"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Crop, Trash2 } from "lucide-react";

import { fetchJsonWithAuthRetry as fetchJson } from "@/lib/store-client";
import { bannerFocusVars } from "@/lib/banner-focus-style";
import { notify } from "@/lib/notifications";
import { toStoreMediaProxyUrl } from "@/lib/store-media-url";
import {
  DEFAULT_STOREFRONT_SETTINGS,
  getAdminStorefrontSettings,
  radiusScaleCssVars,
  updateAdminStorefrontSettings,
} from "@/lib/storefront-settings";

import { AdminPanelCard } from "@/components/admin/admin-panel-card";
import { Button } from "@/components/ui/button";
import { CssVarElement } from "@/components/ui/css-var-element";
import { FilePicker } from "@/components/ui/file-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { HeroBannerEditorDialog } from "./hero-banner-editor-dialog";
import {
  ALLOWED_IMAGE_UPLOAD_MIME,
  clampFontScale,
  clampPercent,
  clampRadiusScale,
  clampZoom,
  mapPanelError,
  parseFontScale,
  parseRadiusScale,
  syncRuntimeStorefront,
  type StorefrontFormState,
} from "./appearance-admin-utils";
import styles from "./appearance-admin.module.css";

function formatRadiusScale(value: number) {
  return String(clampRadiusScale(value));
}

function formatFontScale(value: number) {
  return String(clampFontScale(value));
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

function applyRadiusVars(scaleRaw: number) {
  if (typeof document === "undefined") return;
  const vars = radiusScaleCssVars(scaleRaw);
  const rootStyle = document.documentElement.style;
  const bodyStyle = document.body.style;
  for (const [name, value] of Object.entries(vars)) {
    rootStyle.setProperty(name, value);
    bodyStyle.setProperty(name, value);
  }
}

export function AppearanceAdmin() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [faviconUploading, setFaviconUploading] = useState(false);
  const [bannerUploading, setBannerUploading] = useState(false);
  const [bannerEditorOpen, setBannerEditorOpen] = useState(false);
  const [bannerPreviewFailed, setBannerPreviewFailed] = useState(false);
  const [maintenancePasswordConfigured, setMaintenancePasswordConfigured] =
    useState(false);
  const [committedRadiusScale, setCommittedRadiusScale] = useState(
    DEFAULT_STOREFRONT_SETTINGS.radiusScale
  );
  const [error, setError] = useState<string | null>(null);
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
    fontScale: formatFontScale(DEFAULT_STOREFRONT_SETTINGS.fontScale),
    currencyCode: DEFAULT_STOREFRONT_SETTINGS.currencyCode,
    fontUrl: "",
    maintenanceMode: false,
    maintenancePassword: "",
  });
  const committedRadiusScaleRef = useRef(committedRadiusScale);

  useEffect(() => {
    committedRadiusScaleRef.current = committedRadiusScale;
  }, [committedRadiusScale]);

  useEffect(() => {
    applyRadiusVars(parseRadiusScale(form.radiusScale));
  }, [form.radiusScale]);

  useEffect(() => {
    return () => {
      applyRadiusVars(committedRadiusScaleRef.current);
    };
  }, []);

  useEffect(() => {
    if (loading || saving) return;
    const normalized = form.radiusScale.trim().replace(",", ".");
    if (!normalized) return;

    const parsed = Number(normalized);
    if (!Number.isFinite(parsed)) return;

    const nextScale = clampRadiusScale(parsed);
    if (Math.abs(nextScale - committedRadiusScale) < 0.0001) {
      return;
    }

    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const updated = await updateAdminStorefrontSettings({ radiusScale: nextScale });
          const normalized = clampRadiusScale(updated.radiusScale);
          setCommittedRadiusScale(normalized);
          setForm((prev) => ({ ...prev, radiusScale: formatRadiusScale(normalized) }));
          applyRadiusVars(normalized);
        } catch {}
      })();
    }, 420);

    return () => {
      window.clearTimeout(timer);
    };
  }, [committedRadiusScale, form.radiusScale, loading, saving]);

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
          fontScale: formatFontScale(settings.fontScale),
          currencyCode: settings.currencyCode,
          fontUrl: settings.font?.specimenUrl || settings.font?.cssUrl || "",
          maintenanceMode: settings.maintenanceMode,
          maintenancePassword: "",
        });
        setCommittedRadiusScale(settings.radiusScale);
        setMaintenancePasswordConfigured(settings.maintenancePasswordConfigured);
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
      notify("Logo cargado.", undefined, "success");
    } catch (err) {
      const message = mapPanelError(err, "No se pudo subir el logo.");
      notify("Error al subir el logo", message, "error");
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
      notify("Favicon cargado.", "Guarda configuracion para aplicarlo.", "success");
    } catch (err) {
      const message = mapPanelError(err, "No se pudo subir el favicon.");
      notify("Error al subir el favicon", message, "error");
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
      notify("Banner cargado.", "Ajusta el encuadre antes de guardar.", "success");
    } catch (err) {
      const message = mapPanelError(err, "No se pudo subir el banner.");
      notify("Error al subir el banner", message, "error");
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
    notify("Banner quitado.", "Guarda configuracion para aplicarlo.", "info");
  }

  async function save() {
    setError(null);

    const storeName = form.storeName.trim();
    const hasVisibleLogo = form.logoUrl.trim().length > 0;
    const logoUrl = normalizeMediaPatchValue(form.logoUrl);
    const faviconUrl = normalizeMediaPatchValue(form.faviconUrl);
    const themeMode = form.themeMode;
    const radiusScale = parseRadiusScale(form.radiusScale);
    const fontScale = parseFontScale(form.fontScale);
    const currencyCode = form.currencyCode.trim();
    const fontUrl = form.fontUrl.trim();
    const bannerUrl = normalizeOptionalMediaPatchValue(form.bannerUrl);
    const bannerFocusX = clampPercent(form.bannerFocusX);
    const bannerFocusY = clampPercent(form.bannerFocusY);
    const bannerZoom = clampZoom(form.bannerZoom);
    const maintenancePassword = form.maintenancePassword.trim();

    if (!storeName && !hasVisibleLogo) {
      setError("Necesitas un nombre o un logo para guardar la tienda.");
      return;
    }
    if (form.maintenanceMode && !maintenancePasswordConfigured && !maintenancePassword) {
      setError("Para activar mantenimiento debes definir una clave de acceso.");
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
        fontScale,
        currencyCode,
        fontUrl,
        bannerUrl,
        bannerFocusX: bannerUrl ? bannerFocusX : null,
        bannerFocusY: bannerUrl ? bannerFocusY : null,
        bannerZoom: bannerUrl ? bannerZoom : null,
        maintenanceMode: form.maintenanceMode,
        maintenancePassword: maintenancePassword || undefined,
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
        fontScale: formatFontScale(updated.fontScale),
        currencyCode: updated.currencyCode,
        fontUrl: updated.font?.specimenUrl || updated.font?.cssUrl || "",
        maintenanceMode: updated.maintenanceMode,
        maintenancePassword: "",
      });
      setCommittedRadiusScale(updated.radiusScale);
      setMaintenancePasswordConfigured(updated.maintenancePasswordConfigured);
      syncRuntimeStorefront(updated);
      notify("Configuracion guardada.", undefined, "success");
    } catch (err) {
      const message = mapPanelError(err, "No se pudo guardar la configuracion.");
      notify("Error al guardar la configuracion", message, "error");
    } finally {
      setSaving(false);
    }
  }

  const previewBannerUrl = form.bannerUrl.trim();
  const previewBannerSrc = toStoreMediaProxyUrl(previewBannerUrl) || previewBannerUrl;
  const previewBannerFocusX = clampPercent(form.bannerFocusX);
  const previewBannerFocusY = clampPercent(form.bannerFocusY);
  const previewBannerZoom = clampZoom(form.bannerZoom);

  useEffect(() => {
    setBannerPreviewFailed(false);
  }, [previewBannerSrc]);

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
            <div className={styles.maintenanceToggleRow}>
              <Label htmlFor="admin_maintenance_enabled">Modo mantenimiento</Label>
              <Switch
                id="admin_maintenance_enabled"
                checked={form.maintenanceMode}
                onCheckedChange={(checked) =>
                  setForm((prev) => ({
                    ...prev,
                    maintenanceMode: checked,
                  }))
                }
                disabled={loading || saving}
              />
            </div>
            <p className={styles.maintenanceToggleText}>
              Restringe el acceso con contraseña
            </p>
            {form.maintenanceMode ? (
              <>
                <Label htmlFor="admin_maintenance_password">Contraseña</Label>
                <PasswordInput
                  id="admin_maintenance_password"
                  value={form.maintenancePassword}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      maintenancePassword: event.target.value,
                    }))
                  }
                  wrapperClassName={styles.maintenancePasswordInput}
                  disabled={loading || saving}
                  withRevealToggle
                />
                {maintenancePasswordConfigured ? (
                  <p className={styles.fieldHint}>
                    Hay una clave configurada. Completa este campo solo si quieres cambiarla.
                  </p>
                ) : null}
              </>
            ) : null}
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
                {previewBannerUrl && !bannerPreviewFailed ? (
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
                      src={previewBannerSrc}
                      alt="Preview banner"
                      fill
                      className={styles.bannerPreviewImage}
                      sizes="(max-width: 900px) 100vw, 42rem"
                      loading="lazy"
                      onError={() => {
                        setBannerPreviewFailed(true);
                      }}
                    />
                    <div className={styles.bannerPreviewSafeDesktop} aria-hidden />
                    <div className={styles.bannerPreviewSafeTablet} aria-hidden />
                    <div className={styles.bannerPreviewSafeAll} aria-hidden />
                  </CssVarElement>
                ) : (
                  <div className={styles.bannerPreviewEmpty}>
                    {previewBannerUrl
                      ? "Imágen no disponible."
                      : "No hay banner cargado. Se usa el banner por defecto."}
                  </div>
                )}
              </article>
            </div>
          </div>

          <div className={`${styles.fieldStack} ${styles.span2}`}>
            <div className={styles.fontControlRow}>
              <div className={styles.fontUrlField}>
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
              </div>
              <div className={styles.fontScaleField}>
                <Label htmlFor="admin_font_scale">Escala global de fuente</Label>
                <Input
                  id="admin_font_scale"
                  className={styles.fontScaleInput}
                  type="number"
                  inputMode="decimal"
                  step="0.05"
                  min="0.2"
                  max="2"
                  value={form.fontScale}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      fontScale: event.target.value,
                    }))
                  }
                  disabled={loading || saving}
                  placeholder="1"
                />
              </div>
            </div>
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
            className={styles.saveButton}
            onClick={() => void save()}
            disabled={loading || saving || logoUploading || faviconUploading || bannerUploading}
          >
            {saving ? "Guardando..." : "Guardar configuracion"}
          </Button>
        </div>

        {bannerEditorOpen ? (
          <HeroBannerEditorDialog
            open={bannerEditorOpen}
            imageUrl={previewBannerSrc}
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
      </AdminPanelCard>
    </div>
  );
}
