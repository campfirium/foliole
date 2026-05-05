param(
  [ValidateSet("status", "start", "stop", "restart")]
  [string]$Action = "status",
  [string]$WindowsWorkDir = "C:\dev\foliole",
  [string]$PidFile = "$env:TEMP\foliole-electron-dev.pid",
  [string]$RuntimePidFile = "$env:TEMP\foliole-electron-runtime.pid",
  [string]$RuntimeSessionFile = "$env:TEMP\foliole-electron-runtime-session.txt",
  [string]$RuntimeHeadFile = "$env:TEMP\foliole-electron-runtime-head.txt",
  [string]$RuntimeHead = ""
)

$ErrorActionPreference = "Stop"

function Write-Info {
  param([string]$Message)
  Write-Host "[windows-restart-client] $Message"
}

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

function Save-TrackedPid {
  param([int]$ProcessId)
  if ($ProcessId -le 0) {
    return
  }
  Set-Content -Path $PidFile -Value $ProcessId -NoNewline
}

function Remove-TrackedPid {
  Remove-Item -Path $PidFile -Force -ErrorAction SilentlyContinue
}

function Get-TrackedRuntimePid {
  if (!(Test-Path -Path $RuntimePidFile)) {
    return $null
  }

  $raw = (Get-Content -Path $RuntimePidFile -Raw).Trim()
  if ([string]::IsNullOrWhiteSpace($raw)) {
    return $null
  }

  try {
    return [int]$raw
  } catch {
    return $null
  }
}

function Save-TrackedRuntimePid {
  param([int]$ProcessId)
  if ($ProcessId -le 0) {
    return
  }
  Set-Content -Path $RuntimePidFile -Value $ProcessId -NoNewline
}

function Remove-TrackedRuntimePid {
  Remove-Item -Path $RuntimePidFile -Force -ErrorAction SilentlyContinue
}

function Get-TrackedRuntimeSession {
  if (!(Test-Path -Path $RuntimeSessionFile)) {
    return $null
  }

  $raw = (Get-Content -Path $RuntimeSessionFile -Raw).Trim()
  if ([string]::IsNullOrWhiteSpace($raw)) {
    return $null
  }
  return $raw
}

function Save-TrackedRuntimeSession {
  param([string]$Session)
  if ([string]::IsNullOrWhiteSpace($Session)) {
    return
  }
  Set-Content -Path $RuntimeSessionFile -Value $Session -NoNewline
}

function Remove-TrackedRuntimeSession {
  Remove-Item -Path $RuntimeSessionFile -Force -ErrorAction SilentlyContinue
}

function Get-RepoHead {
  param([string]$WorkDir)
  if (-not [string]::IsNullOrWhiteSpace($RuntimeHead)) {
    return $RuntimeHead.Trim()
  }
  try {
    $head = (git -C $WorkDir rev-parse HEAD 2>$null | Select-Object -First 1).Trim()
    if ([string]::IsNullOrWhiteSpace($head)) {
      return $null
    }
    return $head
  } catch {
    return $null
  }
}

function Get-TrackedRuntimeHead {
  if (!(Test-Path -Path $RuntimeHeadFile)) {
    return $null
  }

  $raw = (Get-Content -Path $RuntimeHeadFile -Raw).Trim()
  if ([string]::IsNullOrWhiteSpace($raw)) {
    return $null
  }
  return $raw
}

function Save-TrackedRuntimeHead {
  param([string]$Head)
  if ([string]::IsNullOrWhiteSpace($Head)) {
    return
  }
  Set-Content -Path $RuntimeHeadFile -Value $Head -NoNewline
}

function Remove-TrackedRuntimeHead {
  Remove-Item -Path $RuntimeHeadFile -Force -ErrorAction SilentlyContinue
}

function New-BootSession {
  return [guid]::NewGuid().ToString("N")
}

function Resolve-ExpectedRuntimePath {
  param([string]$WorkDir = "")

  if ([string]::IsNullOrWhiteSpace($WorkDir)) {
    return ""
  }

  return [System.IO.Path]::GetFullPath((Join-Path $WorkDir "node_modules\electron\dist\electron.exe"))
}

