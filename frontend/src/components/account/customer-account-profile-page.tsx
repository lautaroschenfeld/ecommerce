"use client";

import { useEffect, useRef, useState } from "react";

import { useCustomerSession } from "@/lib/customer-auth";
import { notify } from "@/lib/notifications";
import { mapFriendlyError } from "@/lib/user-facing-errors";

import { CustomerAccountLayout } from "@/components/shared/customer-account-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import styles from "./customer-account-profile-page.module.css";

type SessionApi = ReturnType<typeof useCustomerSession>;

type ProfileContentProps = {
  session: SessionApi;
  customer: NonNullable<SessionApi["customer"]>;
};

type AddressDraft = {
  label: string;
  recipient: string;
  phone: string;
  line1: string;
  line2: string;
  city: string;
  province: string;
  postalCode: string;
  isDefault: boolean;
};

const EMPTY_ADDRESS: AddressDraft = {
  label: "Casa",
  recipient: "",
  phone: "",
  line1: "",
  line2: "",
  city: "",
  province: "",
  postalCode: "",
  isDefault: false,
};

function ProfileContent({ session, customer }: ProfileContentProps) {
  const [firstName, setFirstName] = useState(customer.firstName);
  const [lastName, setLastName] = useState(customer.lastName);
  const [documentNumber, setDocumentNumber] = useState(customer.documentNumber);
  const [phone, setPhone] = useState(customer.phone);
  const [whatsapp, setWhatsapp] = useState(customer.whatsapp || customer.phone);

  const [notifyEmail, setNotifyEmail] = useState(customer.notifications.email);
  const [notifyWhatsapp, setNotifyWhatsapp] = useState(
    customer.notifications.whatsapp
  );

  const [addressDraft, setAddressDraft] = useState<AddressDraft>(EMPTY_ADDRESS);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [addressMessage, setAddressMessage] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingAddress, setSavingAddress] = useState(false);
  const didLoadAddresses = useRef(false);

  useEffect(() => {
    if (didLoadAddresses.current) return;
    didLoadAddresses.current = true;
    void session.syncAddresses();
  }, [session]);

  async function saveProfile() {
    setProfileMessage(null);

    if (!firstName.trim()) {
      setProfileMessage("Ingresá al menos tu nombre.");
      return;
    }

    if (notifyWhatsapp && !whatsapp.trim()) {
      setProfileMessage("Si activás WhatsApp, necesitamos un número.");
      return;
    }

    try {
      setSavingProfile(true);
      await session.updateProfile({
        firstName,
        lastName,
        documentNumber,
        phone,
        whatsapp,
      });
      await session.setNotifications({
        email: notifyEmail,
        whatsapp: notifyWhatsapp,
      });
      notify("Datos guardados.", undefined, "success");
    } catch (error) {
      notify(
        "No se pudo guardar tu perfil.",
        mapFriendlyError(error, "No se pudo guardar tu perfil."),
        "error"
      );
    } finally {
      setSavingProfile(false);
    }
  }

  async function addAddress() {
    setAddressMessage(null);

    if (!addressDraft.line1.trim() || !addressDraft.city.trim() || !addressDraft.province.trim()) {
      setAddressMessage("Dirección, ciudad y provincia son obligatorias.");
      return;
    }

    try {
      setSavingAddress(true);
      const created = await session.addAddress(addressDraft);
      if (!created) {
        notify("No se pudo guardar la dirección.", undefined, "error");
        return;
      }
      setAddressDraft(EMPTY_ADDRESS);
      notify("Dirección agregada.", undefined, "success");
    } catch (error) {
      notify(
        "No se pudo guardar la dirección.",
        mapFriendlyError(error, "No se pudo guardar la dirección."),
        "error"
      );
    } finally {
      setSavingAddress(false);
    }
  }

  return (
    <div className={styles.layout}>
      <Card>
        <CardHeader>
          <CardTitle>Datos personales</CardTitle>
        </CardHeader>
        <CardContent className={styles.form}>
          <div className={styles.grid2}>
            <div className={styles.field}>
              <Label htmlFor="profile_first_name">Nombre</Label>
              <Input
                id="profile_first_name"
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
              />
            </div>
            <div className={styles.field}>
              <Label htmlFor="profile_last_name">Apellido</Label>
              <Input
                id="profile_last_name"
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
              />
            </div>
          </div>

          <div className={styles.field}>
            <Label htmlFor="profile_email">Email</Label>
            <Input id="profile_email" value={customer.email} readOnly />
          </div>

          <div className={styles.field}>
            <Label htmlFor="profile_document">DNI o CUIT</Label>
            <Input
              id="profile_document"
              value={documentNumber}
              onChange={(event) => setDocumentNumber(event.target.value)}
              placeholder="12345678 o 20301234567"
            />
          </div>

          <div className={styles.grid2}>
            <div className={styles.field}>
              <Label htmlFor="profile_phone">Teléfono</Label>
              <Input
                id="profile_phone"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="11 1234 5678"
              />
            </div>
            <div className={styles.field}>
              <Label htmlFor="profile_whatsapp">WhatsApp</Label>
              <Input
                id="profile_whatsapp"
                value={whatsapp}
                onChange={(event) => setWhatsapp(event.target.value)}
                placeholder="11 1234 5678"
              />
            </div>
          </div>

          <div className={styles.notifications}>
            <div className={styles.checkRow}>
              <Checkbox
                checked={notifyEmail}
                onCheckedChange={(checked) => setNotifyEmail(checked)}
              />
              <span>Notificaciones por email</span>
            </div>
            <div className={styles.checkRow}>
              <Checkbox
                checked={notifyWhatsapp}
                onCheckedChange={(checked) => setNotifyWhatsapp(checked)}
              />
              <span>Notificaciones por WhatsApp</span>
            </div>
          </div>

          {profileMessage ? <p className={styles.message}>{profileMessage}</p> : null}

          <Button type="button" onClick={() => void saveProfile()} disabled={savingProfile}>
            {savingProfile ? "Guardando..." : "Guardar datos"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Direcciónes</CardTitle>
        </CardHeader>
        <CardContent className={styles.addresses}>
          {session.addresses.length === 0 ? (
            <p className={styles.muted}>No hay direcciones guardadas.</p>
          ) : (
            <div className={styles.addressList}>
              {session.addresses.map((address) => (
                <article key={address.id} className={styles.addressItem}>
                  <div className={styles.addressTop}>
                    <strong>{address.label}</strong>
                    {address.isDefault ? (
                      <span className={styles.defaultPill}>Principal</span>
                    ) : null}
                  </div>
                  <p>
                    {address.line1}
                    {address.line2 ? `, ${address.line2}` : ""}
                  </p>
                  <p>
                    {address.city}, {address.province} {address.postalCode}
                  </p>

                  <div className={styles.addressActions}>
                    {!address.isDefault ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void session.setDefaultAddress(address.id)}
                      >
                        Usar como principal
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => void session.removeAddress(address.id)}
                    >
                      Eliminar
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          )}

          <div className={styles.newAddress}>
            <h2>Agregar dirección</h2>

            <div className={styles.grid2}>
              <div className={styles.field}>
                <Label htmlFor="address_label">Etiqueta</Label>
                <Input
                  id="address_label"
                  value={addressDraft.label}
                  onChange={(event) =>
                    setAddressDraft((prev) => ({ ...prev, label: event.target.value }))
                  }
                  placeholder="Casa / Trabajo"
                />
              </div>
              <div className={styles.field}>
                <Label htmlFor="address_recipient">Destinatario</Label>
                <Input
                  id="address_recipient"
                  value={addressDraft.recipient}
                  onChange={(event) =>
                    setAddressDraft((prev) => ({
                      ...prev,
                      recipient: event.target.value,
                    }))
                  }
                />
              </div>
            </div>

            <div className={styles.field}>
              <Label htmlFor="address_line1">Dirección</Label>
              <Input
                id="address_line1"
                value={addressDraft.line1}
                onChange={(event) =>
                  setAddressDraft((prev) => ({ ...prev, line1: event.target.value }))
                }
              />
            </div>

            <div className={styles.field}>
              <Label htmlFor="address_line2">Depto / Piso</Label>
              <Input
                id="address_line2"
                value={addressDraft.line2}
                onChange={(event) =>
                  setAddressDraft((prev) => ({ ...prev, line2: event.target.value }))
                }
              />
            </div>

            <div className={styles.grid3}>
              <div className={styles.field}>
                <Label htmlFor="address_city">Ciudad</Label>
                <Input
                  id="address_city"
                  value={addressDraft.city}
                  onChange={(event) =>
                    setAddressDraft((prev) => ({ ...prev, city: event.target.value }))
                  }
                />
              </div>
              <div className={styles.field}>
                <Label htmlFor="address_province">Provincia</Label>
                <Input
                  id="address_province"
                  value={addressDraft.province}
                  onChange={(event) =>
                    setAddressDraft((prev) => ({
                      ...prev,
                      province: event.target.value,
                    }))
                  }
                />
              </div>
              <div className={styles.field}>
                <Label htmlFor="address_postal">CP</Label>
                <Input
                  id="address_postal"
                  value={addressDraft.postalCode}
                  onChange={(event) =>
                    setAddressDraft((prev) => ({
                      ...prev,
                      postalCode: event.target.value,
                    }))
                  }
                />
              </div>
            </div>

            <div className={styles.grid2}>
              <div className={styles.field}>
                <Label htmlFor="address_phone">Teléfono de entrega</Label>
                <Input
                  id="address_phone"
                  value={addressDraft.phone}
                  onChange={(event) =>
                    setAddressDraft((prev) => ({ ...prev, phone: event.target.value }))
                  }
                />
              </div>
              <label className={styles.checkRow}>
                <Checkbox
                  checked={addressDraft.isDefault}
                  onCheckedChange={(checked) =>
                    setAddressDraft((prev) => ({ ...prev, isDefault: checked }))
                  }
                />
                <span>Definir como principal</span>
              </label>
            </div>

            {addressMessage ? <p className={styles.message}>{addressMessage}</p> : null}

            <Button type="button" onClick={() => void addAddress()} disabled={savingAddress}>
              {savingAddress ? "Guardando..." : "Guardar dirección"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function CustomerAccountProfilePage() {
  return (
    <CustomerAccountLayout
      tab="profile"
      title="Datos personales"
      subtitle="Tu información, direcciones y notificaciones en una sola pantalla."
    >
      {({ session, customer }) => (
        <ProfileContent
          key={customer.email}
          session={session}
          customer={customer}
        />
      )}
    </CustomerAccountLayout>
  );
}

