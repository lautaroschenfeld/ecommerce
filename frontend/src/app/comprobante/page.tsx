import ComprobanteClient from "./comprobante-client";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

export default function ComprobantePage({ searchParams }: PageProps) {
  const orderId = typeof searchParams?.order === "string" ? searchParams.order : "";
  const token = typeof searchParams?.token === "string" ? searchParams.token : "";
  return <ComprobanteClient orderId={orderId} token={token} />;
}

