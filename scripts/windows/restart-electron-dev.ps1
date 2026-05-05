param(
  [ValidateSet("status", "start", "stop", "restart")]
  [string]$Action = "status",
  [string]$WindowsWorkDir = "C:\dev\foliole",
  [string]$PidFile = "$env:TEMP\foliole-electron-dev.pid"
)

$ErrorActionPreference = "Stop"

function Get-HealthCheckSeconds {
  $raw = $env:FOLIOLE_ELECTRON_HEALTHCHECK_SECONDS
  if ([string]::IsNullOrWhiteSpace($raw)) {
    return 30
  }
  try {
    $value = [int]$raw
    if ($value -lt 5) {
      return 5
    }
    return $value
  } catch {
    return 30
  }
}

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

  $npmCmd = Resolve-NpmCommand
  $nodeDir = Split-Path -Path $npmCmd -Parent
  $command = "cd /d `"$WorkDir`" && set PATH=$nodeDir;%PATH% && set ELECTRON_RUN_AS_NODE= && call `"$npmCmd`" run electron:dev"
  $outLog = Join-Path $env:TEMP "foliole-electron-dev.out.log"
  $errLog = Join-Path $env:TEMP "foliole-electron-dev.err.log"
  $proc = Start-Process `
    -FilePath "cmd.exe" `
    -ArgumentList "/d", "/c", $command `
    -WorkingDirectory $WorkDir `
    -PassThru `
    -RedirectStandardOutput $outLog `
    -RedirectStandardError $errLog
  Start-Sleep -Seconds 1
  Save-TrackedPid -ProcessId $proc.Id
  Write-Info "electron:dev logs: out=$outLog err=$errLog"
  return $proc
}

function Resolve-NpmCommand {
  $nvmVersionDirs = @()
  if (Test-Path -Path "D:\R\nvm") {
    $nvmVersionDirs = Get-ChildItem -Path "D:\R\nvm" -Directory -Filter "v*" -ErrorAction SilentlyContinue |
      Sort-Object Name -Descending
  }
  $nvmNpmCandidates = @($nvmVersionDirs | ForEach-Object { Join-Path $_.FullName "npm.cmd" })
  $candidates = @(
    $env:FOLIOLE_WINDOWS_NPM_CMD,
    (Join-Path $env:NVM_SYMLINK 'npm.cmd'),
    (Join-Path $env:ProgramFiles 'nodejs\npm.cmd')
  ) + $nvmNpmCandidates | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }

  foreach ($candidate in $candidates) {
    if (Test-Path -Path $candidate) {
      return $candidate
    }
  }

  $command = Get-Command npm.cmd -ErrorAction SilentlyContinue
  if ($null -ne $command) {
    return $command.Source
  }

  throw "npm.cmd not found; set FOLIOLE_WINDOWS_NPM_CMD or fix NVM_SYMLINK/PATH"
}

function Get-ElectronRuntimeProcess {
  $candidates = Get-CimInstance Win32_Process -Filter "Name='electron.exe'" |
    Where-Object {
      $cmd = $_.CommandLine
      $null -ne $cmd -and $cmd -match 'electron-dist[\\/]+main\.js'
    }
  $candidateList = @($candidates)
  if ($candidateList.Count -eq 0) {
    return $null
  }
  return $candidateList | Select-Object -First 1
}

function Wait-ElectronHealthy {
  param(
    [int]$ShellPid,
    [int]$MaxSeconds = 10
  )
  $detectedRuntimePid = $null
  for ($second = 0; $second -lt $MaxSeconds; $second += 1) {
    $shell = Get-ProcessById -ProcessId $ShellPid
    if ($null -eq $shell) {
      return @{ ok = $false; reason = "shell-exited" }
    }
    $runtime = Get-ElectronRuntimeProcess
    if ($null -ne $runtime) {
      $detectedRuntimePid = [int]$runtime.ProcessId
    }
    Start-Sleep -Seconds 1
  }

  if ($null -eq $detectedRuntimePid) {
    return @{ ok = $false; reason = "runtime-not-detected" }
  }
  if ($null -eq (Get-ProcessById -ProcessId $ShellPid)) {
    return @{ ok = $false; reason = "shell-exited-after-start" }
  }
  if ($null -eq (Get-ProcessById -ProcessId $detectedRuntimePid)) {
    return @{ ok = $false; reason = "runtime-exited-after-start"; runtimePid = $detectedRuntimePid }
  }

  return @{ ok = $true; runtimePid = $detectedRuntimePid }
}

function Start-ElectronWithHealthCheck {
  param([string]$WorkDir)
  $started = Start-ElectronShell -WorkDir $WorkDir
  $health = Wait-ElectronHealthy -ShellPid $started.Id -MaxSeconds (Get-HealthCheckSeconds)
  if (-not $health.ok) {
    throw "startup health check failed: $($health.reason)"
  }
  return @{
    shellPid = $started.Id
    runtimePid = $health.runtimePid
  }
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

  $started = Start-ElectronWithHealthCheck -WorkDir $WindowsWorkDir
  Write-Info "status: STARTED shell_pid=$($started.shellPid) runtime_pid=$($started.runtimePid)"
  exit 0
}

if ($Action -eq "restart") {
  Stop-ElectronShell
  $started = Start-ElectronWithHealthCheck -WorkDir $WindowsWorkDir
  Write-Info "status: RESTARTED shell_pid=$($started.shellPid) runtime_pid=$($started.runtimePid)"
  exit 0
}
