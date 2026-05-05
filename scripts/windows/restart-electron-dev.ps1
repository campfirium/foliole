param(
  [ValidateSet("status", "start", "stop", "restart")]
  [string]$Action = "status",
  [string]$WindowsWorkDir = "C:\dev\foliole",
  [string]$PidFile = "$env:TEMP\foliole-electron-dev.pid",
  [string]$RuntimePidFile = "$env:TEMP\foliole-electron-runtime.pid"
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
  $trackedPid = Get-TrackedRuntimePid
  if ($null -eq $trackedPid) {
    return $null
  }
  $proc = Get-ProcessById -ProcessId $trackedPid
  if ($null -eq $proc) {
    Remove-TrackedRuntimePid
    return $null
  }
  return $proc
}

function Get-ElectronRuntimeProcess {
  $mainCandidates = @(Get-CimInstance Win32_Process -Filter "Name='electron.exe'" -ErrorAction SilentlyContinue)
  foreach ($candidate in $mainCandidates) {
    $commandLine = $candidate.CommandLine
    if ([string]::IsNullOrWhiteSpace($commandLine)) {
      continue
    }
    if ($commandLine -match 'electron-dist[\\/]+main\.js') {
      $mainProc = Get-ProcessById -ProcessId ([int]$candidate.ProcessId)
      if ($null -ne $mainProc) {
        return $mainProc
      }
    }
  }

  $matched = @()
  $withWindow = @()
  $candidates = @(Get-Process -Name "electron" -ErrorAction SilentlyContinue)
  foreach ($proc in $candidates) {
    $procPath = ""
    try {
      $procPath = $proc.Path
    } catch {
      $procPath = ""
    }

    if ([string]::IsNullOrWhiteSpace($procPath) -or $procPath -match '[\\/]foliole[\\/]node_modules[\\/]electron[\\/]dist[\\/]electron\.exe$') {
      $matched += $proc
      if ($proc.MainWindowHandle -ne 0) {
        $withWindow += $proc
      }
    }
  }

  function Select-EarliestProcess {
    param([System.Object[]]$List)
    if ($null -eq $List -or $List.Count -eq 0) {
      return $null
    }
    try {
      return $List | Sort-Object StartTime | Select-Object -First 1
    } catch {
      return $List[0]
    }
  }

  if ($withWindow.Count -gt 0) {
    return Select-EarliestProcess -List $withWindow
  }

  if ($matched.Count -gt 0) {
    return Select-EarliestProcess -List $matched
  }

  if ($candidates.Count -gt 0) {
    return Select-EarliestProcess -List $candidates
  }

  return $null
}

function Stop-ProcessTree {
  param([int]$ProcessId)
  if ($ProcessId -le 0) {
    return
  }
  Start-Process -FilePath "taskkill.exe" -ArgumentList "/PID", "$ProcessId", "/T", "/F" -NoNewWindow -Wait -ErrorAction SilentlyContinue
  Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue
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
  param([string]$WorkDir)
  if (!(Test-Path -Path $WorkDir)) {
    throw "Workdir not found: $WorkDir"
  }

  $npmCmd = Resolve-NpmCommand
  $nodeDir = Split-Path -Path $npmCmd -Parent
  $command = "cd /d `"$WorkDir`" && set PATH=$nodeDir;%PATH% && set ELECTRON_RUN_AS_NODE= && call `"$npmCmd`" run electron:dev"

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
    [int]$MaxSeconds = 10
  )

  for ($second = 0; $second -lt $MaxSeconds; $second += 1) {
    $shell = Get-ProcessById -ProcessId $ShellPid
    if ($null -eq $shell) {
      return @{ ok = $false; reason = "shell-exited" }
    }

    $runtime = Get-ElectronRuntimeProcess
    if ($null -ne $runtime) {
      return @{ ok = $true; runtimePid = $runtime.Id }
    }

    Start-Sleep -Seconds 1
  }

  return @{ ok = $false; reason = "runtime-not-detected" }
}

function Start-ElectronWithHealthCheck {
  param([string]$WorkDir)
  $started = Start-ElectronShell -WorkDir $WorkDir
  $health = Wait-ElectronHealthy -ShellPid $started.Id -MaxSeconds (Get-HealthCheckSeconds)
  if (-not $health.ok) {
    throw "startup health check failed: $($health.reason)"
  }

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
}

