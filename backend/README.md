# Backend

Este backend es **custom** (Express + PostgreSQL).

## Comandos

Desde `backend/`:

```powershell
npm install
npm run dev
```

Arranque completo (levanta PostgreSQL por Docker, corre seed si falta y luego levanta el backend):

```powershell
npm run dev:local
```

## Estructura

- `src/server.ts`: servidor HTTP (Express) y mounting automatico de rutas.
- `src/api/**/route.ts`: endpoints.
- `src/scripts/*.ts`: scripts (seed / bootstrap / etc).

Para mas detalles de desarrollo, ver `README.md` en la raiz del repo.
