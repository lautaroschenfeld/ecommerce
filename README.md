# Ecommerce - Dev Commands

Guia tecnica para levantar y trabajar el proyecto local.

## TL;DR

Terminal 1:

```powershell
cd backend
npm run dev:local
```

Si ya tenes PostgreSQL levantado por tu cuenta (sin Docker), podes usar:

```powershell
cd backend
npm run dev
```

Si te aparece `EADDRINUSE` en `:9000`, usa:

```powershell
cd backend
npm run dev:all:clean
```

Terminal 2:

```powershell
cd frontend
npm run dev
```

En macOS tambien tenes lanzadores con doble click desde Finder (raiz del repo):
- `run-all.command`
- `fix-quarantine.command`

`run-all.command`/`dev/run-all-mac.sh` ahora:
- inicia Docker Desktop si no esta corriendo y espera al daemon.
- libera puertos `9000`, `3000` y `3001` antes de levantar servicios.

## Requisitos

- Node.js 20+
- npm 10+
- Docker Desktop corriendo
- Puertos libres: `3000`, `5433`, `9000`

## Variables de entorno

`backend/.env` (minimo):

```env
DATABASE_URL=postgres://postgres:postgres@localhost:5433/store_db
JWT_SECRET=...
COOKIE_SECRET=...
STORE_CURRENCY_CODE=usd
STORE_REGION_NAME=Region principal
STORE_REGION_COUNTRY_CODE=us
PG_CONNECT_TIMEOUT_MS=5000
PG_IDLE_TIMEOUT_MS=30000
CHECKOUT_IDEMPOTENCY_RETENTION_DAYS=14
CHECKOUT_IDEMPOTENCY_CLEANUP_INTERVAL_MS=900000
MAINTENANCE_JOBS_ENABLED=true
MAINTENANCE_TRANSFER_PROOF_INTERVAL_MS=21600000
MAINTENANCE_CHECKOUT_IDEMPOTENCY_INTERVAL_MS=900000
OAUTH_HTTP_TIMEOUT_MS=8000
OAUTH_TOKEN_HTTP_TIMEOUT_MS=8000
OAUTH_JWKS_HTTP_TIMEOUT_MS=8000
MERCADOPAGO_ACCESS_TOKEN=APP_USR-...
MERCADOPAGO_WEBHOOK_SECRET=...
MERCADOPAGO_ALLOW_UNSIGNED_WEBHOOKS=false
MERCADOPAGO_STATEMENT_DESCRIPTOR=MI_TIENDA
MERCADOPAGO_HTTP_TIMEOUT_MS=10000
MERCADOPAGO_ALLOW_INSECURE_URLS=false
```

`frontend/.env.local`:

```env
NEXT_PUBLIC_BACKEND_URL=http://localhost:9000
NEXT_PUBLIC_PUBLISHABLE_API_KEY=pk_...
NEXT_PUBLIC_STORE_LOCALE=es
NEXT_PUBLIC_STORE_CURRENCY_CODE=USD
```

`pk_...` se imprime al correr `npm run seed` en backend.

Moneda/region configurable:
- backend usa `STORE_CURRENCY_CODE` para precios y checkout.
- seed usa `STORE_REGION_NAME` y `STORE_REGION_COUNTRY_CODE`.
- frontend formatea importes con `NEXT_PUBLIC_STORE_LOCALE` + `NEXT_PUBLIC_STORE_CURRENCY_CODE`.

Checkout Pro (Mercado Pago):
- `MERCADOPAGO_ACCESS_TOKEN` habilita la creacion de preferencias y consultas de pagos.
- `MERCADOPAGO_WEBHOOK_SECRET` habilita validacion de firma (`x-signature`).
- En `production`, si falta `MERCADOPAGO_WEBHOOK_SECRET`, el webhook responde `503` salvo que definas `MERCADOPAGO_ALLOW_UNSIGNED_WEBHOOKS=true` (solo para casos excepcionales).
- `STOREFRONT_URL` y `BACKEND_PUBLIC_URL` deben ser publicas y `https` (salvo `MERCADOPAGO_ALLOW_INSECURE_URLS=true` en local).

## Infra (desde la raiz)

```powershell
docker compose up -d postgres
docker compose up -d --build backend frontend redis
docker compose ps
docker compose logs -f backend
docker compose down
docker compose down -v
```

