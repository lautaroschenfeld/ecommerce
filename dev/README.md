# Dev Scripts

Carpeta con comandos rapidos para levantar el proyecto y resolver problemas comunes en Windows/macOS.

## Windows

- Ejecutar todo (abre backend + frontend en 2 ventanas):
  - `dev\run-all.bat`
- Alias desde la raiz (igual que antes):
  - `dev.bat`
- Limpiar dependencias/caches npm (node_modules, dist, .next, cache npm):
  - `dev\clean-deps-windows.bat`
  - Alias desde la raiz: `clean-deps.bat`

## macOS

- Reparar cuarentena y permisos ejecutables:
  - `bash dev/fix-quarantine-mac.sh`
  - Doble click: `fix-quarantine.command` (en la raiz del repo)
- Ejecutar todo (levanta postgres y abre backend + frontend en 2 ventanas de Terminal):
  - `bash dev/run-all-mac.sh`
  - Doble click: `run-all.command` (en la raiz del repo)
- Ejecutar backend solo:
  - `bash dev/run-backend-mac.sh`
- Ejecutar frontend solo:
  - `bash dev/run-frontend-mac.sh`
- Limpiar dependencias/caches npm (node_modules, dist, .next, cache npm):
  - `bash dev/clean-deps-mac.sh`
  - Alias desde la raiz: `./clean-deps.sh`

## Nota

En macOS, el backend se lanza con `npm run dev` (no `dev:local`, porque ese script usa PowerShell y esta pensado para Windows).

En macOS, `run-all-mac.sh`, `run-backend-mac.sh` y `run-frontend-mac.sh` liberan automaticamente puertos (`9000`, `3000`, `3001`) usando `dev/free-ports-mac.sh`. Si Docker tiene contenedores publicados en esos puertos, tambien se detienen.

Si Docker Desktop no esta corriendo, `run-all-mac.sh` intenta iniciarlo automaticamente y espera hasta que el daemon responda.

`run-all.bat` y `run-all-mac.sh` ahora detectan si falta `node_modules` en backend/frontend y ejecutan `npm install` automaticamente antes de levantar el proyecto.

En Windows, `run-all.bat`, `run-backend.bat` y `run-frontend.bat` liberan automaticamente los puertos requeridos (`9000`, `3000`, `3001`) usando `dev/free-ports.ps1`. Si Docker tiene contenedores publicados en esos puertos, tambien se detienen.
