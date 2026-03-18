"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Edit3 } from "lucide-react";

import { useCustomerOrders, useCustomerSession } from "@/lib/customer-auth";
import { notify } from "@/lib/notifications";
import { mapFriendlyError } from "@/lib/user-facing-errors";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MoneyAmount } from "@/components/ui/money-amount";
import { CustomerAccountLayout } from "@/components/shared/customer-account-layout";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import styles from "./customer-account-home-page.module.css";

function formatOrderDate(timestamp: number) {
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(timestamp));
}

function orderStatusLabel(status: string) {
  const key = String(status || "").trim().toLowerCase();
  if (key === "delivered") return "Entregada";
  if (key === "out_for_delivery") return "En reparto";
  if (key === "in_transit") return "En tránsito";
  if (key === "dispatched" || key === "shipped") return "Despachada / Enviada";
  if (key === "ready_to_dispatch") return "Lista para despacho";
  if (key === "ready_pickup") return "Lista para retiro";
  if (key === "preparing") return "En preparación";
  if (key === "cancelled") return "Cancelada";
  return "Orden recibida";
}

type HomeContentProps = {
  session: ReturnType<typeof useCustomerSession>;
  customer: NonNullable<ReturnType<typeof useCustomerSession>["customer"]>;
  orders: ReturnType<typeof useCustomerOrders>["orders"];
  loading: boolean;
};

type ProfileSection = "personal" | "security" | "address";