Notas:
- `docker compose up -d postgres` sigue siendo la forma rapida para trabajar con `backend`/`frontend` en modo dev local.
- `docker compose up -d --build backend frontend redis` levanta la stack completa lista para validar despliegue local.
- En la stack completa, `backend` ejecuta `seed` al iniciar para asegurar datos base y una publishable key estable.
- Si queres personalizarla, exporta `NEXT_PUBLIC_PUBLISHABLE_API_KEY` antes de levantar compose.

## Backend (desde `backend/`)

Instalacion:

```powershell
npm install
```

Comando recomendado (arranque completo):

```powershell
npm run dev:local
```

Scripts utiles:

- `npm run dev:local`: docker + check puertos + seed (1ra vez) + backend
- `npm run dev:local:no-seed`: igual, sin seed
- `npm run dev:local:force-seed`: igual, forzando seed
- `npm run setup:local`: prepara DB (seed) y termina sin levantar servidor
- `npm run dev`: solo backend (uso diario, rapido)
- `npm run dev:all`: alias de `npm run dev`
- `npm run dev:all:clean`: libera puerto `9000` y luego ejecuta `dev:all`.
- `npm run seed`: datos iniciales + publishable key
- `npm run build`: build de backend
- `npm run test:unit`
- `npm run test:integration:http`
- `npm run audit:prod`: auditoria de dependencias productivas
- `npm run cleanup:transfer-proofs`: elimina comprobantes vencidos (default 45 dias)
- `npm run cleanup:transfer-proofs:dry`: simulacion sin borrar archivos
- `npm run cleanup:checkout-idempotency`: elimina claves de checkout idempotentes vencidas
- `npm run cleanup:checkout-idempotency:dry`: simulacion de limpieza de idempotency
- `GET /health`: liveness del proceso
- `GET /health/ready`: readiness con chequeo real de base de datos
- `GET /metrics`: metricas Prometheus para observabilidad
- Respuestas HTTP incluyen `x-request-id` para trazabilidad end-to-end
- El backend puede ejecutar cleanups periodicos automaticamente (configurable con `MAINTENANCE_*`)

Crear primer Administrador de tienda (rol `administrator`) por canal privado:

1) Configurar token de bootstrap en `backend/.env`:

```env
CUSTOMER_BOOTSTRAP_ADMIN_TOKEN_HASH=<sha256_del_token>
```

Podés generar el hash así:

```powershell
node -e "console.log(require('crypto').createHash('sha256').update('TU_TOKEN_SECRETO').digest('hex'))"
```

2) Ejecutar:

```powershell
cd backend
npm run bootstrap:administrator -- --email admin@store.com --password StrongPass123 --token <tu_token>
```

Notas:
- El token es de un solo uso (bootstrap).
- Si ya existe un `administrator`, el comando falla.
- Registro público y OAuth crean siempre usuarios `user`.
- En produccion, `ALLOW_DEV_RESET_TOKEN` debe estar desactivado.
- En produccion, no usar `CUSTOMER_BOOTSTRAP_ADMIN_TOKEN` plano; usar solo `CUSTOMER_BOOTSTRAP_ADMIN_TOKEN_HASH`.
- En produccion, si habilitas OAuth, configurar pares `GOOGLE_OAUTH_CLIENT_ID/GOOGLE_OAUTH_CLIENT_SECRET` o `APPLE_OAUTH_CLIENT_ID/APPLE_OAUTH_CLIENT_SECRET`.
- En produccion, si OAuth esta habilitado, `OAUTH_STATE_SECRET` debe tener al menos 32 caracteres.

## Frontend (desde `frontend/`)

Instalacion:

```powershell
npm install
```

Desarrollo:

```powershell
npm run dev
```

Validacion:

```powershell
npm run lint
npm run build
```

## Guia rapida: donde editar el diseno

Regla general:
- Cada seccion visual vive en un componente `tsx` y su estilo en un `*.module.css` con el mismo nombre.
- Las rutas de `src/app/**/page.tsx` suelen ser "entrypoints"; casi toda la UI real esta en `src/components/**`.

Base global (tema, espaciado, tipografia):
- `frontend/src/styles/tokens.css`: colores, bordes, sombras, radio y variables de tema.
- `frontend/src/styles/base.css`: reset, tipografia base y escala responsive.
- `frontend/src/styles/ui.css`: clase `.container` (ancho maximo y padding lateral global).
- `frontend/src/styles/animations.css`: animaciones globales.
- `frontend/src/app/layout.tsx` y `frontend/src/app/layout.module.css`: estructura global, fondo, header/footer.

Header y navegacion:
- `frontend/src/components/site-header.tsx`
- `frontend/src/components/site-header.module.css`
- `frontend/src/components/cart-drawer.tsx`
- `frontend/src/components/cart-drawer.module.css`

