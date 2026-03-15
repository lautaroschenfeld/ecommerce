@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..") do set "ROOT_DIR=%%~fI"
set "BACKEND_SCRIPT=%SCRIPT_DIR%run-backend.bat"
set "FRONTEND_SCRIPT=%SCRIPT_DIR%run-frontend.bat"
set "FREE_PORTS_SCRIPT=%SCRIPT_DIR%free-ports.ps1"

if not exist "%BACKEND_SCRIPT%" (
  echo [dev] No se encontro %BACKEND_SCRIPT%
  exit /b 1
)
if not exist "%FRONTEND_SCRIPT%" (
  echo [dev] No se encontro %FRONTEND_SCRIPT%
  exit /b 1
)
if not exist "%FREE_PORTS_SCRIPT%" (
  echo [dev] No se encontro %FREE_PORTS_SCRIPT%
  exit /b 1
)

echo [dev] Preparando puertos requeridos (9000, 3000, 3001)...
powershell -NoProfile -ExecutionPolicy Bypass -File "%FREE_PORTS_SCRIPT%" -Ports 9000,3000,3001
if errorlevel 1 (
  echo [dev] No se pudieron liberar todos los puertos requeridos.
  exit /b 1
)

echo [dev] Iniciando backend...
start "Backend Server" "%ComSpec%" /k call "%BACKEND_SCRIPT%"

timeout /t 3 > nul

echo [dev] Iniciando frontend...
start "Frontend Server" "%ComSpec%" /k call "%FRONTEND_SCRIPT%"

exit /b 0
