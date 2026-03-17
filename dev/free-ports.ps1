param(
  [Parameter(Mandatory = $true)]
  [string[]]$Ports
)

$ErrorActionPreference = "Stop"
$currentProcessId = $PID

function Get-PortOwningProcessIds {
  param([int]$Port)

  $netTcpCommand = Get-Command Get-NetTCPConnection -ErrorAction SilentlyContinue
  if ($null -ne $netTcpCommand) {
    try {
      return @(
        Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue |
          Select-Object -ExpandProperty OwningProcess -Unique |
          Where-Object { $_ -gt 0 }
      )
    } catch {
      return @()
    }
  }

  $result = @()
  try {
    $pattern = "^\s*TCP\s+\S+:$Port\s+\S+\s+LISTENING\s+(\d+)\s*$"
    $matches = netstat -ano -p tcp | Select-String -Pattern $pattern
    foreach ($line in $matches) {
      $match = [regex]::Match($line.ToString(), $pattern)
      if ($match.Success) {
        $pid = [int]$match.Groups[1].Value
        if ($pid -gt 0) {
          $result += $pid
        }
      }
    }
  } catch {
    return @()
  }

  return @($result | Select-Object -Unique)
}

function Get-ProcessNameSafe {
  param([int]$ProcessId)

  try {
    return (Get-Process -Id $ProcessId -ErrorAction Stop).ProcessName
  } catch {
    return ""
  }
}

function Stop-DockerContainersUsingPort {
  param([int]$Port)

  $dockerCommand = Get-Command docker -ErrorAction SilentlyContinue
  if ($null -eq $dockerCommand) {
    return 0
  }

  $lines = @()
  try {
    $raw = docker ps --filter "publish=$Port" --format "{{.ID}}`t{{.Names}}" 2>$null
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($raw)) {
      return 0
    }
    $lines = @($raw -split "`r?`n" | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
  } catch {
    return 0
  }

  $stopped = 0
  foreach ($line in $lines) {
    $parts = $line -split "`t", 2
    $containerId = $parts[0].Trim()
    if ([string]::IsNullOrWhiteSpace($containerId)) {
      continue
    }

    $containerName = $containerId
    if ($parts.Length -gt 1 -and -not [string]::IsNullOrWhiteSpace($parts[1])) {
      $containerName = $parts[1].Trim()
    }

    Write-Host "[dev] Deteniendo contenedor Docker '$containerName' que usa :$Port..."
    try {
      docker stop $containerId *> $null
      if ($LASTEXITCODE -eq 0) {
        $stopped += 1
      }
    } catch {
      # ignore stop failures and continue
    }
  }

  return $stopped
}

$normalizedPorts = @()
foreach ($entry in $Ports) {
  if ([string]::IsNullOrWhiteSpace($entry)) {
    continue
  }

  $tokens = @($entry -split "[,\s;]+" | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
  foreach ($token in $tokens) {
    $parsedPort = 0
    if ([int]::TryParse($token, [ref]$parsedPort) -and $parsedPort -gt 0 -and $parsedPort -le 65535) {
      $normalizedPorts += $parsedPort
    } else {
      throw "Puerto invalido: '$token'."
    }
  }
}

$normalizedPorts = @($normalizedPorts | Select-Object -Unique)
if ($normalizedPorts.Count -eq 0) {
  throw "No se recibieron puertos validos para liberar."
}

$failedPorts = @()

foreach ($port in $normalizedPorts) {
  Write-Host "[dev] Verificando puerto $port..."

  for ($attempt = 1; $attempt -le 4; $attempt++) {
    $processIds = @(Get-PortOwningProcessIds -Port $port)
    if ($processIds.Count -eq 0) {
      break
    }

    $processNames = @(
      $processIds |
        ForEach-Object { Get-ProcessNameSafe -ProcessId $_ } |
        Where-Object { -not [string]::IsNullOrWhiteSpace($_) } |
        Select-Object -Unique
    )

    if ($processNames -contains "com.docker.backend" -or $processNames -contains "wslrelay" -or $processNames -contains "docker-proxy") {
      [void](Stop-DockerContainersUsingPort -Port $port)
      Start-Sleep -Milliseconds 400
      $processIds = @(Get-PortOwningProcessIds -Port $port)
      if ($processIds.Count -eq 0) {
        break
      }
    }

    foreach ($processId in $processIds) {
      if ($processId -eq $currentProcessId) {
        continue
      }

      try {
        $process = Get-Process -Id $processId -ErrorAction Stop
        Write-Host "[dev] Cerrando proceso $($process.ProcessName) (PID $processId) en :$port..."
        Stop-Process -Id $processId -Force -ErrorAction Stop
      } catch {
        # process might be gone or protected
      }
    }

    Start-Sleep -Milliseconds 300
  }

  $remainingIds = @(Get-PortOwningProcessIds -Port $port)
  if ($remainingIds.Count -eq 0) {
    Write-Host "[dev] Puerto $port liberado."
    continue
  }

  Write-Host "[dev] No se pudo liberar el puerto $port automaticamente."
  $failedPorts += $port
}

if ($failedPorts.Count -gt 0) {
  $failedList = ($failedPorts | Select-Object -Unique) -join ", "
  Write-Host "[dev] Puertos aun ocupados: $failedList"
  exit 1
}

exit 0