Home:
- Hero: `frontend/src/components/home-hero.tsx` + `frontend/src/components/home-hero.module.css`
- Categorias principales: `frontend/src/components/primary-categories.tsx` + `frontend/src/components/primary-categories.module.css`
- Entrada de pagina: `frontend/src/app/page.tsx`

Catalogo y producto:
- Listado/filtros/orden/paginacion: `frontend/src/components/products-explorer.tsx` + `frontend/src/components/products-explorer.module.css`
- Card de producto y CTA agregar/cantidad: `frontend/src/components/product-card.tsx` + `frontend/src/components/product-card.module.css`
- Control de cantidad reutilizable: `frontend/src/components/quantity-control.tsx` + `frontend/src/components/quantity-control.module.css`
- Detalle de producto: `frontend/src/components/product-detail-page.tsx` + `frontend/src/components/product-detail-page.module.css`
- Rutas: `frontend/src/app/productos/page.tsx` y `frontend/src/app/productos/[id]/page.tsx`

Carrito y checkout:
- Carrito pagina: `frontend/src/components/cart-page.tsx` + `frontend/src/components/cart-page.module.css`
- Checkout: `frontend/src/components/checkout-page.tsx` + `frontend/src/components/checkout-page.module.css`
- Rutas: `frontend/src/app/carrito/page.tsx` y `frontend/src/app/checkout/page.tsx`

Ingreso/cuenta:
- Login/registro/recupero: `frontend/src/components/customer-login-page.tsx` + `frontend/src/components/customer-login-page.module.css`
- Layout de cuenta (tabs, header interno): `frontend/src/components/customer-account-layout.tsx` + `frontend/src/components/customer-account-layout.module.css`
- Inicio cuenta: `frontend/src/components/customer-account-home-page.tsx` + `frontend/src/components/customer-account-home-page.module.css`
- Pedidos: `frontend/src/components/customer-account-orders-page.tsx` + `frontend/src/components/customer-account-orders-page.module.css`
- Perfil/datos personales: `frontend/src/components/customer-account-profile-page.tsx` + `frontend/src/components/customer-account-profile-page.module.css`
- Ruta ingreso: `frontend/src/app/ingresar/page.tsx`
- Rutas cuenta: `frontend/src/app/cuenta/**`

Panel de administracion (dentro de cuenta):
- Panel y secciones (Productos/Cupones/Apariencia/Envio/Equipo): `frontend/src/components/customer-account-admin-page.tsx` + `frontend/src/components/customer-account-admin-page.module.css`
- CRUD productos: `frontend/src/components/products-admin.tsx` + `frontend/src/components/products-admin.module.css`
- CRUD cupones: `frontend/src/components/coupons-admin.tsx` + `frontend/src/components/coupons-admin.module.css`
- Ruta: `frontend/src/app/cuenta/admin/page.tsx`

Paginas institucionales:
- Nosotros: `frontend/src/app/nosotros/page.tsx` + `frontend/src/app/nosotros/page.module.css`
- Contacto: `frontend/src/app/contacto/page.tsx` + `frontend/src/app/contacto/page.module.css`

SEO/metadatos:
- Helpers SEO: `frontend/src/lib/seo.ts`
- SEO de productos: `frontend/src/lib/store-seo.ts`
- Robots/Sitemap: `frontend/src/app/robots.ts`, `frontend/src/app/sitemap.ts`

Si editas solo estilos, prioriza `*.module.css` del componente. Si cambias estructura, labels o comportamiento, toca el `tsx` del mismo componente.

## Primer setup recomendado (paso a paso)

1. `docker compose up -d postgres`
2. `cd backend && npm install`
3. `npm run setup:local`
4. Copiar `pk_...` del output de seed a `frontend/.env.local`
5. `npm run dev` (backend)
6. `cd ../frontend && npm install && npm run dev`

## Troubleshooting rapido

- `Failed to fetch` en frontend:
  - backend apagado o `NEXT_PUBLIC_BACKEND_URL` incorrecto.
- errores de tablas faltantes:
  - `cd backend && npm run setup:local`
- key publishable faltante/invalida:
  - `cd backend && npm run seed` y copiar el nuevo `pk_...`
- entorno local roto (DB/cache):
  - `docker compose down -v`
  - `docker compose up -d postgres`
  - limpiar dependencias/caches npm:
    - macOS: `./clean-deps.sh`
    - Windows: `clean-deps.bat`
  - `cd backend && npm run setup:local`