function Test-ProcessMatchesExpectedRuntime {
  param(
    $Process,
    [string]$ExpectedRuntimePath = ""
  )

  if ([string]::IsNullOrWhiteSpace($ExpectedRuntimePath) -or $null -eq $Process) {
    return $true
  }

  try {
    $processPath = $Process.Path
    if ([string]::IsNullOrWhiteSpace($processPath)) {
      return $false
    }
    return [string]::Equals(
      [System.IO.Path]::GetFullPath($processPath),
      $ExpectedRuntimePath,
      [System.StringComparison]::OrdinalIgnoreCase
    )
  } catch {
    return $false
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

  $proc = Get-ProcessById -ProcessId $trackedPid
  if ($null -eq $proc) {
    Remove-TrackedPid
    return $null
  }
  return $proc
}

function Get-TrackedRuntimeProcess {
  param([string]$WorkDir = "")

  $trackedPid = Get-TrackedRuntimePid
  if ($null -eq $trackedPid) {
    return $null
  }

  $expectedRuntimePath = Resolve-ExpectedRuntimePath -WorkDir $WorkDir
  $proc = Get-ProcessById -ProcessId $trackedPid
  if ($null -eq $proc) {
    Remove-TrackedRuntimePid
    Remove-TrackedRuntimeSession
    Remove-TrackedRuntimeHead
    return $null
  }
  if (-not (Test-ProcessMatchesExpectedRuntime -Process $proc -ExpectedRuntimePath $expectedRuntimePath)) {
    Remove-TrackedRuntimePid
    Remove-TrackedRuntimeSession
    Remove-TrackedRuntimeHead
    return $null
  }
  return $proc
}

function Get-AppReadyEvent {
  param([string]$WorkDir)

  $markerPath = Resolve-ReadyMarkerPath -WorkDir $WorkDir
  if (!(Test-Path -Path $markerPath)) {
    return $null
  }

  try {
    $event = Get-Content -Path $markerPath -Raw | ConvertFrom-Json
    if ($null -eq $event) {
      return $null
    }
    if ("$($event.stage)".Trim() -ne "app_ready") {
      return $null
    }
    return $event
  } catch {
    return $null
  }
}

function Resolve-BridgeReadyMarkerPath {
  param([string]$WorkDir)
  return Join-Path $WorkDir ".windows-native-bridge-ready.json"
}

function Get-BridgeReadyEvent {
  param([string]$WorkDir)

  $markerPath = Resolve-BridgeReadyMarkerPath -WorkDir $WorkDir
  if (!(Test-Path -Path $markerPath)) {
    return $null
  }

  try {
    $event = Get-Content -Path $markerPath -Raw | ConvertFrom-Json
    if ($null -eq $event) {
      return $null
    }
    if ("$($event.stage)".Trim() -ne "bridge_ready") {
      return $null
    }
    return $event
  } catch {
    return $null
  }
}

function Test-RuntimeAppReady {
  param(
    [string]$WorkDir,
    [int]$RuntimePid,
    [string]$ExpectedSession = ""
  )

  if ($RuntimePid -le 0) {
    return @{ ok = $false; reason = "runtime-missing" }
  }

  $event = Get-AppReadyEvent -WorkDir $WorkDir
  if ($null -eq $event) {
    return @{ ok = $false; reason = "app-ready-missing" }
  }

  $markerPid = 0
  try {
    $markerPid = [int]$event.pid
  } catch {
    $markerPid = 0
  }

  $markerSession = ""
  if ($null -ne $event.session) {
    $markerSession = "$($event.session)".Trim()
  }

  if ($markerPid -ne $RuntimePid) {
    return @{ ok = $false; reason = "app-ready-pid-mismatch"; markerPid = $markerPid; markerSession = $markerSession }
  }
  if (-not [string]::IsNullOrWhiteSpace($ExpectedSession) -and $markerSession -ne $ExpectedSession) {
    return @{ ok = $false; reason = "app-ready-session-mismatch"; markerPid = $markerPid; markerSession = $markerSession }
  }

  return @{ ok = $true; markerPid = $markerPid; markerSession = $markerSession }
}

function Test-RuntimeBridgeReady {
  param(
    [string]$WorkDir,
    [int]$RuntimePid,
    [string]$ExpectedSession = ""
  )

  if ($RuntimePid -le 0) {
    return @{ ok = $false; reason = "runtime-missing" }
  }

  $event = Get-BridgeReadyEvent -WorkDir $WorkDir
  if ($null -eq $event) {
    return @{ ok = $false; reason = "bridge-ready-missing" }
  }

  $bridgeMarkerPid = 0
  try {
    $bridgeMarkerPid = [int]$event.pid
  } catch {
    $bridgeMarkerPid = 0
  }

  $bridgeMarkerSession = ""
  if ($null -ne $event.session) {
    $bridgeMarkerSession = "$($event.session)".Trim()
  }

  if ($bridgeMarkerPid -ne $RuntimePid) {
    return @{ ok = $false; reason = "bridge-ready-pid-mismatch"; bridgeMarkerPid = $bridgeMarkerPid; bridgeMarkerSession = $bridgeMarkerSession }
  }
  if (-not [string]::IsNullOrWhiteSpace($ExpectedSession) -and $bridgeMarkerSession -ne $ExpectedSession) {
    return @{ ok = $false; reason = "bridge-ready-session-mismatch"; bridgeMarkerPid = $bridgeMarkerPid; bridgeMarkerSession = $bridgeMarkerSession }
  }

  $bridgeAvailable = $false
  try {
    if ($null -ne $event.payload) {
      $bridgeAvailable = [bool]$event.payload.bridgeAvailable
    }
  } catch {
    $bridgeAvailable = $false
  }
  if (-not $bridgeAvailable) {
    return @{ ok = $false; reason = "bridge-unavailable"; bridgeMarkerPid = $bridgeMarkerPid; bridgeMarkerSession = $bridgeMarkerSession }
  }

  return @{ ok = $true; bridgeMarkerPid = $bridgeMarkerPid; bridgeMarkerSession = $bridgeMarkerSession }
}

function Test-RuntimeTrusted {
  param(
    [string]$WorkDir,
    [int]$RuntimePid,
    [string]$ExpectedSession = ""
  )

  $appReady = Test-RuntimeAppReady -WorkDir $WorkDir -RuntimePid $RuntimePid -ExpectedSession $ExpectedSession
  if (-not $appReady.ok) {
    return $appReady
  }

  $bridgeReady = Test-RuntimeBridgeReady -WorkDir $WorkDir -RuntimePid $RuntimePid -ExpectedSession $ExpectedSession
  if (-not $bridgeReady.ok) {
    return @{
      ok = $false
      reason = $bridgeReady.reason
      markerPid = $appReady.markerPid
      markerSession = $appReady.markerSession
      bridgeMarkerPid = $bridgeReady.bridgeMarkerPid
      bridgeMarkerSession = $bridgeReady.bridgeMarkerSession
    }
  }

  return @{
    ok = $true
    markerPid = $appReady.markerPid
    markerSession = $appReady.markerSession
    bridgeMarkerPid = $bridgeReady.bridgeMarkerPid
    bridgeMarkerSession = $bridgeReady.bridgeMarkerSession
  }
}

function Format-AppReadyDetails {
  param($ReadyState)

  if ($null -eq $ReadyState) {
    return ""
  }

  $details = ""
  if ($ReadyState.ContainsKey('markerPid') -and $ReadyState.markerPid -gt 0) {
    $details += " marker_pid=$($ReadyState.markerPid)"
  }
  if ($ReadyState.ContainsKey('markerSession') -and -not [string]::IsNullOrWhiteSpace($ReadyState.markerSession)) {
    $details += " marker_session=$($ReadyState.markerSession)"
  }
  if ($ReadyState.ContainsKey('bridgeMarkerPid') -and $ReadyState.bridgeMarkerPid -gt 0) {
    $details += " bridge_marker_pid=$($ReadyState.bridgeMarkerPid)"
  }
  if ($ReadyState.ContainsKey('bridgeMarkerSession') -and -not [string]::IsNullOrWhiteSpace($ReadyState.bridgeMarkerSession)) {
    $details += " bridge_marker_session=$($ReadyState.bridgeMarkerSession)"
  }
  return $details
}

function Get-ElectronRuntimeCandidates {
  param([string]$WorkDir = "")

  $expectedRuntimePath = Resolve-ExpectedRuntimePath -WorkDir $WorkDir

  $matched = @()
  $mainCandidates = @(Get-CimInstance Win32_Process -Filter "Name='electron.exe'" -ErrorAction SilentlyContinue)
  foreach ($candidate in $mainCandidates) {
    $commandLine = $candidate.CommandLine
    if ([string]::IsNullOrWhiteSpace($commandLine)) {
      continue
    }
    if ($commandLine -notmatch 'electron-dist[\\/]+main\.js') {
      continue
    }
    $mainProc = Get-ProcessById -ProcessId ([int]$candidate.ProcessId)
    if ($null -ne $mainProc -and (Test-ProcessMatchesExpectedRuntime -Process $mainProc -ExpectedRuntimePath $expectedRuntimePath)) {
      $matched += $mainProc
    }
  }

  if ($matched.Count -eq 0) {
    return @()
  }

  try {
    return @($matched | Sort-Object StartTime)
  } catch {
    return @($matched)
  }
}

function Get-ElectronRuntimeProcess {
  param([string]$WorkDir = "")

  $tracked = Get-TrackedRuntimeProcess -WorkDir $WorkDir
  if ($null -ne $tracked) {
    return $tracked
  }

  $candidates = @(Get-ElectronRuntimeCandidates -WorkDir $WorkDir)
  if ($candidates.Count -eq 1) {
    return $candidates[0]
  }

  return $null
}

function Get-StaleElectronRuntimeProcesses {
  param([string]$WorkDir = "")

  $trackedPid = Get-TrackedRuntimePid
  $candidates = @(Get-ElectronRuntimeCandidates -WorkDir $WorkDir)
  if ($null -eq $trackedPid) {
    return $candidates
  }
  return @($candidates | Where-Object { $_.Id -ne $trackedPid })
}

function Stop-ProcessTree {
  param([int]$ProcessId)
  if ($ProcessId -le 0) {
    return
  }
  Start-Process -FilePath "taskkill.exe" -ArgumentList "/PID", "$ProcessId", "/T", "/F" -NoNewWindow -Wait -ErrorAction SilentlyContinue
  Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue
}

function Stop-MatchingProcesses {
  param(
    [string]$NamePattern,
    [string]$CommandPattern
  )

  $candidates = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue)
  foreach ($candidate in $candidates) {
    if (-not [string]::IsNullOrWhiteSpace($NamePattern) -and $candidate.Name -notmatch $NamePattern) {
      continue
    }
    $commandLine = $candidate.CommandLine
    if (-not [string]::IsNullOrWhiteSpace($CommandPattern) -and ($null -eq $commandLine -or $commandLine -notmatch $CommandPattern)) {
      continue
    }
    Stop-ProcessTree -ProcessId ([int]$candidate.ProcessId)
  }
}

