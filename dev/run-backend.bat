@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..") do set "ROOT_DIR=%%~fI"

cd /d "%ROOT_DIR%\backend"
if errorlevel 1 (
  echo [dev] No se pudo entrar a %ROOT_DIR%\backend
  goto :error
)

if not exist node_modules (
  echo [dev] Instalando dependencias backend...
  call npm install
  if errorlevel 1 goto :error
)

echo [dev] Liberando puerto 9000...
powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%free-ports.ps1" -Ports 9000
if errorlevel 1 goto :error

echo [dev] Iniciando backend (dev:local)...
call npm run dev:local
goto :eof

:error
echo [dev] Fallo la ejecucion de backend.
pause
exit /b 1
