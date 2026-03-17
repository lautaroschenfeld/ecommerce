@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..") do set "ROOT_DIR=%%~fI"

cd /d "%ROOT_DIR%\frontend"
if errorlevel 1 (
  echo [dev] No se pudo entrar a %ROOT_DIR%\frontend
  goto :error
)

if not exist node_modules (
  echo [dev] Instalando dependencias frontend...
  call npm install
  if errorlevel 1 goto :error
)

echo [dev] Liberando puertos 3000 y 3001...
powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%free-ports.ps1" -Ports 3000,3001
if errorlevel 1 goto :error

if exist ".next\dev\lock" (
  del /f /q ".next\dev\lock" > nul 2>&1
)

echo [dev] Iniciando frontend (dev)...
call npm run dev
goto :eof

:error
echo [dev] Fallo la ejecucion de frontend.
pause
exit /b 1