function Stop-StaleFolioleDevProcesses {
  param([string]$WorkDir)

  $escapedWorkDir = [regex]::Escape($WorkDir)
  Stop-MatchingProcesses -NamePattern '^electron(?:\.exe)?$' -CommandPattern ($escapedWorkDir + '.*electron-dist[\\/]+main\.js')
  Stop-MatchingProcesses -NamePattern '^foliole-tauri-core(?:\.exe)?$' -CommandPattern ''
  Stop-MatchingProcesses -NamePattern '^cargo(?:\.exe)?$' -CommandPattern $escapedWorkDir
  Stop-MatchingProcesses -NamePattern '^node(?:\.exe)?$' -CommandPattern ($escapedWorkDir + '.*vite(?:\.js)?')
  Stop-MatchingProcesses -NamePattern '^node(?:\.exe)?$' -CommandPattern ($escapedWorkDir + '.*tauri')
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

function Start-ElectronShell {
  param(
    [string]$WorkDir,
    [string]$BootSession = ""
  )
  if (!(Test-Path -Path $WorkDir)) {
    throw "Workdir not found: $WorkDir"
  }

  $npmCmd = Resolve-NpmCommand
  $nodeDir = Split-Path -Path $npmCmd -Parent
  $bootSessionValue = $BootSession
  if ([string]::IsNullOrWhiteSpace($bootSessionValue)) {
    $bootSessionValue = New-BootSession
  }
  $command = "cd /d `"$WorkDir`" && set PATH=$nodeDir;%PATH% && set FOLIOLE_BOOT_SESSION=$bootSessionValue && set ELECTRON_RUN_AS_NODE= && call `"$npmCmd`" run electron:dev"

  $proc = Start-Process `
    -FilePath "cmd.exe" `
    -ArgumentList "/d", "/k", $command `
    -WorkingDirectory $WorkDir `
    -PassThru

  Save-TrackedPid -ProcessId $proc.Id
  Write-Info "electron:dev shell launched with visible terminal"
  return $proc
}

function Wait-ElectronHealthy {
  param(
    [int]$ShellPid,
    [string]$WorkDir = "",
    [int]$MaxSeconds = 10
  )

  for ($second = 0; $second -lt $MaxSeconds; $second += 1) {
    $shell = Get-ProcessById -ProcessId $ShellPid
    if ($null -eq $shell) {
      return @{ ok = $false; reason = "shell-exited" }
    }

    $runtime = Get-ElectronRuntimeProcess -WorkDir $WorkDir
    if ($null -ne $runtime) {
      return @{ ok = $true; runtimePid = $runtime.Id }
    }

    Start-Sleep -Seconds 1
  }

  return @{ ok = $false; reason = "runtime-not-detected" }
}

function Start-ElectronWithHealthCheck {
  param([string]$WorkDir)
  $bootSession = New-BootSession
  Reset-ReadyMarker -WorkDir $WorkDir
  Stop-StaleFolioleDevProcesses -WorkDir $WorkDir
  $started = Start-ElectronShell -WorkDir $WorkDir -BootSession $bootSession
  $health = Wait-ElectronHealthy -ShellPid $started.Id -WorkDir $WorkDir -MaxSeconds (Get-HealthCheckSeconds)
  if (-not $health.ok) {
    throw "startup health check failed: $($health.reason)"
  }
  $ready = Wait-AppReadyMarker -WorkDir $WorkDir -RuntimePid $health.runtimePid -ExpectedSession $bootSession -MaxSeconds (Get-HealthCheckSeconds)
  if (-not $ready.ok) {
    throw "startup health check failed: $($ready.reason)"
  }
  $bridgeReady = Wait-BridgeReadyMarker -WorkDir $WorkDir -RuntimePid $health.runtimePid -ExpectedSession $bootSession -MaxSeconds (Get-HealthCheckSeconds)
  if (-not $bridgeReady.ok) {
    throw "startup health check failed: $($bridgeReady.reason)"
  }

  Save-TrackedRuntimeSession -Session $bootSession

  return @{ shellPid = $started.Id; runtimePid = $health.runtimePid }
}

function Test-RendererUrlReady {
  param([string]$Url)
  if ([string]::IsNullOrWhiteSpace($Url)) {
    return $false
  }
  try {
    $response = Invoke-WebRequest -Uri $Url -Method GET -TimeoutSec 2 -UseBasicParsing
    return ($response.StatusCode -ge 200 -and $response.StatusCode -lt 300)
  } catch {
    return $false
  }
}

function Resolve-PreferredVitePort {
  $raw = $env:FOLIOLE_VITE_PORT
  if ([string]::IsNullOrWhiteSpace($raw)) {
    return 24600
  }
  try {
    $port = [int]$raw
    if ($port -gt 0 -and $port -lt 65536) {
      return $port
    }
  } catch {
    return 24600
  }
  return 24600
}

function Resolve-RendererUrl {
  if (Test-RendererUrlReady -Url $env:FOLIOLE_ELECTRON_RENDERER_URL) {
    return $env:FOLIOLE_ELECTRON_RENDERER_URL
  }
  if (Test-RendererUrlReady -Url $env:ELECTRON_RENDERER_URL) {
    return $env:ELECTRON_RENDERER_URL
  }

  $preferredPort = Resolve-PreferredVitePort
  $candidatePorts = @()
  $candidatePorts += $preferredPort
  for ($offset = 0; $offset -lt 8; $offset += 1) {
    $candidatePorts += ($preferredPort + 100 + $offset)
    $candidatePorts += (5173 + $offset)
    $candidatePorts += (3000 + $offset)
  }

  foreach ($port in $candidatePorts | Select-Object -Unique) {
    $url = "http://127.0.0.1:$port"
    if (Test-RendererUrlReady -Url $url) {
      return $url
    }
  }

  throw "renderer url not found; ensure vite dev server is running"
}

function Wait-RuntimeByPid {
  param(
    [int]$RuntimePid,
    [int]$MaxSeconds = 10
  )

  for ($second = 0; $second -lt $MaxSeconds; $second += 1) {
    $runtime = Get-ProcessById -ProcessId $RuntimePid
    if ($null -ne $runtime) {
      return @{ ok = $true; runtimePid = $runtime.Id }
    }
    Start-Sleep -Seconds 1
  }
  return @{ ok = $false; reason = "runtime-not-detected" }
}

function Resolve-ReadyMarkerPath {
  param([string]$WorkDir)
  return Join-Path $WorkDir ".windows-native-boot-ready.json"
}

function Reset-ReadyMarker {
  param([string]$WorkDir)
  $markerPath = Resolve-ReadyMarkerPath -WorkDir $WorkDir
  Remove-Item -Path $markerPath -Force -ErrorAction SilentlyContinue
  $bridgeMarkerPath = Resolve-BridgeReadyMarkerPath -WorkDir $WorkDir
  Remove-Item -Path $bridgeMarkerPath -Force -ErrorAction SilentlyContinue
}

function Wait-AppReadyMarker {
  param(
    [string]$WorkDir,
    [int]$RuntimePid,
    [string]$ExpectedSession = "",
    [int]$MaxSeconds = 10
  )

  $markerPath = Resolve-ReadyMarkerPath -WorkDir $WorkDir
  for ($second = 0; $second -lt $MaxSeconds; $second += 1) {
    $runtime = Get-ProcessById -ProcessId $RuntimePid
    if ($null -eq $runtime) {
      return @{ ok = $false; reason = "runtime-exited-before-app-ready" }
    }
    if (Test-Path -Path $markerPath) {
      $readyState = Test-RuntimeAppReady -WorkDir $WorkDir -RuntimePid $RuntimePid -ExpectedSession $ExpectedSession
      if ($readyState.ok) {
        return @{ ok = $true; runtimePid = $RuntimePid; markerSession = $readyState.markerSession }
      }
      if ($readyState.reason -ne "app-ready-missing") {
        return $readyState
      }
    }
    Start-Sleep -Seconds 1
  }
  return @{ ok = $false; reason = "app-ready-timeout" }
}

function Wait-BridgeReadyMarker {
  param(
    [string]$WorkDir,
    [int]$RuntimePid,
    [string]$ExpectedSession = "",
    [int]$MaxSeconds = 10
  )

  $markerPath = Resolve-BridgeReadyMarkerPath -WorkDir $WorkDir
  for ($second = 0; $second -lt $MaxSeconds; $second += 1) {
    $runtime = Get-ProcessById -ProcessId $RuntimePid
    if ($null -eq $runtime) {
      return @{ ok = $false; reason = "runtime-exited-before-bridge-ready" }
    }
    if (Test-Path -Path $markerPath) {
      $readyState = Test-RuntimeBridgeReady -WorkDir $WorkDir -RuntimePid $RuntimePid -ExpectedSession $ExpectedSession
      if ($readyState.ok) {
        return @{ ok = $true; runtimePid = $RuntimePid; bridgeMarkerSession = $readyState.bridgeMarkerSession }
      }
      if ($readyState.reason -ne "bridge-ready-missing") {
        return $readyState
      }
    }
    Start-Sleep -Seconds 1
  }
  return @{ ok = $false; reason = "bridge-ready-timeout" }
}

function Wait-ProcessExit {
  param(
    [int]$ProcessId,
    [int]$MaxSeconds = 10
  )

  for ($second = 0; $second -lt $MaxSeconds; $second += 1) {
    $proc = Get-ProcessById -ProcessId $ProcessId
    if ($null -eq $proc) {
      return $true
    }
    Start-Sleep -Seconds 1
  }
  return $false
}

function Restart-ElectronRuntimeOnly {
  param(
    [string]$WorkDir,
    $RuntimeProcess
  )

  if ($null -eq $RuntimeProcess) {
    return @{ ok = $false; reason = "runtime-not-found" }
  }

  $runtimePath = Join-Path $WorkDir "node_modules\electron\dist\electron.exe"
  if (!(Test-Path -Path $runtimePath)) {
    try {
      $runtimePath = $RuntimeProcess.Path
    } catch {
      $runtimePath = ""
    }
  }
  if ([string]::IsNullOrWhiteSpace($runtimePath)) {
    return @{ ok = $false; reason = "runtime-path-unavailable" }
  }

  $oldRuntimePid = $RuntimeProcess.Id
  Stop-ProcessTree -ProcessId $oldRuntimePid
  if (-not (Wait-ProcessExit -ProcessId $oldRuntimePid -MaxSeconds (Get-HealthCheckSeconds))) {
    return @{ ok = $false; reason = "old-runtime-still-running"; oldRuntimePid = $oldRuntimePid }
  }

  Reset-ReadyMarker -WorkDir $WorkDir
  $rendererUrl = Resolve-RendererUrl
  $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $stdoutLog = Join-Path $env:TEMP "foliole-runtime-restart-$stamp.out.log"
  $stderrLog = Join-Path $env:TEMP "foliole-runtime-restart-$stamp.err.log"
  $previousRendererUrl = $env:ELECTRON_RENDERER_URL
  $hadRunAsNode = Test-Path Env:ELECTRON_RUN_AS_NODE
  $previousRunAsNode = $env:ELECTRON_RUN_AS_NODE
  $hadBootSession = Test-Path Env:FOLIOLE_BOOT_SESSION
  $previousBootSession = $env:FOLIOLE_BOOT_SESSION
  $bootSession = New-BootSession
  $env:ELECTRON_RENDERER_URL = $rendererUrl
  $env:FOLIOLE_BOOT_SESSION = $bootSession
  Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
  try {
    $started = Start-Process `
      -FilePath $runtimePath `
      -ArgumentList @("electron-dist/electron/main.js") `
      -WorkingDirectory $WorkDir `
      -PassThru `
      -RedirectStandardOutput $stdoutLog `
      -RedirectStandardError $stderrLog
  } finally {
    $env:ELECTRON_RENDERER_URL = $previousRendererUrl
    if ($hadBootSession) {
      $env:FOLIOLE_BOOT_SESSION = $previousBootSession
    } else {
      Remove-Item Env:FOLIOLE_BOOT_SESSION -ErrorAction SilentlyContinue
    }
    if ($hadRunAsNode) {
      $env:ELECTRON_RUN_AS_NODE = $previousRunAsNode
    } else {
      Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
    }
  }

  $health = Wait-RuntimeByPid -RuntimePid $started.Id -MaxSeconds (Get-HealthCheckSeconds)
  if (-not $health.ok) {
    return @{ ok = $false; reason = $health.reason; stdoutLog = $stdoutLog; stderrLog = $stderrLog }
  }
  $ready = Wait-AppReadyMarker -WorkDir $WorkDir -RuntimePid $health.runtimePid -ExpectedSession $bootSession -MaxSeconds (Get-HealthCheckSeconds)
  if (-not $ready.ok) {
    return @{ ok = $false; reason = $ready.reason; runtimePid = $health.runtimePid; stdoutLog = $stdoutLog; stderrLog = $stderrLog }
  }
  $bridgeReady = Wait-BridgeReadyMarker -WorkDir $WorkDir -RuntimePid $health.runtimePid -ExpectedSession $bootSession -MaxSeconds (Get-HealthCheckSeconds)
  if (-not $bridgeReady.ok) {
    return @{ ok = $false; reason = $bridgeReady.reason; runtimePid = $health.runtimePid; stdoutLog = $stdoutLog; stderrLog = $stderrLog }
  }
  Save-TrackedRuntimePid -ProcessId $health.runtimePid
  Save-TrackedRuntimeSession -Session $bootSession
  Save-TrackedRuntimeHead -Head (Get-RepoHead -WorkDir $WorkDir)
  return @{
    ok = $true
    oldRuntimePid = $oldRuntimePid
    runtimePid = $health.runtimePid
    rendererUrl = $rendererUrl
    stdoutLog = $stdoutLog
    stderrLog = $stderrLog
  }
}

function Start-ElectronRuntimeOnly {
  param([string]$WorkDir)
  $runtimePath = Join-Path $WorkDir "node_modules\electron\dist\electron.exe"
  if (!(Test-Path -Path $runtimePath)) {
    return @{ ok = $false; reason = "runtime-binary-not-found" }
  }

  Reset-ReadyMarker -WorkDir $WorkDir
  $rendererUrl = Resolve-RendererUrl
  $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $stdoutLog = Join-Path $env:TEMP "foliole-runtime-$stamp.out.log"
  $stderrLog = Join-Path $env:TEMP "foliole-runtime-$stamp.err.log"
  $previousRendererUrl = $env:ELECTRON_RENDERER_URL
  $hadRunAsNode = Test-Path Env:ELECTRON_RUN_AS_NODE
  $previousRunAsNode = $env:ELECTRON_RUN_AS_NODE
  $hadBootSession = Test-Path Env:FOLIOLE_BOOT_SESSION
  $previousBootSession = $env:FOLIOLE_BOOT_SESSION
  $bootSession = New-BootSession
  $env:ELECTRON_RENDERER_URL = $rendererUrl
  $env:FOLIOLE_BOOT_SESSION = $bootSession
  Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
  try {
    $started = Start-Process `
      -FilePath $runtimePath `
      -ArgumentList @("electron-dist/electron/main.js") `
      -WorkingDirectory $WorkDir `
      -PassThru `
      -RedirectStandardOutput $stdoutLog `
      -RedirectStandardError $stderrLog
  } finally {
    $env:ELECTRON_RENDERER_URL = $previousRendererUrl
    if ($hadBootSession) {
      $env:FOLIOLE_BOOT_SESSION = $previousBootSession
    } else {
      Remove-Item Env:FOLIOLE_BOOT_SESSION -ErrorAction SilentlyContinue
    }
    if ($hadRunAsNode) {
      $env:ELECTRON_RUN_AS_NODE = $previousRunAsNode
    } else {
      Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
    }
  }

  $health = Wait-RuntimeByPid -RuntimePid $started.Id -MaxSeconds (Get-HealthCheckSeconds)
  if (-not $health.ok) {
    return @{ ok = $false; reason = $health.reason; stdoutLog = $stdoutLog; stderrLog = $stderrLog }
  }
  $ready = Wait-AppReadyMarker -WorkDir $WorkDir -RuntimePid $health.runtimePid -ExpectedSession $bootSession -MaxSeconds (Get-HealthCheckSeconds)
  if (-not $ready.ok) {
    return @{ ok = $false; reason = $ready.reason; runtimePid = $health.runtimePid; stdoutLog = $stdoutLog; stderrLog = $stderrLog }
  }
  $bridgeReady = Wait-BridgeReadyMarker -WorkDir $WorkDir -RuntimePid $health.runtimePid -ExpectedSession $bootSession -MaxSeconds (Get-HealthCheckSeconds)
  if (-not $bridgeReady.ok) {
    return @{ ok = $false; reason = $bridgeReady.reason; runtimePid = $health.runtimePid; stdoutLog = $stdoutLog; stderrLog = $stderrLog }
  }
  Save-TrackedRuntimePid -ProcessId $health.runtimePid
  Save-TrackedRuntimeSession -Session $bootSession
  Save-TrackedRuntimeHead -Head (Get-RepoHead -WorkDir $WorkDir)
  return @{
    ok = $true
    runtimePid = $health.runtimePid
    rendererUrl = $rendererUrl
    stdoutLog = $stdoutLog
    stderrLog = $stderrLog
  }
}

function Stop-Electron {
  $tracked = Get-TrackedProcess
  if ($null -ne $tracked) {
    Stop-ProcessTree -ProcessId $tracked.Id
    Write-Info "stopped tracked shell pid=$($tracked.Id)"
  }

  $runtime = Get-TrackedRuntimeProcess -WorkDir $WindowsWorkDir
  if ($null -ne $runtime) {
    Stop-ProcessTree -ProcessId $runtime.Id
    Write-Info "stopped runtime pid=$($runtime.Id)"
  }

  $staleRuntimes = @(Get-StaleElectronRuntimeProcesses -WorkDir $WindowsWorkDir)
  foreach ($staleRuntime in $staleRuntimes) {
    Stop-ProcessTree -ProcessId $staleRuntime.Id
    Write-Info "stopped stale runtime pid=$($staleRuntime.Id)"
  }

  Remove-TrackedPid
  Remove-TrackedRuntimePid
  Remove-TrackedRuntimeSession
  Remove-TrackedRuntimeHead
  Reset-ReadyMarker -WorkDir $WindowsWorkDir
  Write-Info "status: STOPPED"
}

if ($Action -eq "status") {
  $tracked = Get-TrackedProcess
  $runtime = Get-TrackedRuntimeProcess -WorkDir $WindowsWorkDir
  $runtimeSession = Get-TrackedRuntimeSession
  $runtimeHead = Get-TrackedRuntimeHead
  $staleRuntimes = @(Get-StaleElectronRuntimeProcesses -WorkDir $WindowsWorkDir)
  $runtimeTrust = $null
  if ($null -ne $runtime) {
    $runtimeTrust = Test-RuntimeTrusted -WorkDir $WindowsWorkDir -RuntimePid $runtime.Id -ExpectedSession $runtimeSession
  }
  if ($null -ne $tracked) {
    if ($staleRuntimes.Count -gt 0) {
      Write-Info "status: STOPPED reason=stale-runtime-detected shell_pid=$($tracked.Id) runtime_pid=$($staleRuntimes[0].Id)"
    } elseif ($null -ne $runtime -and -not $runtimeTrust.ok) {
      Write-Info "status: STOPPED reason=$($runtimeTrust.reason) shell_pid=$($tracked.Id) runtime_pid=$($runtime.Id)$(Format-AppReadyDetails -ReadyState $runtimeTrust)"
    } elseif ($null -ne $runtime) {
      $headInfo = ""
      if ($null -ne $runtimeHead) {
        $headInfo = " head=$runtimeHead"
      }
      Write-Info "status: RUNNING pid=$($tracked.Id) runtime_pid=$($runtime.Id)$headInfo"
    } else {
      Write-Info "status: STOPPED reason=runtime-missing shell_pid=$($tracked.Id)"
    }
    exit 0
  }

  if ($staleRuntimes.Count -gt 0) {
    Write-Info "status: STOPPED reason=stale-runtime-detected runtime_pid=$($staleRuntimes[0].Id)"
    exit 0
  }

  if ($null -ne $runtime -and -not $runtimeTrust.ok) {
    Write-Info "status: STOPPED reason=$($runtimeTrust.reason) runtime_pid=$($runtime.Id)$(Format-AppReadyDetails -ReadyState $runtimeTrust)"
    exit 0
  }

  if ($null -ne $runtime) {
    $headInfo = ""
    if ($null -ne $runtimeHead) {
      $headInfo = " head=$runtimeHead"
    }
    Write-Info "status: RUNNING runtime_pid=$($runtime.Id)$headInfo"
    exit 0
  }

  Write-Info "status: STOPPED"
  exit 0
}

if ($Action -eq "stop") {
  Stop-Electron
  exit 0
}

if ($Action -eq "start") {
  $tracked = Get-TrackedProcess
  if ($null -ne $tracked) {
    $runtime = Get-TrackedRuntimeProcess -WorkDir $WindowsWorkDir
    $runtimeSession = Get-TrackedRuntimeSession
    $staleRuntimes = @(Get-StaleElectronRuntimeProcesses -WorkDir $WindowsWorkDir)
    $runtimeTrust = $null
    if ($staleRuntimes.Count -gt 0) {
      foreach ($staleRuntime in $staleRuntimes) {
        Stop-ProcessTree -ProcessId $staleRuntime.Id
      }
    }
    if ($null -ne $runtime) {
      $runtimeTrust = Test-RuntimeTrusted -WorkDir $WindowsWorkDir -RuntimePid $runtime.Id -ExpectedSession $runtimeSession
    }
    if ($null -ne $runtime) {
      if ($runtimeTrust.ok) {
        Write-Info "status: RUNNING pid=$($tracked.Id) runtime_pid=$($runtime.Id)"
        exit 0
      }
      Write-Info "discarded untrusted runtime pid=$($runtime.Id) reason=$($runtimeTrust.reason)$(Format-AppReadyDetails -ReadyState $runtimeTrust)"
    }
    Stop-Electron
    try {
      $started = Start-ElectronWithHealthCheck -WorkDir $WindowsWorkDir
    } catch {
      Write-Info "status: START_FAILED reason=$($_.Exception.Message)"
      exit 1
    }
    Save-TrackedRuntimePid -ProcessId $started.runtimePid
    Save-TrackedRuntimeHead -Head (Get-RepoHead -WorkDir $WindowsWorkDir)
    Write-Info "status: STARTED shell_pid=$($started.shellPid) runtime_pid=$($started.runtimePid)"
    exit 0
  }

  $runtime = Get-TrackedRuntimeProcess -WorkDir $WindowsWorkDir
  $runtimeSession = Get-TrackedRuntimeSession
  $staleRuntimes = @(Get-StaleElectronRuntimeProcesses -WorkDir $WindowsWorkDir)
  $runtimeTrust = $null
  if ($staleRuntimes.Count -gt 0) {
    Stop-StaleFolioleDevProcesses -WorkDir $WindowsWorkDir
  }
  if ($null -ne $runtime) {
    $runtimeTrust = Test-RuntimeTrusted -WorkDir $WindowsWorkDir -RuntimePid $runtime.Id -ExpectedSession $runtimeSession
  }
  if ($null -ne $runtime) {
    if ($runtimeTrust.ok) {
      Write-Info "status: RUNNING runtime_pid=$($runtime.Id)"
      exit 0
    }
    Stop-ProcessTree -ProcessId $runtime.Id
    Remove-TrackedRuntimePid
    Remove-TrackedRuntimeSession
    Remove-TrackedRuntimeHead
    Write-Info "discarded untrusted runtime pid=$($runtime.Id) reason=$($runtimeTrust.reason)$(Format-AppReadyDetails -ReadyState $runtimeTrust)"
  }

  try {
    $started = Start-ElectronWithHealthCheck -WorkDir $WindowsWorkDir
  } catch {
    Write-Info "status: START_FAILED reason=$($_.Exception.Message)"
    exit 1
  }
  Save-TrackedRuntimePid -ProcessId $started.runtimePid
  Save-TrackedRuntimeHead -Head (Get-RepoHead -WorkDir $WindowsWorkDir)
  Write-Info "status: STARTED shell_pid=$($started.shellPid) runtime_pid=$($started.runtimePid)"
  exit 0
}

if ($Action -eq "restart") {
  $tracked = Get-TrackedProcess
  $runtime = Get-TrackedRuntimeProcess -WorkDir $WindowsWorkDir
  $runtimeSession = Get-TrackedRuntimeSession
  $runtimeTrust = $null
  $staleRuntimes = @(Get-StaleElectronRuntimeProcesses -WorkDir $WindowsWorkDir)
  if ($staleRuntimes.Count -gt 0) {
    foreach ($staleRuntime in $staleRuntimes) {
      Stop-ProcessTree -ProcessId $staleRuntime.Id
    }
  }
  if ($null -ne $runtime) {
    $runtimeTrust = Test-RuntimeTrusted -WorkDir $WindowsWorkDir -RuntimePid $runtime.Id -ExpectedSession $runtimeSession
  }
  if (($null -eq $runtime -and $null -ne $tracked) -or ($null -ne $runtime -and -not $runtimeTrust.ok)) {
    if ($null -ne $runtime -and -not $runtimeTrust.ok) {
      Write-Info "discarded untrusted runtime pid=$($runtime.Id) reason=$($runtimeTrust.reason)$(Format-AppReadyDetails -ReadyState $runtimeTrust)"
    }
    Stop-Electron
    try {
      $started = Start-ElectronWithHealthCheck -WorkDir $WindowsWorkDir
    } catch {
      Write-Info "status: RESTART_FAILED reason=$($_.Exception.Message)"
      exit 1
    }
    Save-TrackedRuntimePid -ProcessId $started.runtimePid
    Save-TrackedRuntimeHead -Head (Get-RepoHead -WorkDir $WindowsWorkDir)
    Write-Info "status: RESTARTED mode=full-restart shell_pid=$($started.shellPid) runtime_pid=$($started.runtimePid)"
    exit 0
  }
  if ($null -eq $runtime) {
    Write-Info "status: STOPPED"
    exit 1
  }

  $restarted = Restart-ElectronRuntimeOnly -WorkDir $WindowsWorkDir -RuntimeProcess $runtime
  if (-not $restarted.ok) {
    Write-Info "status: RESTART_FAILED reason=$($restarted.reason) stdout_log=$($restarted.stdoutLog) stderr_log=$($restarted.stderrLog)"
    exit 1
  }

  $shellPidInfo = ""
  if ($null -ne $tracked) {
    $shellPidInfo = " shell_pid=$($tracked.Id)"
  }
  Write-Info "status: RESTARTED mode=runtime-only old_runtime_pid=$($restarted.oldRuntimePid) runtime_pid=$($restarted.runtimePid) renderer_url=$($restarted.rendererUrl)$shellPidInfo"
  exit 0
}
