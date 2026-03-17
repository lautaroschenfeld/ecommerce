param(
  [switch]$SkipSeed,
  [switch]$ForceSeed,
  [switch]$NoDocker,
  [switch]$NoDev
)

$ErrorActionPreference = "Stop"

function Invoke-Step {
  param(
    [Parameter(Mandatory = $true)][string]$Title,
    [Parameter(Mandatory = $true)][scriptblock]$Action
  )

  Write-Host ""
  Write-Host "==> $Title"
  & $Action
}

function Read-EnvMap {
  param([string]$Path)

  $map = @{}
  if (!(Test-Path $Path)) {
    return $map
  }

  Get-Content $Path | ForEach-Object {
    $line = $_.Trim()
    if (!$line -or $line.StartsWith("#")) { return }
    $parts = $line.Split("=", 2)
    if ($parts.Length -ne 2) { return }
    $key = $parts[0].Trim()
    $value = $parts[1].Trim()
    if ($key) {
      $map[$key] = $value
    }
  }

  return $map
}

function Ensure-BackendEnvFile {
  param(
    [Parameter(Mandatory = $true)][string]$EnvPath,
    [Parameter(Mandatory = $true)][string]$TemplatePath
  )

  if (Test-Path $EnvPath) {
    return
  }

  if (!(Test-Path $TemplatePath)) {
    throw "No existe backend/.env y tampoco backend/.env.template. Crea backend/.env manualmente."
  }

  Copy-Item -Path $TemplatePath -Destination $EnvPath
  Write-Host "backend/.env no existia. Se genero automaticamente desde .env.template."
}

function Get-PortFromUrl {
  param(
    [string]$Url,
    [int]$DefaultPort
  )

  if ([string]::IsNullOrWhiteSpace($Url)) {
    return $DefaultPort
  }

  try {
    $uri = [System.Uri]$Url
    if ($uri.Port -gt 0) {
      return $uri.Port
    }
  } catch {
    # ignore parse errors
  }

  return $DefaultPort
}

function Test-PortListening {
  param([int]$Port)

  $tcpClient = $null

  try {
    $tcpClient = [System.Net.Sockets.TcpClient]::new()
    $asyncResult = $tcpClient.BeginConnect("127.0.0.1", $Port, $null, $null)
    $connected = $asyncResult.AsyncWaitHandle.WaitOne(1000, $false)
    if (-not $connected) {
      return $false
    }

    $tcpClient.EndConnect($asyncResult)
    return $true
  } catch {
    return $false
  } finally {
    if ($null -ne $tcpClient) {
      $tcpClient.Dispose()
    }
  }
}

function Get-CurrentPlatform {
  if ([System.Runtime.InteropServices.RuntimeInformation]::IsOSPlatform([System.Runtime.InteropServices.OSPlatform]::Windows)) {
    return "Windows"
  }

  if ([System.Runtime.InteropServices.RuntimeInformation]::IsOSPlatform([System.Runtime.InteropServices.OSPlatform]::OSX)) {
    return "macOS"
  }

  return "Other"
}

function Assert-DockerCommand {
  $dockerCommand = Get-Command docker -ErrorAction SilentlyContinue
  if ($null -eq $dockerCommand) {
    throw "No se encontro Docker CLI en PATH. Instala Docker Desktop y vuelve a intentar."
  }
}

function Test-DockerDaemonReady {
  try {
    docker info *> $null
    return $LASTEXITCODE -eq 0
  } catch {
    return $false
  }
}

function Start-DockerDesktop {
  $platform = Get-CurrentPlatform

  if ($platform -eq "Windows") {
    $candidates = @(
      $(if ($env:ProgramFiles) { Join-Path $env:ProgramFiles "Docker\Docker\Docker Desktop.exe" }),
      $(if ($env:ProgramW6432) { Join-Path $env:ProgramW6432 "Docker\Docker\Docker Desktop.exe" }),
      $(if ($env:LocalAppData) { Join-Path $env:LocalAppData "Docker\Docker Desktop.exe" })
    ) | Where-Object { $_ -and (Test-Path $_) }

    if ($candidates.Count -gt 0) {
      Start-Process -FilePath $candidates[0] | Out-Null
      return
    }

    try {
      Start-Process -FilePath "Docker Desktop" -ErrorAction Stop | Out-Null
      return
    } catch {
      throw "No se pudo iniciar Docker Desktop automaticamente en Windows. Abre Docker Desktop manualmente."
    }
  }

  if ($platform -eq "macOS") {
    & open -a Docker *> $null
    if ($LASTEXITCODE -ne 0) {
      throw "No se pudo iniciar Docker Desktop automaticamente en macOS. Abre Docker manualmente."
    }
    return
  }

  throw "Inicio automatico de Docker no soportado en este sistema operativo."
}

