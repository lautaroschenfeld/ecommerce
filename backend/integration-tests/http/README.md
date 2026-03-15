# Integration Tests (HTTP)

Estos tests levantan el backend (usando `npm run start`) y prueban endpoints reales via `fetch`.

Requisitos:

- PostgreSQL corriendo y accesible por `DATABASE_URL` en `backend/.env`
- Opcional: definir `TEST_PUBLISHABLE_API_KEY` si queres fijar una publishable key.
  Si no se define, los tests generan una `pk_...` valida automaticamente.

Ejecutar:

```powershell
cd backend
npm run test:integration:http
```

Notas:

- Por defecto los specs NO comparten backend entre archivos (aislamiento por spec).
- Si queres reutilizar un backend compartido durante toda la corrida, activa
  `TEST_INTEGRATION_REUSE_SERVER=true`.