function Wait-AppReadyMarker {
  param(
    [string]$WorkDir,
    [int]$RuntimePid,
    [int]$MaxSeconds = 10
  )

  $markerPath = Resolve-ReadyMarkerPath -WorkDir $WorkDir
  for ($second = 0; $second -lt $MaxSeconds; $second += 1) {
    if (Test-Path -Path $markerPath) {
      try {
        $event = Get-Content -Path $markerPath -Raw | ConvertFrom-Json
        if ($event.stage -eq "app_ready" -and [int]$event.pid -eq $RuntimePid) {
          return $true
        }
      } catch {
      }
    }
    Start-Sleep -Seconds 1
  }
  return $false
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
  $env:ELECTRON_RENDERER_URL = $rendererUrl
  Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
  try {
    $started = Start-Process `
      -FilePath $runtimePath `
      -ArgumentList @("electron-dist/main.js") `
      -WorkingDirectory $WorkDir `
      -PassThru `
      -RedirectStandardOutput $stdoutLog `
      -RedirectStandardError $stderrLog
  } finally {
    $env:ELECTRON_RENDERER_URL = $previousRendererUrl
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
  if (-not (Wait-AppReadyMarker -WorkDir $WorkDir -RuntimePid $health.runtimePid -MaxSeconds (Get-HealthCheckSeconds))) {
    return @{ ok = $false; reason = "app-ready-timeout"; runtimePid = $health.runtimePid; stdoutLog = $stdoutLog; stderrLog = $stderrLog }
  }
  Save-TrackedRuntimePid -ProcessId $health.runtimePid
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
  $env:ELECTRON_RENDERER_URL = $rendererUrl
  Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
  try {
    $started = Start-Process `
      -FilePath $runtimePath `
      -ArgumentList @("electron-dist/main.js") `
      -WorkingDirectory $WorkDir `
      -PassThru `
      -RedirectStandardOutput $stdoutLog `
      -RedirectStandardError $stderrLog
  } finally {
    $env:ELECTRON_RENDERER_URL = $previousRendererUrl
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
  if (-not (Wait-AppReadyMarker -WorkDir $WorkDir -RuntimePid $health.runtimePid -MaxSeconds (Get-HealthCheckSeconds))) {
    return @{ ok = $false; reason = "app-ready-timeout"; runtimePid = $health.runtimePid; stdoutLog = $stdoutLog; stderrLog = $stderrLog }
  }
  Save-TrackedRuntimePid -ProcessId $health.runtimePid
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

  $runtime = Get-TrackedRuntimeProcess
  if ($null -eq $runtime) {
    $runtime = Get-ElectronRuntimeProcess
  }
  if ($null -ne $runtime) {
    Stop-ProcessTree -ProcessId $runtime.Id
    Write-Info "stopped runtime pid=$($runtime.Id)"
  }

  Remove-TrackedPid
  Remove-TrackedRuntimePid
  Write-Info "status: STOPPED"
}

if ($Action -eq "status") {
  $tracked = Get-TrackedProcess
  $runtime = Get-TrackedRuntimeProcess
  if ($null -eq $runtime) {
    $runtime = Get-ElectronRuntimeProcess
  }
  if ($null -ne $tracked) {
    if ($null -ne $runtime) {
      Write-Info "status: RUNNING pid=$($tracked.Id) runtime_pid=$($runtime.Id)"
    } else {
      Write-Info "status: STOPPED reason=runtime-missing shell_pid=$($tracked.Id)"
    }
    exit 0
  }

  if ($null -ne $runtime) {
    Write-Info "status: RUNNING runtime_pid=$($runtime.Id)"
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
    $runtime = Get-TrackedRuntimeProcess
    if ($null -eq $runtime) {
      $runtime = Get-ElectronRuntimeProcess
    }
    if ($null -ne $runtime) {
      Write-Info "status: RUNNING pid=$($tracked.Id) runtime_pid=$($runtime.Id)"
    } else {
      $startedOnly = Start-ElectronRuntimeOnly -WorkDir $WindowsWorkDir
    if (-not $startedOnly.ok) {
      Write-Info "status: START_FAILED mode=runtime-only reason=$($startedOnly.reason) shell_pid=$($tracked.Id) stdout_log=$($startedOnly.stdoutLog) stderr_log=$($startedOnly.stderrLog)"
      exit 1
    }
      Write-Info "status: STARTED mode=runtime-start-only runtime_pid=$($startedOnly.runtimePid) renderer_url=$($startedOnly.rendererUrl) shell_pid=$($tracked.Id)"
    }
    exit 0
  }

  $runtime = Get-TrackedRuntimeProcess
  if ($null -eq $runtime) {
    $runtime = Get-ElectronRuntimeProcess
  }
  if ($null -ne $runtime) {
    Write-Info "status: RUNNING runtime_pid=$($runtime.Id)"
    exit 0
  }

  $started = Start-ElectronWithHealthCheck -WorkDir $WindowsWorkDir
  Save-TrackedRuntimePid -ProcessId $started.runtimePid
  Write-Info "status: STARTED shell_pid=$($started.shellPid) runtime_pid=$($started.runtimePid)"
  exit 0
}

if ($Action -eq "restart") {
  $tracked = Get-TrackedProcess
  $runtime = Get-TrackedRuntimeProcess
  if ($null -eq $runtime) {
    $runtime = Get-ElectronRuntimeProcess
  }
  if ($null -eq $runtime) {
    if ($null -eq $tracked) {
      Write-Info "status: STOPPED"
      exit 1
    }
    $startedOnly = Start-ElectronRuntimeOnly -WorkDir $WindowsWorkDir
    if (-not $startedOnly.ok) {
      Write-Info "status: RESTART_FAILED mode=runtime-only reason=$($startedOnly.reason) shell_pid=$($tracked.Id) stdout_log=$($startedOnly.stdoutLog) stderr_log=$($startedOnly.stderrLog)"
      exit 1
    }
    Write-Info "status: RESTARTED mode=runtime-start-only runtime_pid=$($startedOnly.runtimePid) renderer_url=$($startedOnly.rendererUrl) shell_pid=$($tracked.Id)"
    exit 0
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
