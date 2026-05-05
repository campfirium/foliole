param(
  [ValidateSet("status", "start", "stop", "restart")]
  [string]$Action = "status",
  [string]$WindowsWorkDir = "C:\dev\foliole"
)

$ErrorActionPreference = "Stop"

function Write-Info {
  param([string]$Message)
  Write-Host "[windows-restart-client] $Message"
}

function Get-ElectronShell {
  $candidates = Get-CimInstance Win32_Process | Where-Object {
    $_.CommandLine -match 'npm(\.cmd)?\s+run\s+electron:dev'
  }
  if ($null -eq $candidates -or $candidates.Count -eq 0) {
    return $null
  }
  return $candidates | Select-Object -First 1
}

function Start-ElectronShell {
  param([string]$WorkDir)
  $command = "cd /d `"$WorkDir`" && npm run electron:dev"
  $proc = Start-Process -FilePath "cmd.exe" -ArgumentList "/d", "/c", $command -PassThru
  Start-Sleep -Seconds 1
  return $proc
}

function Stop-ElectronShell {
  $shell = Get-ElectronShell
  if ($null -eq $shell) {
    Write-Info "status: STOPPED"
    return
  }
  cmd.exe /d /c "taskkill /PID $($shell.ProcessId) /T /F" | Out-Null
  Write-Info "status: STOPPED pid=$($shell.ProcessId)"
}

if ($Action -eq "status") {
  $shell = Get-ElectronShell
  if ($null -eq $shell) {
    Write-Info "status: STOPPED"
    exit 0
  }
  Write-Info "status: RUNNING pid=$($shell.ProcessId)"
  exit 0
}

if ($Action -eq "stop") {
  Stop-ElectronShell
  exit 0
}

if ($Action -eq "start") {
  $existing = Get-ElectronShell
  if ($null -ne $existing) {
    Write-Info "status: RUNNING pid=$($existing.ProcessId)"
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