function Ensure-DockerDaemonReady {
  param([int]$TimeoutSeconds = 180)

  Assert-DockerCommand

  if (Test-DockerDaemonReady) {
    return
  }

  Write-Host "Docker no esta activo. Iniciando Docker Desktop..."
  Start-DockerDesktop
  Write-Host "Esperando a que Docker quede listo..."

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    if (Test-DockerDaemonReady) {
      Write-Host "Docker activo."
      return
    }

    Start-Sleep -Seconds 3
  }

  throw "Docker no estuvo listo despues de $TimeoutSeconds segundos."
}

function Start-PostgresDocker {
  param([string]$RepoRoot)

  Push-Location $RepoRoot
  try {
    $maxAttempts = 2
    for ($attempt = 1; $attempt -le $maxAttempts; $attempt++) {
      docker compose -f docker-compose.yml up -d postgres
      if ($LASTEXITCODE -eq 0) {
        return
      }

      if ($attempt -ge $maxAttempts) {
        throw "docker compose devolvio codigo $LASTEXITCODE"
      }

      Write-Host "docker compose fallo. Se reintentara una vez mas..."
      Ensure-DockerDaemonReady
      Start-Sleep -Seconds 2
    }
  } finally {
    Pop-Location
  }
}

$backendRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$repoRoot = (Resolve-Path (Join-Path $backendRoot "..")).Path
$envPath = Join-Path $backendRoot ".env"
$envTemplatePath = Join-Path $backendRoot ".env.template"
$seedMarker = Join-Path $backendRoot ".seed.done"

Set-Location $backendRoot

Ensure-BackendEnvFile -EnvPath $envPath -TemplatePath $envTemplatePath

$envMap = Read-EnvMap -Path $envPath
$databaseUrl = [string]$envMap["DATABASE_URL"]
if ([string]::IsNullOrWhiteSpace($databaseUrl)) {
  throw "DATABASE_URL no esta definido en backend/.env. Completa ese valor y vuelve a ejecutar."
}

$dbPort = Get-PortFromUrl -Url $databaseUrl -DefaultPort 5433

if (-not $NoDocker) {
  Invoke-Step -Title "Levantando PostgreSQL (Docker)" -Action {
    Ensure-DockerDaemonReady
    Start-PostgresDocker -RepoRoot $repoRoot
  }
}

Invoke-Step -Title "Verificando puertos de infraestructura" -Action {
  $dbOk = Test-PortListening -Port $dbPort

  if (-not $dbOk) {
    throw "PostgreSQL no esta escuchando en el puerto $dbPort. Revisar DATABASE_URL en backend/.env"
  }

  Write-Host "PostgreSQL OK en :$dbPort"
}

$shouldSeed = $false
if (-not $SkipSeed) {
  if ($ForceSeed -or !(Test-Path $seedMarker)) {
    $shouldSeed = $true
  }
}

if ($shouldSeed) {
  Invoke-Step -Title "Ejecutando seed inicial" -Action {
    npm run seed
    if ($LASTEXITCODE -ne 0) {
      throw "Fallo seed"
    }

    $seedDir = Split-Path -Parent $seedMarker
    New-Item -ItemType Directory -Path $seedDir -Force | Out-Null
    Set-Content -Path $seedMarker -Value (Get-Date).ToString("s")
  }
} else {
  Write-Host ""
  Write-Host "==> Seed omitido (ya ejecutado previamente)"
}

if (-not $NoDev) {
  Invoke-Step -Title "Levantando backend" -Action {
    npm run dev
  }
}
