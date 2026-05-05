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

function Get-ProcessById {
  param([int]$ProcessId)
  if ($ProcessId -le 0) {
    return $null
  }

  return Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
}

function Get-TrackedProcess {
  $trackedPid = Get-TrackedPid
  if ($null -eq $trackedPid) {
    return $null
  }

  $process = Get-ProcessById -ProcessId $trackedPid
  if ($null -eq $process) {
    Remove-Item -Path $PidFile -Force -ErrorAction SilentlyContinue
    return $null
  }

  return $process
}

function Get-TauriDevShell {
  $candidates = Get-CimInstance Win32_Process -Filter "Name='cmd.exe' OR Name='powershell.exe'" |
    Where-Object {
      $cmd = $_.CommandLine
      $null -ne $cmd -and $cmd -match 'npm(\.cmd)?\s+run\s+tauri:dev'
    }

  $candidateList = @($candidates)
  if ($candidateList.Count -eq 0) {
    return $null
  }

  return $candidateList | Select-Object -First 1
}

function Save-TrackedPid {
  param([int]$ProcessId)
  if ($ProcessId -le 0) {
    return
  }

  Set-Content -Path $PidFile -Value $ProcessId -NoNewline
}

function Stop-ProcessTree {
  param([int]$ProcessId)
  if ($ProcessId -le 0) {
    return
  }

  Start-Process -FilePath 'taskkill.exe' -ArgumentList '/PID', "$ProcessId", '/T', '/F' -NoNewWindow -Wait
}

function Start-Client {
  if (!(Test-Path -Path $WindowsWorkDir)) {
    throw "Workdir not found: $WindowsWorkDir"
  }

  $tracked = Get-TrackedProcess
  if ($null -ne $tracked) {
    Write-Info "status: RUNNING pid=$($tracked.Id)"
    return
  }

  $existingShell = Get-TauriDevShell
  if ($null -ne $existingShell) {
    Save-TrackedPid -ProcessId ([int]$existingShell.ProcessId)
    Write-Info "status: RUNNING pid=$($existingShell.ProcessId) (existing tauri:dev shell detected)"
    return
  }

  $command = "cd /d `"$WindowsWorkDir`" && npm run tauri:dev"
  $process = Start-Process -FilePath 'cmd.exe' -ArgumentList '/d', '/c', $command -WorkingDirectory $WindowsWorkDir -PassThru
  Save-TrackedPid -ProcessId $process.Id
  Write-Info "status: STARTED pid=$($process.Id) (detached)"
}

function Stop-Client {
  $existing = Get-TrackedProcess
  if ($null -ne $existing) {
    Stop-ProcessTree -ProcessId $existing.Id
    Remove-Item -Path $PidFile -Force -ErrorAction SilentlyContinue
    Write-Info "status: STOPPED pid=$($existing.Id)"
    return
  }

  $shell = Get-TauriDevShell
  if ($null -eq $shell) {
    Write-Info 'status: STOPPED (no tracked process)'
    return
  }

  Stop-ProcessTree -ProcessId ([int]$shell.ProcessId)
  Remove-Item -Path $PidFile -Force -ErrorAction SilentlyContinue
  Write-Info "status: STOPPED pid=$($shell.ProcessId) (detected tauri:dev shell)"
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
    if ($null -ne $existing) {
      Write-Info "status: RUNNING pid=$($existing.Id)"
      break
    }

    $shell = Get-TauriDevShell
    if ($null -eq $shell) {
      Write-Info 'status: STOPPED'
    } else {
      Save-TrackedPid -ProcessId ([int]$shell.ProcessId)
      Write-Info "status: RUNNING pid=$($shell.ProcessId) (existing tauri:dev shell detected)"
    }
    break
  }
}
