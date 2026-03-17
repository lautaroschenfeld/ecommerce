# Remediacion del panel de administracion

- [x] T1. Corregir `Clientes` para cargar todas las cuentas y todos los pedidos paginados, evitando metricas truncadas por limites fijos.
- [x] T2. Corregir `Inventario` para leer el total real desde backend, calcular KPIs sobre el dataset completo y dejar de depender de subconjuntos fijos.
- [x] T3. Eliminar en `Clientes` la falsa auditoria basada en `localStorage` y reemplazarla por actividad respaldada por datos del servidor.
- [x] T4. Reauditar `Preguntas` respecto a conteo/paginacion y confirmar si el filtro de ocultas estaba realmente roto.
- [x] T5. Evitar que `Preguntas` pise borradores locales cuando llega el auto-refresh.
- [x] T6. Unificar el shell visual del admin para que `Clientes`, `Inventario`, `Preguntas`, `Ordenes`, `Cupones` y `Apariencia` usen la misma estructura principal.
- [x] T7. Agregar navegacion contextual consistente en rutas hijas del panel (`crear` y `detalle`).

## Notas

- T4 fue reauditada contra `backend/src/lib/product-questions-pg.ts`: el backend ya excluye `hidden` cuando `status=all`, asi que no habia bug funcional que corregir. Se cierra como verificacion tecnica.