function HomeContent({ session, customer, orders, loading }: HomeContentProps) {
  const didSyncAddresses = useRef(false);
  const [activeSection, setActiveSection] = useState<ProfileSection | null>(null);
  const [saving, setSaving] = useState(false);
  const [formMessage, setFormMessage] = useState<string | null>(null);

  const [personalFirstName, setPersonalFirstName] = useState(customer.firstName);
  const [personalLastName, setPersonalLastName] = useState(customer.lastName);
  const [personalDocument, setPersonalDocument] = useState(customer.documentNumber);
  const [personalPhone, setPersonalPhone] = useState(customer.phone);
  const [personalWhatsapp, setPersonalWhatsapp] = useState(customer.whatsapp);

  const [securityEmail, setSecurityEmail] = useState(customer.email);
  const [securityCurrentPassword, setSecurityCurrentPassword] = useState("");
  const [securityNewPassword, setSecurityNewPassword] = useState("");
  const [securityConfirmPassword, setSecurityConfirmPassword] = useState("");

  const [addressRecipient, setAddressRecipient] = useState("");
  const [addressPhone, setAddressPhone] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [addressCity, setAddressCity] = useState("");
  const [addressProvince, setAddressProvince] = useState("");
  const [addressPostalCode, setAddressPostalCode] = useState("");

  useEffect(() => {
    if (didSyncAddresses.current) return;
    didSyncAddresses.current = true;
    void session.syncAddresses();
  }, [session]);

  const recentOrders = orders.slice(0, 4);
  const defaultAddress = useMemo(
    () => session.addresses.find((address) => address.isDefault) ?? session.addresses[0] ?? null,
    [session.addresses]
  );

  const resetEditorState = (section: ProfileSection) => {
    setFormMessage(null);

    if (section === "personal") {
      setPersonalFirstName(customer.firstName);
      setPersonalLastName(customer.lastName);
      setPersonalDocument(customer.documentNumber || "");
      setPersonalPhone(customer.phone || "");
      setPersonalWhatsapp(customer.whatsapp || "");
      return;
    }

    if (section === "security") {
      setSecurityEmail(customer.email);
      setSecurityCurrentPassword("");
      setSecurityNewPassword("");
      setSecurityConfirmPassword("");
      return;
    }

    setAddressRecipient(
      defaultAddress?.recipient || `${customer.firstName} ${customer.lastName}`.trim()
    );
    setAddressPhone(defaultAddress?.phone || customer.phone || "");
    setAddressLine1(defaultAddress?.line1 || "");
    setAddressLine2(defaultAddress?.line2 || "");
    setAddressCity(defaultAddress?.city || "");
    setAddressProvince(defaultAddress?.province || "");
    setAddressPostalCode(defaultAddress?.postalCode || "");
  };

  const openEditor = (section: ProfileSection) => {
    resetEditorState(section);
    setActiveSection(section);
  };

  const closeEditor = () => {
    if (saving) return;
    setActiveSection(null);
    setFormMessage(null);
  };

  const submitEditor = async () => {
    if (!activeSection) return;
    setFormMessage(null);

    try {
      setSaving(true);

      if (activeSection === "personal") {
        if (!personalFirstName.trim() || !personalLastName.trim()) {
          setFormMessage("Nombre y apellido son obligatorios.");
          return;
        }

        await session.updateProfile({
          firstName: personalFirstName,
          lastName: personalLastName,
          documentNumber: personalDocument,
          phone: personalPhone,
          whatsapp: personalWhatsapp,
        });

        notify("Información personal actualizada.", undefined, "success");
        setActiveSection(null);
        return;
      }

      if (activeSection === "security") {
        const nextEmail = securityEmail.trim().toLowerCase();
        if (!nextEmail || !nextEmail.includes("@")) {
          setFormMessage("Ingresa un correo válido.");
          return;
        }

        const wantsPasswordChange =
          securityCurrentPassword.trim() ||
          securityNewPassword.trim() ||
          securityConfirmPassword.trim();

        if (nextEmail !== customer.email) {
          await session.updateProfile({ email: nextEmail });
        }

        if (wantsPasswordChange) {
          if (
            !securityCurrentPassword.trim() ||
            !securityNewPassword.trim() ||
            !securityConfirmPassword.trim()
          ) {
            setFormMessage("Completá contraseña actual, nueva y confirmación.");
            return;
          }
          if (securityNewPassword !== securityConfirmPassword) {
            setFormMessage("La nueva contraseña y la confirmación no coinciden.");
            return;
          }

          await session.changePassword(securityCurrentPassword, securityNewPassword);
        }

        notify("Correo y contraseña actualizados.", undefined, "success");
        setActiveSection(null);
        return;
      }

      if (
        !addressLine1.trim() ||
        !addressCity.trim() ||
        !addressProvince.trim() ||
        !addressPostalCode.trim()
      ) {
        setFormMessage("Completá dirección, ciudad, provincia y código postal.");
        return;
      }

      const addressPayload = {
        label: "Principal",
        recipient: addressRecipient.trim(),
        phone: addressPhone.trim(),
        line1: addressLine1.trim(),
        line2: addressLine2.trim(),
        city: addressCity.trim(),
        province: addressProvince.trim(),
        postalCode: addressPostalCode.trim(),
        isDefault: true,
      };

      if (defaultAddress) {
        await session.updateAddress(defaultAddress.id, addressPayload);
      } else {
        await session.addAddress(addressPayload);
      }

      await session.syncAddresses();
      notify("Dirección por defecto actualizada.", undefined, "success");
      setActiveSection(null);
    } catch (error) {
      notify(
        "No se pudo actualizar el perfil.",
        mapFriendlyError(error, "No se pudo actualizar el perfil."),
        "error"
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.pageStack}>
      <Card>
        <CardHeader className={styles.sectionHeader}>
          <CardTitle>Mis pedidos</CardTitle>
        </CardHeader>
        <CardContent className={styles.sectionBody}>
          {loading ? (
            <p className={styles.muted}>Cargando pedidos...</p>
          ) : recentOrders.length === 0 ? (
            <p className={`${styles.muted} ${styles.ordersEmptyMessage}`}>
              Todavía no registramos pedidos en tu cuenta.
            </p>
          ) : (
            <div className={styles.ordersGrid}>
              {recentOrders.map((order) => (
                <Link
                  key={order.id}
                  href={{
                    pathname: "/cuenta/pedidos",
                    query: { orderId: order.id },
                  }}
                  className={styles.orderCard}
                  aria-label={`Ver detalle del pedido ${order.orderNumber}`}
                >
                  <div className={styles.orderCardHead}>
                    <strong>{order.orderNumber}</strong>
                    <Badge variant="outline">{orderStatusLabel(order.status)}</Badge>
                  </div>
                  <p className={styles.meta}>{formatOrderDate(new Date(order.createdAt).getTime())}</p>
                  <p className={styles.meta}>
                    {order.itemCount} producto{order.itemCount === 1 ? "" : "s"}
                  </p>
                  <p className={styles.total}>
                    <MoneyAmount value={order.totalArs} />
                  </p>
                </Link>
              ))}
            </div>
          )}

          {!loading && recentOrders.length > 0 ? (
            <div className={styles.ordersFooter}>
              <Button asChild variant="outline">
                <Link href="/cuenta/pedidos">
                  Ver todos <ArrowRight size={16} />
                </Link>
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className={styles.sectionHeader}>
          <CardTitle>Mi perfil</CardTitle>
        </CardHeader>
        <CardContent className={styles.profileGrid}>
          <button
            type="button"
            className={styles.profileBlockButton}
            onClick={() => openEditor("personal")}
          >
            <span className={styles.profileEditIcon} aria-hidden>
              <Edit3 size={14} />
            </span>
            <h3>Información personal</h3>
            <p>Nombre: {customer.firstName} {customer.lastName}</p>
            <p>Correo: {customer.email}</p>
            <p>DNI: {customer.documentNumber || "Pendiente"}</p>
          </button>

          <button
            type="button"
            className={styles.profileBlockButton}
            onClick={() => openEditor("security")}
          >
            <span className={styles.profileEditIcon} aria-hidden>
              <Edit3 size={14} />
            </span>
            <h3>Correo electrónico y contraseña</h3>
            <p>Correo electrónico:</p>
            <p>{customer.email}</p>
            <p>Contraseña: ********</p>
          </button>

          <button
            type="button"
            className={styles.profileBlockButton}
            onClick={() => openEditor("address")}
          >
            <span className={styles.profileEditIcon} aria-hidden>
              <Edit3 size={14} />
            </span>
            <h3>Dirección de entrega por defecto</h3>
            {defaultAddress ? (
              <>
                <p>
                  {defaultAddress.line1}
                  {defaultAddress.line2 ? `, ${defaultAddress.line2}` : ""}
                </p>
                <p>
                  {defaultAddress.city}, {defaultAddress.province} {defaultAddress.postalCode}
                </p>
              </>
            ) : (
              <p>No hay dirección por defecto guardada.</p>
            )}
          </button>
        </CardContent>
      </Card>

      <Sheet open={Boolean(activeSection)} onOpenChange={(open) => !open && closeEditor()}>
        <SheetContent className={styles.profileSheet}>
          <SheetHeader>
            <SheetTitle>Actualizar mi perfil</SheetTitle>
            <SheetDescription>
              {activeSection === "personal"
                ? "Editá tu información personal."
                : activeSection === "security"
                  ? "Actualiza correo o contraseña."
                  : "Configurá tu dirección de entrega por defecto."}
            </SheetDescription>
          </SheetHeader>

          <div className={styles.sheetBody}>
            {activeSection === "personal" ? (
              <div className={styles.sheetForm}>
                <div className={styles.grid2}>
                  <div className={styles.field}>
                    <Label htmlFor="profile_edit_first_name">Nombre</Label>
                    <Input
                      id="profile_edit_first_name"
                      value={personalFirstName}
                      onChange={(event) => setPersonalFirstName(event.target.value)}
                    />
                  </div>
                  <div className={styles.field}>
                    <Label htmlFor="profile_edit_last_name">Apellido</Label>
                    <Input
                      id="profile_edit_last_name"
                      value={personalLastName}
                      onChange={(event) => setPersonalLastName(event.target.value)}
                    />
                  </div>
                </div>

                <div className={styles.field}>
                  <Label htmlFor="profile_edit_document">DNI o CUIT</Label>
                  <Input
                    id="profile_edit_document"
                    value={personalDocument}
                    onChange={(event) => setPersonalDocument(event.target.value)}
                  />
                </div>

                <div className={styles.grid2}>
                  <div className={styles.field}>
                    <Label htmlFor="profile_edit_phone">Telefono</Label>
                    <Input
                      id="profile_edit_phone"
                      value={personalPhone}
                      onChange={(event) => setPersonalPhone(event.target.value)}
                    />
                  </div>
                  <div className={styles.field}>
                    <Label htmlFor="profile_edit_whatsapp">WhatsApp</Label>
                    <Input
                      id="profile_edit_whatsapp"
                      value={personalWhatsapp}
                      onChange={(event) => setPersonalWhatsapp(event.target.value)}
                    />
                  </div>
                </div>
              </div>
            ) : null}

            {activeSection === "security" ? (
              <div className={styles.sheetForm}>
                <div className={styles.field}>
                  <Label htmlFor="profile_edit_email">Correo electrónico</Label>
                  <Input
                    id="profile_edit_email"
                    type="email"
                    value={securityEmail}
                    onChange={(event) => setSecurityEmail(event.target.value)}
                  />
                </div>

                <div className={styles.field}>
                  <Label htmlFor="profile_edit_current_password">Contraseña actual</Label>
                  <PasswordInput
                    id="profile_edit_current_password"
                    value={securityCurrentPassword}
                    onChange={(event) => setSecurityCurrentPassword(event.target.value)}
                  />
                </div>

                <div className={styles.grid2}>
                  <div className={styles.field}>
                    <Label htmlFor="profile_edit_new_password">Nueva contraseña</Label>
                    <PasswordInput
                      id="profile_edit_new_password"
                      value={securityNewPassword}
                      onChange={(event) => setSecurityNewPassword(event.target.value)}
                    />
                  </div>
                  <div className={styles.field}>
                    <Label htmlFor="profile_edit_confirm_password">Confirmar nueva contraseña</Label>
                    <PasswordInput
                      id="profile_edit_confirm_password"
                      value={securityConfirmPassword}
                      onChange={(event) => setSecurityConfirmPassword(event.target.value)}
                    />
                  </div>
                </div>
              </div>
            ) : null}

            {activeSection === "address" ? (
              <div className={styles.sheetForm}>
                <div className={styles.field}>
                  <Label htmlFor="profile_edit_recipient">Destinatario</Label>
                  <Input
                    id="profile_edit_recipient"
                    value={addressRecipient}
                    onChange={(event) => setAddressRecipient(event.target.value)}
                  />
                </div>

                <div className={styles.field}>
                  <Label htmlFor="profile_edit_line1">Dirección</Label>
                  <Input
                    id="profile_edit_line1"
                    value={addressLine1}
                    onChange={(event) => setAddressLine1(event.target.value)}
                  />
                </div>

                <div className={styles.field}>
                  <Label htmlFor="profile_edit_line2">Depto / Piso</Label>
                  <Input
                    id="profile_edit_line2"
                    value={addressLine2}
                    onChange={(event) => setAddressLine2(event.target.value)}
                  />
                </div>

                <div className={styles.grid2}>
                  <div className={styles.field}>
                    <Label htmlFor="profile_edit_city">Ciudad</Label>
                    <Input
                      id="profile_edit_city"
                      value={addressCity}
                      onChange={(event) => setAddressCity(event.target.value)}
                    />
                  </div>
                  <div className={styles.field}>
                    <Label htmlFor="profile_edit_province">Provincia</Label>
                    <Input
                      id="profile_edit_province"
                      value={addressProvince}
                      onChange={(event) => setAddressProvince(event.target.value)}
                    />
                  </div>
                </div>

                <div className={styles.grid2}>
                  <div className={styles.field}>
                    <Label htmlFor="profile_edit_postal_code">Código postal</Label>
                    <Input
                      id="profile_edit_postal_code"
                      value={addressPostalCode}
                      onChange={(event) => setAddressPostalCode(event.target.value)}
                    />
                  </div>
                  <div className={styles.field}>
                    <Label htmlFor="profile_edit_address_phone">Teléfono de entrega</Label>
                    <Input
                      id="profile_edit_address_phone"
                      value={addressPhone}
                      onChange={(event) => setAddressPhone(event.target.value)}
                    />
                  </div>
                </div>
              </div>
            ) : null}

            {formMessage ? <p className={styles.sheetMessage}>{formMessage}</p> : null}
          </div>

          <SheetFooter className={styles.sheetFooter}>
            <Button type="button" variant="outline" onClick={closeEditor} disabled={saving}>
              Cancelar
            </Button>
            <Button type="button" onClick={() => void submitEditor()} disabled={saving}>
              {saving ? "Guardando..." : "Confirmar"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}

export function CustomerAccountHomePage() {
  const { orders, loading } = useCustomerOrders();

  return (
    <CustomerAccountLayout
      tab="home"
      title="Mi cuenta"
      subtitle="Últimos pedidos, datos personales y accesos rápidos."
    >
      {({ session, customer }) => (
        <HomeContent
          key={customer.email}
          session={session}
          customer={customer}
          orders={orders}
          loading={loading}
        />
      )}
    </CustomerAccountLayout>
  );
}





