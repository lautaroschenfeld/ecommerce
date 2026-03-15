# Ecommerce Monorepo

Repositorio monorepo para una tienda ecommerce con:
- `backend` en Node.js + TypeScript + PostgreSQL + Redis
- `frontend` en Next.js 16
- infraestructura con Docker Compose y despliegue detras de Nginx

## Contenido
- [Arquitectura](#arquitectura)
- [Estructura del repositorio](#estructura-del-repositorio)
- [Requisitos](#requisitos)
- [Inicio rapido (desarrollo local)](#inicio-rapido-desarrollo-local)
- [Configuracion de entorno](#configuracion-de-entorno)
- [Docker Compose (stack completa)](#docker-compose-stack-completa)
- [Comandos utiles](#comandos-utiles)
- [Observabilidad y salud](#observabilidad-y-salud)
- [Bootstrap de administrador](#bootstrap-de-administrador)
- [Despliegue en VPS](#despliegue-en-vps)
- [Troubleshooting](#troubleshooting)

## Arquitectura
- `frontend` (Next.js): UI de tienda y panel administrativo.
- `backend` (Express/TS): API de catalogo, auth, checkout, admin y webhooks.
- `postgres`: persistencia principal.
- `redis`: cache/soporte para flujos de alto trafico.
- `nginx` (fuera de este repo): reverse proxy publico HTTPS.

## Estructura del repositorio

```text
.
|-- backend/
|-- frontend/
|-- dev/
|-- docker-compose.yml
|-- .env.example
`-- README.md
```

## Requisitos
- Node.js 20+
- npm 10+
- Docker Desktop / Docker Engine
- Puertos libres: `3000`, `5433`, `9000`

## Inicio rapido (desarrollo local)

### Opcion recomendada
Terminal 1:

```powershell
cd backend
npm install
npm run dev:local
```

Terminal 2:

```powershell
cd frontend
npm install
npm run dev
```

`dev:local` prepara infraestructura local y puede ejecutar seed inicial.

### Si Postgres ya esta levantado manualmente

```powershell
cd backend
npm run dev
```

### Si el puerto `9000` esta ocupado

```powershell
cd backend
npm run dev:all:clean
```

## Configuracion de entorno

### 1) Backend
Copiar template y completar secretos:

```powershell
Copy-Item backend/.env.template backend/.env
```

Variables minimas recomendadas en `backend/.env`:

```env
DATABASE_URL=postgres://postgres:postgres@localhost:5433/store_db
JWT_SECRET=... # 32+ caracteres
COOKIE_SECRET=... # 32+ caracteres
STORE_CURRENCY_CODE=usd
STORE_REGION_NAME=Region principal
STORE_REGION_COUNTRY_CODE=us
MERCADOPAGO_ACCESS_TOKEN=APP_USR-...
MERCADOPAGO_WEBHOOK_SECRET=...
STOREFRONT_URL=http://localhost:3000
BACKEND_PUBLIC_URL=http://localhost:9000
```

Notas:
- En `production`, no usar secretos debiles.
- Si faltan secretos criticos en produccion, el backend puede fallar en startup por validaciones de seguridad.

### 2) Frontend
Crear `frontend/.env.local`:

```env
NEXT_PUBLIC_BACKEND_URL=http://localhost:9000
NEXT_PUBLIC_PUBLISHABLE_API_KEY=pk_...
NEXT_PUBLIC_STORE_LOCALE=es-AR
NEXT_PUBLIC_STORE_CURRENCY_CODE=USD
```

La `pk_...` se obtiene al ejecutar `npm run seed` en `backend`.

### 3) Docker Compose (raiz)
Para entornos de VPS/produccion, crear `.env` en la raiz basado en `.env.example`.

```powershell
Copy-Item .env.example .env
```

Importante:
- En produccion, el seed no crea productos/cupones demo por defecto.
- Si queres forzarlos, definir `SEED_DEMO_PRODUCTS=true` y/o `SEED_DEMO_COUPONS=true`.

## Docker Compose (stack completa)

Desde la raiz del repo:

```powershell
docker compose up -d postgres
docker compose up -d --build backend frontend redis
docker compose ps
docker compose logs -f backend
docker compose down
docker compose down -v
```

Notas:
- `backend` ejecuta `seed` al iniciar en la stack completa.
- `NEXT_PUBLIC_*` del frontend se inyecta en build via `docker-compose.yml`.

## Comandos utiles

### Backend (`backend/`)

```powershell
npm install
npm run dev:local
npm run setup:local
npm run seed
npm run lint
npm run build
npm run test:unit
npm run test:integration:http
npm run ci
```

Scripts relevantes:
- `dev:local`: prepara entorno local y levanta backend.
- `dev:local:no-seed`: igual, sin seed.
- `dev:local:force-seed`: fuerza seed.
- `cleanup:transfer-proofs` y `cleanup:checkout-idempotency`: tareas de mantenimiento.

### Frontend (`frontend/`)

```powershell
npm install
npm run dev
npm run lint
npm run build
npm run test
npm run test:ui:only
npm run ci
```

## Observabilidad y salud
Endpoints del backend:
- `GET /health`: liveness
- `GET /health/ready`: readiness con chequeo de DB
- `GET /metrics`: metricas Prometheus

Adicional:
- Las respuestas incluyen `x-request-id` para trazabilidad.

## Bootstrap de administrador
Para crear el primer usuario administrador:

```powershell
cd backend
npm run bootstrap:administrator -- --email admin@store.com --password StrongPass123 --token <tu_token>
```

## Despliegue en VPS
Ruta recomendada:
- `/opt/ecommerce`

Flujo base:

```bash
cd /opt
git clone git@github.com:lautaroschenfeld/ecommerce.git
cd ecommerce
cp .env.example .env
# editar .env con valores reales
docker compose up -d --build
```

Con Nginx:
- `https://tu-dominio.com` -> `http://127.0.0.1:3000`
- `https://tu-dominio.com/api/` -> `http://127.0.0.1:9000/`

## Troubleshooting

- `Failed to fetch` en frontend:
  - revisar que backend este levantado
  - verificar `NEXT_PUBLIC_BACKEND_URL`

- Error de tablas faltantes:

```powershell
cd backend
npm run setup:local
```

- Publishable key faltante/invalida:

```powershell
cd backend
npm run seed
```

- Entorno local roto (DB/cache):

```powershell
docker compose down -v
docker compose up -d postgres
```

## Seguridad
- No commitear archivos `.env`.
- Mantener `JWT_SECRET` y `COOKIE_SECRET` con 32+ caracteres.
- En produccion, usar HTTPS para `STOREFRONT_URL` y `BACKEND_PUBLIC_URL`.
- Mantener `ALLOW_DEV_RESET_TOKEN=false` en produccion.
