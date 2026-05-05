param(
  [ValidateSet("status", "start", "stop", "restart")]
  [string]$Action = "status",
  [string]$WindowsWorkDir = "C:\dev\foliole",
  [string]$PidFile = "$env:TEMP\foliole-electron-dev.pid"
)

$ErrorActionPreference = "Stop"

function Write-Info {
  param([string]$Message)
  Write-Host "[windows-restart-client] $Message"
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

function Get-ProcessById {
  param([int]$ProcessId)
  if ($ProcessId -le 0) {
    return $null
  }

  return Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
}

function Save-TrackedPid {
  param([int]$ProcessId)
  if ($ProcessId -le 0) {
    return
  }

  Set-Content -Path $PidFile -Value $ProcessId -NoNewline
}

function Get-TrackedProcess {
  $trackedPid = Get-TrackedPid
  if ($null -eq $trackedPid) {
    return $null
  }

  $tracked = Get-ProcessById -ProcessId $trackedPid
  if ($null -eq $tracked) {
    Remove-Item -Path $PidFile -Force -ErrorAction SilentlyContinue
    return $null
  }

  return $tracked
}

function Get-ElectronDevShell {
  $candidates = Get-CimInstance Win32_Process -Filter "Name='cmd.exe' OR Name='powershell.exe'" |
    Where-Object {
      $cmd = $_.CommandLine
      $null -ne $cmd -and $cmd -match 'npm(\.cmd)?\s+run\s+electron:dev'
    }

  $candidateList = @($candidates)
  if ($candidateList.Count -eq 0) {
    return $null
  }

  return $candidateList | Select-Object -First 1
}

function Stop-ProcessTree {
  param([int]$ProcessId)
  if ($ProcessId -le 0) {
    return
  }

  Start-Process -FilePath "taskkill.exe" -ArgumentList "/PID", "$ProcessId", "/T", "/F" -NoNewWindow -Wait
}

function Start-ElectronShell {
  param([string]$WorkDir)
  if (!(Test-Path -Path $WorkDir)) {
    throw "Workdir not found: $WorkDir"
  }

  $command = "cd /d `"$WorkDir`" && set ELECTRON_RUN_AS_NODE= && npm run electron:dev"
  $proc = Start-Process -FilePath "cmd.exe" -ArgumentList "/d", "/c", $command -WorkingDirectory $WorkDir -PassThru
  Start-Sleep -Seconds 1
  Save-TrackedPid -ProcessId $proc.Id
  return $proc
}

function Stop-ElectronShell {
  $tracked = Get-TrackedProcess
  if ($null -ne $tracked) {
    Stop-ProcessTree -ProcessId $tracked.Id
    Remove-Item -Path $PidFile -Force -ErrorAction SilentlyContinue
    Write-Info "status: STOPPED pid=$($tracked.Id)"
    return
  }

  $shell = Get-ElectronDevShell
  if ($null -eq $shell) {
    Write-Info "status: STOPPED"
    return
  }

  Stop-ProcessTree -ProcessId ([int]$shell.ProcessId)
  Remove-Item -Path $PidFile -Force -ErrorAction SilentlyContinue
  Write-Info "status: STOPPED pid=$($shell.ProcessId) (detected electron:dev shell)"
}

if ($Action -eq "status") {
  $tracked = Get-TrackedProcess
  if ($null -ne $tracked) {
    Write-Info "status: RUNNING pid=$($tracked.Id)"
    exit 0
  }

  $shell = Get-ElectronDevShell
  if ($null -eq $shell) {
    Write-Info "status: STOPPED"
  } else {
    Save-TrackedPid -ProcessId ([int]$shell.ProcessId)
    Write-Info "status: RUNNING pid=$($shell.ProcessId) (existing electron:dev shell detected)"
  }
  exit 0
}

if ($Action -eq "stop") {
  Stop-ElectronShell
  exit 0
}

if ($Action -eq "start") {
  $tracked = Get-TrackedProcess
  if ($null -ne $tracked) {
    Write-Info "status: RUNNING pid=$($tracked.Id)"
    exit 0
  }

  $existingShell = Get-ElectronDevShell
  if ($null -ne $existingShell) {
    Save-TrackedPid -ProcessId ([int]$existingShell.ProcessId)
    Write-Info "status: RUNNING pid=$($existingShell.ProcessId) (existing electron:dev shell detected)"
    exit 0
  }

  $started = Start-ElectronShell -WorkDir $WindowsWorkDir
  Write-Info "status: STARTED pid=$($started.ProcessId)"
  exit 0
}

if ($Action -eq "restart") {
  Stop-ElectronShell
  $started = Start-ElectronShell -WorkDir $WindowsWorkDir
  Write-Info "status: RESTARTED pid=$($started.ProcessId)"
  exit 0
}
