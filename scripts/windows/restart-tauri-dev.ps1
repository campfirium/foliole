param(
  [ValidateSet('start', 'stop', 'restart', 'status')]
  [string]$Action = 'status',
  [string]$WindowsWorkDir = 'C:\dev\foliole',
  [string]$PidFile = "$env:TEMP\foliole-tauri-dev.pid"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Write-Info {
  param([string]$Message)
  Write-Host "[windows-client] $Message"
}

function Get-TrackedPid {
  if (!(Test-Path -Path $PidFile)) {
    return $null
  }

  $raw = (Get-Content -Path $PidFile -Raw).Trim()
  if ([string]::IsNullOrWhiteSpace($raw)) {
    return $null
  }

  try {
    return [int]$raw
  } catch {
    return $null
  }
}

function Get-TrackedProcess {
  $trackedPid = Get-TrackedPid
  if ($null -eq $trackedPid) {
    return $null
  }

  $process = Get-Process -Id $trackedPid -ErrorAction SilentlyContinue
  if ($null -eq $process) {
    Remove-Item -Path $PidFile -Force -ErrorAction SilentlyContinue
    return $null
  }

  return $process
}

function Start-Client {
  if (!(Test-Path -Path $WindowsWorkDir)) {
    throw "Workdir not found: $WindowsWorkDir"
  }

  $existing = Get-TrackedProcess
  if ($null -ne $existing) {
    Write-Info "status: RUNNING pid=$($existing.Id)"
    return
  }

  $command = "Set-Location -Path '$WindowsWorkDir'; npm run tauri:dev"
  $process = Start-Process -FilePath 'powershell.exe' -ArgumentList '-NoProfile', '-ExecutionPolicy', 'Bypass', '-NoExit', '-Command', $command -WorkingDirectory $WindowsWorkDir -PassThru

  Set-Content -Path $PidFile -Value $process.Id -NoNewline
  Write-Info "status: STARTED pid=$($process.Id)"
}

function Stop-Client {
  $existing = Get-TrackedProcess
  if ($null -eq $existing) {
    Write-Info 'status: STOPPED (no tracked process)'
    return
  }

  Stop-Process -Id $existing.Id -Force -ErrorAction SilentlyContinue
  Remove-Item -Path $PidFile -Force -ErrorAction SilentlyContinue
  Write-Info "status: STOPPED pid=$($existing.Id)"
}

switch ($Action) {
  'start' {
    Start-Client
    break
  }
  'stop' {
    Stop-Client
    break
  }
  'restart' {
    Stop-Client
    Start-Client
    Write-Info 'status: RESTARTED'
    break
  }
  'status' {
    $existing = Get-TrackedProcess
    if ($null -eq $existing) {
      Write-Info 'status: STOPPED'
    } else {
      Write-Info "status: RUNNING pid=$($existing.Id)"
    }
    break
  }
}
