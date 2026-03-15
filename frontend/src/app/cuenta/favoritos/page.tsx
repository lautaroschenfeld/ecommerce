import { redirect } from "next/navigation";

export default function CuentaFavoritosPage() {
  redirect("/cuenta/listas?tab=favoritos");
}
