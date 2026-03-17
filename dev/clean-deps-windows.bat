@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..") do set "ROOT_DIR=%%~fI"

echo [clean] Eliminando dependencias y caches locales...

if exist "%ROOT_DIR%\backend\node_modules" (
  rmdir /s /q "%ROOT_DIR%\backend\node_modules"
  echo [clean] OK - backend\node_modules
) else (
  echo [clean] Omitido - backend\node_modules (no existe)
)

if exist "%ROOT_DIR%\frontend\node_modules" (
  rmdir /s /q "%ROOT_DIR%\frontend\node_modules"
  echo [clean] OK - frontend\node_modules
) else (
  echo [clean] Omitido - frontend\node_modules (no existe)
)

if exist "%ROOT_DIR%\backend\dist" (
  rmdir /s /q "%ROOT_DIR%\backend\dist"
  echo [clean] OK - backend\dist
) else (
  echo [clean] Omitido - backend\dist (no existe)
)

if exist "%ROOT_DIR%\frontend\.next" (
  rmdir /s /q "%ROOT_DIR%\frontend\.next"
  echo [clean] OK - frontend\.next
) else (
  echo [clean] Omitido - frontend\.next (no existe)
)

echo [clean] Limpiando cache global de npm...
call npm cache clean --force > nul 2>&1

echo [clean] Listo. Al ejecutar run-all, npm install se corre solo si falta node_modules.
exit /b 0
