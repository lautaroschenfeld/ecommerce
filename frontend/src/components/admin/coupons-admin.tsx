"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Edit3, Plus, TicketPercent, Trash2 } from "lucide-react";

import {
  adminCouponsActions,
  type AdminCoupon,
  useAdminCoupons,
} from "@/lib/store-admin-coupons";
import { mapFriendlyError } from "@/lib/user-facing-errors";

import { AdminPanelCard } from "@/components/admin/admin-panel-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { PaginationNav } from "@/components/shared/pagination-nav";
import styles from "./coupons-admin.module.css";

function mapPanelError(error: unknown, fallback: string) {
  return mapFriendlyError(error, fallback);
}

const EMPTY_COUPONS_MESSAGE = "Todavia no hay cupones creados.";

function parsePercentageInput(value: string) {
  const raw = value.trim().replace(",", ".");
  if (!raw) return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0 || n > 100) return undefined;
  if (!/^\d+(\.\d)?$/.test(raw)) return undefined;
  return Number(raw);
}

function formatPercentage(value: number) {
  return `${value.toFixed(1).replace(/\.0$/, "")}%`;
}

function EditCouponDialog({ coupon }: { coupon: AdminCoupon }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [code, setCode] = useState(coupon.code);
  const [title, setTitle] = useState(coupon.title);
  const [percentage, setPercentage] = useState(String(coupon.percentage));
  const [active, setActive] = useState(coupon.active);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setCode(coupon.code);
    setTitle(coupon.title);
    setPercentage(String(coupon.percentage));
    setActive(coupon.active);
  }, [coupon, open]);

  function handleOpenChange(nextOpen: boolean) {
    if (saving) return;
    setOpen(nextOpen);
  }

  async function save() {
    if (saving) return;
    setError(null);
    const parsed = parsePercentageInput(percentage);
    if (!code.trim()) return setError("El codigo es obligatorio.");
    if (!title.trim()) return setError("El titulo es obligatorio.");
    if (parsed === undefined) {
      return setError("Porcentaje invalido. Permitido: 0.1 a 100 con 1 decimal.");
    }

    try {
      setSaving(true);
      await adminCouponsActions.update(coupon.id, {
        code,
        title,
        percentage: parsed,
        active,
      });
      setOpen(false);
    } catch (saveError) {
      const message = mapPanelError(saveError, "No se pudo actualizar el cupon.");
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Edit3 size={15} />
          Editar
        </Button>
      </DialogTrigger>
      <DialogContent dismissible={!saving}>
        <DialogHeader>
          <DialogTitle>Editar cupon</DialogTitle>
          <DialogDescription>
            Actualiza codigo, titulo y porcentaje.
          </DialogDescription>
        </DialogHeader>

        <div className={styles.formGrid}>
          <div className={styles.field}>
            <Label htmlFor={`coupon_code_${coupon.id}`}>Codigo</Label>
            <Input
              id={`coupon_code_${coupon.id}`}
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              placeholder="BIENVENIDA10"
              disabled={saving}
            />
          </div>
          <div className={styles.field}>
            <Label htmlFor={`coupon_percentage_${coupon.id}`}>Descuento (%)</Label>
            <Input
              id={`coupon_percentage_${coupon.id}`}
              value={percentage}
              onChange={(event) => setPercentage(event.target.value)}
              placeholder="10 o 10.5"
              inputMode="decimal"
              disabled={saving}
            />
          </div>
          <div className={styles.field}>
            <Label htmlFor={`coupon_title_${coupon.id}`}>Titulo</Label>
            <Input
              id={`coupon_title_${coupon.id}`}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Promo de bienvenida"
              disabled={saving}
            />
          </div>
          <div className={styles.field}>
            <Label htmlFor={`coupon_active_${coupon.id}`}>Estado</Label>
            <Select
              id={`coupon_active_${coupon.id}`}
              value={active ? "active" : "inactive"}
              onChange={(event) => setActive(event.target.value === "active")}
              disabled={saving}
            >
              <option value="active">Activo</option>
              <option value="inactive">Inactivo</option>
            </Select>
          </div>
        </div>

        {error ? <div className={styles.errorBox}>{error}</div> : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? "Guardando..." : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteCouponDialog({ coupon }: { coupon: AdminCoupon }) {
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
  }, [open]);

  function handleOpenChange(nextOpen: boolean) {
    if (deleting) return;
    setOpen(nextOpen);
  }

  async function removeCoupon() {
    if (deleting) return;

    try {
      setDeleting(true);
      setError(null);
      await adminCouponsActions.remove(coupon.id);
      setOpen(false);
    } catch (removeError) {
      setError(mapPanelError(removeError, "No se pudo eliminar el cupon."));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Trash2 size={15} />
          Eliminar
        </Button>
      </DialogTrigger>
      <DialogContent dismissible={!deleting}>
        <DialogHeader>
          <DialogTitle>Eliminar cupon</DialogTitle>
          <DialogDescription>
            Esta accion elimina el cupon <strong>{coupon.code}</strong> de la tienda.
          </DialogDescription>
        </DialogHeader>

        {error ? <div className={styles.errorBox}>{error}</div> : null}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={deleting}
          >
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={() => void removeCoupon()}
            disabled={deleting}
          >
            {deleting ? "Eliminando..." : "Eliminar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type CouponsAdminMode = "list" | "create";

type CouponsAdminProps = {
  mode?: CouponsAdminMode;
};

export function CouponsAdmin({ mode = "list" }: CouponsAdminProps) {
  const router = useRouter();
  const isCreateMode = mode === "create";
  const isListMode = mode === "list";
  const {
    coupons,
    count,
    loading,
    error: loadError,
    currentPage,
    totalPages,
    pageFrom,
    pageTo,
    setPage,
  } = useAdminCoupons({ enabled: isListMode });

  const [code, setCode] = useState("");
  const [title, setTitle] = useState("");
  const [percentage, setPercentage] = useState("");
  const [active, setActive] = useState(true);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function createCoupon() {
    setFormError(null);

    const parsedPercentage = parsePercentageInput(percentage);
    if (!code.trim()) return setFormError("Ingresa un codigo.");
    if (!title.trim()) return setFormError("Ingresa un titulo.");
    if (parsedPercentage === undefined) {
      return setFormError("Porcentaje invalido. Permitido: 0.1 a 100 con 1 decimal.");
    }

    try {
      setBusy(true);
      await adminCouponsActions.create({
        code,
        title,
        percentage: parsedPercentage,
        active,
      });

      setCode("");
      setTitle("");
      setPercentage("");
      setActive(true);
      if (isCreateMode) {
        router.replace("/cuenta/administracion/promociones");
        return;
      }
    } catch (createError) {
      const message = mapPanelError(createError, "No se pudo crear el cupon.");
      setFormError(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.page}>
      {isCreateMode ? (
        <AdminPanelCard
          title="Nuevo cupon"
          subtitle="Define codigo, porcentaje y estado desde el mismo formulario del panel."
          className={styles.card}
          bodyClassName={styles.cardBody}
        >
          <form
            className={styles.formGrid}
            onSubmit={(event) => {
              event.preventDefault();
              void createCoupon();
            }}
          >
            <div className={styles.field}>
              <Label htmlFor="coupon_code">Codigo</Label>
              <Input
                id="coupon_code"
                value={code}
                onChange={(event) => setCode(event.target.value.toUpperCase())}
                placeholder="BIENVENIDA10"
                disabled={busy}
              />
            </div>
            <div className={styles.field}>
              <Label htmlFor="coupon_percentage">Descuento (%)</Label>
              <Input
                id="coupon_percentage"
                value={percentage}
                onChange={(event) => setPercentage(event.target.value)}
                placeholder="10 o 10.5"
                inputMode="decimal"
                disabled={busy}
              />
            </div>
            <div className={styles.field}>
              <Label htmlFor="coupon_title">Titulo</Label>
              <Input
                id="coupon_title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Promo de bienvenida"
                disabled={busy}
              />
            </div>
            <div className={styles.field}>
              <Label htmlFor="coupon_status">Estado</Label>
              <Select
                id="coupon_status"
                value={active ? "active" : "inactive"}
                onChange={(event) => setActive(event.target.value === "active")}
                disabled={busy}
              >
                <option value="active">Activo</option>
                <option value="inactive">Inactivo</option>
              </Select>
            </div>

            {formError ? <div className={styles.errorBox}>{formError}</div> : null}

            <div className={styles.formActions}>
              <Button type="submit" disabled={busy}>
                <Plus size={15} />
                {busy ? "Creando..." : "Crear cupon"}
              </Button>
            </div>
          </form>
        </AdminPanelCard>
      ) : null}

      {isListMode ? (
        <AdminPanelCard
          title="Cupones cargados"
          subtitle={
            loading
              ? "Cargando cupones..."
              : count > 0
              ? `Mostrando ${pageFrom}-${pageTo} de ${count} cupon${count === 1 ? "" : "es"}.`
              : undefined
          }
          className={styles.card}
          bodyClassName={styles.listPanelBody}
          headerRight={
            <Badge variant="secondary">
              {count} {count === 1 ? "cupon" : "cupones"}
            </Badge>
          }
        >
          {loading ? (
            <div className={styles.empty}>Cargando cupones...</div>
          ) : loadError ? (
            <div className={styles.empty}>{loadError}</div>
          ) : coupons.length === 0 ? (
            <div className={styles.empty}>{EMPTY_COUPONS_MESSAGE}</div>
          ) : (
            <>
              <div className={styles.list}>
                {coupons.map((coupon) => (
                  <Card key={coupon.id} className={`adminPanelSurface ${styles.card}`}>
                    <CardContent className={`adminPanelContentSurface ${styles.listItem}`}>
                      <div className={styles.itemMain}>
                        <div className={styles.itemIcon}>
                          <TicketPercent size={16} />
                        </div>
                        <div className={styles.itemText}>
                          <p className={styles.itemTitle}>{coupon.title}</p>
                          <p className={styles.itemMeta}>
                            Codigo <span className={styles.code}>{coupon.code}</span> - {formatPercentage(coupon.percentage)} OFF - Usado {coupon.usedCount} veces
                          </p>
                        </div>
                      </div>
                      <div className={styles.itemActions}>
                        <Badge variant={coupon.active ? "secondary" : "outline"}>
                          {coupon.active ? "Activo" : "Inactivo"}
                        </Badge>
                        <EditCouponDialog coupon={coupon} />
                        <DeleteCouponDialog coupon={coupon} />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <div className={styles.paginationFooter}>
                <PaginationNav
                  page={currentPage}
                  totalPages={totalPages}
                  disabled={loading}
                  onPageChange={setPage}
                  ariaLabel="Paginacion de cupones"
                />
              </div>
            </>
          )}
        </AdminPanelCard>
      ) : null}
    </div>
  );
}
