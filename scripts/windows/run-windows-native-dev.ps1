param(
  [Parameter(Mandatory = $true)]
  [string]$Distro,
  [Parameter(Mandatory = $true)]
  [string]$SourceRepoLinuxPath,
  [Parameter(Mandatory = $true)]
  [string]$SourceRepoWindowsPath,
  [Parameter(Mandatory = $true)]
  [string]$WindowsWorkDir,
  [Parameter(Mandatory = $true)]
  [string]$LogDir,
  [int]$BootReadyTimeoutSec = 60,
  [ValidateSet("start", "sync", "restart", "stop", "status", "apply")]
  [string]$Action = "apply"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
Set-Location -Path $env:SystemRoot

Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class NativeWindowApi {
  [DllImport("user32.dll")]
  public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")]
  public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")]
  public static extern bool IsIconic(IntPtr hWnd);
  [DllImport("user32.dll")]
  public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
  [StructLayout(LayoutKind.Sequential)]
  public struct RECT {
    public int Left;
    public int Top;
    public int Right;
    public int Bottom;
  }
}
"@

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$logPath = Join-Path $LogDir "windows-native-dev-$timestamp.log"
$stateFile = Join-Path $WindowsWorkDir ".windows-native-dev-state.json"
$lockHashStateFile = Join-Path $WindowsWorkDir ".windows-native-dev-lock.sha256"
$bootReadyFile = Join-Path $WindowsWorkDir ".windows-native-boot-ready.json"
$devUrl = "http://127.0.0.1:4600/"
$webViewUserDataFolder = Join-Path $env:LOCALAPPDATA "Foliole\WebView2\DevUserData"
$webViewLostEarlyFailAfterSec = 10
$script:LastBootFailureReason = ""
$appId = "com.foliole.desktop"

function Write-Log {
  param([string]$Message)
  $Message | Tee-Object -FilePath $logPath -Append | Out-Host
}

function Invoke-Robocopy {
  param(
    [string]$SourcePath,
    [string]$TargetPath
  )

  $excludeDirs = @(
    ".git",
    ".lab",
    "ref",
    "node_modules",
    "dist",
    "coverage",
    "playwright-report",
    "test-results",
    "blob-report",
    "target",
    "gen",
    "logs"
  )
  $excludeFiles = @("*.log", "*.tmp", ".windows-native-dev-state.json", ".windows-native-dev-lock.sha256")

  $dirArgs = ($excludeDirs | ForEach-Object { "/XD `"$($_)`"" }) -join " "
  $fileArgs = ($excludeFiles | ForEach-Object { "/XF `"$($_)`"" }) -join " "
  $syncCommand = "robocopy `"$SourcePath`" `"$TargetPath`" /MIR /R:2 /W:1 /NFL /NDL /NP /XJ $dirArgs $fileArgs"

  Write-Log ""
  Write-Log "[windows-native-dev] step: sync source to windows mirror"
  Write-Log "[windows-native-dev] cmd: $syncCommand"
  cmd.exe /d /c "$syncCommand" 2>&1 | Tee-Object -FilePath $logPath -Append | Out-Host
  $code = $LASTEXITCODE
  if ($code -ge 8) {
    Write-Log "[windows-native-dev] sync failed, robocopy exit=$code"
    exit $code
  }
  Write-Log "[windows-native-dev] sync done, robocopy exit=$code"
}

function Ensure-NpmDependencies {
  param([string]$WorkDir)

  $lockPath = Join-Path $WorkDir "package-lock.json"
  $nodeModulesPath = Join-Path $WorkDir "node_modules"
  $needsInstall = -not (Test-Path $nodeModulesPath)
  $lockHashCurrent = ""

  if (Test-Path $lockPath) {
    $lockHashCurrent = (Get-FileHash -Path $lockPath -Algorithm SHA256).Hash.ToLowerInvariant()
    $lockHashPrevious = ""
    if (Test-Path $lockHashStateFile) {
      $lockHashPrevious = (Get-Content -Path $lockHashStateFile -Raw).Trim().ToLowerInvariant()
    }

    if ($lockHashCurrent -ne $lockHashPrevious) {
      $needsInstall = $true
      Write-Log "[windows-native-dev] lock hash changed, dependency install required."
    }
  }

  if (-not $needsInstall) {
    Write-Log "[windows-native-dev] dependencies up-to-date, skip install."
    return
  }

  if (Test-Path $lockPath) {
    $installCommand = "cd /d `"$WorkDir`" && npm ci --no-audit --no-fund"
  } else {
    $installCommand = "cd /d `"$WorkDir`" && npm install --no-audit --no-fund"
  }

  Write-Log ""
  Write-Log "[windows-native-dev] step: install dependencies"
  Write-Log "[windows-native-dev] cmd: $installCommand"
  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  cmd.exe /d /c "$installCommand" 2>&1 | Tee-Object -FilePath $logPath -Append | Out-Host
  $installExitCode = $LASTEXITCODE
  $ErrorActionPreference = $previousErrorActionPreference

  if ($installExitCode -ne 0) {
    Write-Log "[windows-native-dev] install failed, exit=$LASTEXITCODE"
    exit $installExitCode
  }

  if ($lockHashCurrent) {
    $lockHashCurrent | Out-File -FilePath $lockHashStateFile -Encoding ascii -NoNewline
  } elseif (Test-Path $lockHashStateFile) {
    Remove-Item -Force $lockHashStateFile
  }
}

function Get-NativeAppProcesses {
  param([string]$WorkDir)

  $exePathLower = (Join-Path $WorkDir "src-tauri\target\debug\foliole-tauri-core.exe").ToLowerInvariant()
  return Get-CimInstance Win32_Process | Where-Object {
    $_.Name -eq "foliole-tauri-core.exe" -and
    $_.ExecutablePath -and
    $_.ExecutablePath.ToLowerInvariant() -eq $exePathLower
  }
}

function Get-NativeLauncherProcesses {
  param([string]$WorkDir)

  $normalizedWorkDir = $WorkDir.ToLowerInvariant()
  return Get-CimInstance Win32_Process | Where-Object {
    if (-not $_.CommandLine) {
      return $false
    }

    $commandLineLower = $_.CommandLine.ToLowerInvariant()
    return $commandLineLower.Contains($normalizedWorkDir) -and
      ($commandLineLower.Contains("npm run tauri:dev") -or $commandLineLower.Contains("tauri dev"))
  }
}

function Get-NativeViteProcesses {
  param([string]$WorkDir)

  $normalizedWorkDir = $WorkDir.ToLowerInvariant()
  return Get-CimInstance Win32_Process | Where-Object {
    if ($_.Name -ne "node.exe" -or -not $_.CommandLine) {
      return $false
    }

    $commandLineLower = $_.CommandLine.ToLowerInvariant()
    return $commandLineLower.Contains($normalizedWorkDir) -and
      $commandLineLower.Contains("vite") -and
      $commandLineLower.Contains("127.0.0.1") -and
      $commandLineLower.Contains("4600")
  }
}

function Get-NativeCargoProcesses {
  param([string]$WorkDir)

  $normalizedWorkDir = $WorkDir.ToLowerInvariant()
  return Get-CimInstance Win32_Process | Where-Object {
    if ($_.Name -ne "cargo.exe" -or -not $_.CommandLine) {
      return $false
    }

    $commandLineLower = $_.CommandLine.ToLowerInvariant()
    return $commandLineLower.Contains($normalizedWorkDir) -and $commandLineLower.Contains("run") -and $commandLineLower.Contains("tauri")
  }
}

function Get-NativeTauriNodeProcesses {
  param([string]$WorkDir)

  $normalizedWorkDir = $WorkDir.ToLowerInvariant()
  return Get-CimInstance Win32_Process | Where-Object {
    if ($_.Name -ne "node.exe" -or -not $_.CommandLine) {
      return $false
    }

    $commandLineLower = $_.CommandLine.ToLowerInvariant()
    return $commandLineLower.Contains($normalizedWorkDir) -and
      ($commandLineLower.Contains("tauri.js") -or
        $commandLineLower.Contains("npm-cli.js run tauri:dev"))
  }
}

function Get-NativeTauriCmdProcesses {
  param([string]$WorkDir)

  $normalizedWorkDir = $WorkDir.ToLowerInvariant()
  return Get-CimInstance Win32_Process | Where-Object {
    if ($_.Name -ne "cmd.exe" -or -not $_.CommandLine) {
      return $false
    }

    $commandLineLower = $_.CommandLine.ToLowerInvariant()
    return $commandLineLower.Contains($normalizedWorkDir) -and
      ($commandLineLower.Contains("npm run tauri:dev") -or $commandLineLower.Contains(" tauri dev"))
  }
}

function Get-WebView2ProcessesForAppId {
  param([string]$AppId)

  $appIdLower = $AppId.ToLowerInvariant()
  $uddPathLower = $webViewUserDataFolder.ToLowerInvariant().Replace("/", "\")
  return Get-CimInstance Win32_Process | Where-Object {
    if ($_.Name -ne "msedgewebview2.exe" -or -not $_.CommandLine) {
      return $false
    }

    $commandLineLower = $_.CommandLine.ToLowerInvariant()
    return $commandLineLower.Contains("\$appIdLower\ebwebview") -or
      $commandLineLower.Contains($uddPathLower)
  }
}

function Wait-WebView2ProcessesGone {
  param(
    [string]$AppId,
    [int]$TimeoutMs = 8000
  )

  $waited = 0
  while ($waited -lt $TimeoutMs) {
    $still = @(Get-WebView2ProcessesForAppId -AppId $AppId)
    if ($still.Count -eq 0) {
      Write-Log "[windows-native-dev] webview2 processes fully gone after ${waited}ms"
      return
    }
    Start-Sleep -Milliseconds 300
    $waited += 300
  }
  Write-Log "[windows-native-dev] webview2 processes still present after ${TimeoutMs}ms wait"
}

function Remove-WebView2LockFiles {
  param([string]$UserDataFolder)

  # WebView2 Browser Process holds LevelDB/SQLite lock files under the Default profile.
  # If a previous session exited uncleanly these locks block the next startup, causing
  # silent Browser Process exit within 2-4 seconds.
  $lockPatterns = @(
    "Default\SingletonLock",
    "Default\SingletonSocket",
    "Default\SingletonCookie",
    "Default\LOCK",
    "Default\LOG.old"
  )
  $removed = 0
  foreach ($rel in $lockPatterns) {
    $path = Join-Path $UserDataFolder $rel
    if (Test-Path $path) {
      try {
        Remove-Item -Force -Path $path -ErrorAction Stop
        Write-Log "[windows-native-dev] removed webview2 lock file: $path"
        $removed++
      } catch {
        Write-Log "[windows-native-dev] could not remove webview2 lock file: $path error=$($_.Exception.Message)"
      }
    }
  }
  if ($removed -eq 0) {
    Write-Log "[windows-native-dev] no webview2 lock files found to remove"
  }
}

function Reset-WebView2UserData {
  param(
    [string]$AppId,
    [switch]$DeepClean
  )

  $uddRoot = Join-Path $env:LOCALAPPDATA "$AppId\EBWebView"
  if ($webViewUserDataFolder -and $webViewUserDataFolder.Trim().Length -gt 0) {
    $uddRoot = $webViewUserDataFolder
  }

  $webviewProcesses = @(Get-WebView2ProcessesForAppId -AppId $AppId)
  foreach ($process in $webviewProcesses) {
    try {
      Stop-Process -Id $process.ProcessId -Force -ErrorAction Stop
      Write-Log "[windows-native-dev] stopped app webview2 pid=$($process.ProcessId)"
    } catch {
      Write-Log "[windows-native-dev] failed to stop app webview2 pid=$($process.ProcessId): $($_.Exception.Message)"
    }
  }

  # Always wait for ALL WebView2 processes to fully exit before touching the UDF.
  Wait-WebView2ProcessesGone -AppId $AppId -TimeoutMs 8000

  if ($DeepClean -and (Test-Path $uddRoot)) {
    try {
      Remove-Item -Path $uddRoot -Recurse -Force -ErrorAction Stop
      Write-Log "[windows-native-dev] deep cleaned WebView2 UDD: $uddRoot"
    } catch {
      Write-Log "[windows-native-dev] failed to deep clean WebView2 UDD: $uddRoot error=$($_.Exception.Message)"
    }
  } else {
    # Even without deep clean, remove lock files so next startup is not blocked.
    Remove-WebView2LockFiles -UserDataFolder $uddRoot
  }
}

function Ensure-WebView2UserDataFolderWritable {
  param([string]$UserDataFolder)

  if ([string]::IsNullOrWhiteSpace($UserDataFolder)) {
    Write-Log "[windows-native-dev] invalid WebView2 UDF path."
    return $false
  }

  try {
    New-Item -ItemType Directory -Force -Path $UserDataFolder | Out-Null
    $probePath = Join-Path $UserDataFolder ".write-probe.tmp"
    "ok" | Out-File -FilePath $probePath -Encoding ascii -NoNewline
    Remove-Item -Force $probePath -ErrorAction Stop
    Write-Log "[windows-native-dev] webview2 udf ready: $UserDataFolder"
    return $true
  } catch {
    Write-Log "[windows-native-dev] webview2 udf not writable: $UserDataFolder error=$($_.Exception.Message)"
    return $false
  }
}

function Show-BootStageSummary {
  param(
    [string]$WorkDir,
    [string]$BootSession
  )

  if ([string]::IsNullOrWhiteSpace($BootSession)) {
    Write-Log "[windows-native-dev] boot summary: skipped (empty session)."
    return
  }

  $eventLog = Join-Path $WorkDir "logs\windows\native-boot-events.ndjson"
  if (-not (Test-Path $eventLog)) {
    Write-Log "[windows-native-dev] boot summary: session=$BootSession events=0 missing_log=$eventLog"
    return
  }

  $events = @()
  try {
    $events = Get-Content -Path $eventLog -Tail 5000 |
      ForEach-Object {
        try { $_ | ConvertFrom-Json } catch { $null }
      } |
      Where-Object { $_ -and "$($_.session)".Trim() -eq $BootSession.Trim() }
  } catch {
    Write-Log "[windows-native-dev] boot summary parse failed: $($_.Exception.Message)"
    return
  }

  if ($events.Count -eq 0) {
    Write-Log "[windows-native-dev] boot summary: session=$BootSession events=0 stages=(none) missing=tauri_page_load_started,tauri_page_load,boot_start,app_ready last_ts=n/a"
    return
  }

  $stageOrder = @()
  foreach ($event in $events) {
    $stage = "$($event.stage)".Trim()
    if (-not [string]::IsNullOrWhiteSpace($stage) -and -not $stageOrder.Contains($stage)) {
      $stageOrder += $stage
    }
  }

  $expectedStages = @("tauri_setup", "tauri_page_load_started", "tauri_page_load", "boot_start", "app_ready")
  $missingStages = @()
  foreach ($expected in $expectedStages) {
    if (-not $stageOrder.Contains($expected)) {
      $missingStages += $expected
    }
  }

  $lastEvent = $events[-1]
  $stageText = if ($stageOrder.Count -gt 0) { $stageOrder -join ">" } else { "(none)" }
  $missingText = if ($missingStages.Count -gt 0) { $missingStages -join "," } else { "(none)" }
  $lastTimestamp = "$($lastEvent.timestamp)".Trim()
  if ([string]::IsNullOrWhiteSpace($lastTimestamp)) {
    $lastTimestamp = "n/a"
  }

  Write-Log "[windows-native-dev] boot summary: session=$BootSession events=$($events.Count) stages=$stageText missing=$missingText last_ts=$lastTimestamp"
}

function Write-ScriptBootEvent {
  param(
    [string]$WorkDir,
    [string]$BootSession,
    [string]$Stage,
    [hashtable]$Payload = @{}
  )

  if ([string]::IsNullOrWhiteSpace($BootSession) -or [string]::IsNullOrWhiteSpace($Stage)) {
    return
  }

  $eventLogPath = Join-Path $WorkDir "logs\windows\native-boot-events.ndjson"
  $event = [ordered]@{
    timestamp = (Get-Date).ToUniversalTime().ToString("o")
    stage = $Stage
    pid = $PID
    session = $BootSession.Trim()
    payload = $Payload
  }

  try {
    if (-not (Test-Path (Split-Path -Path $eventLogPath -Parent))) {
      New-Item -ItemType Directory -Force -Path (Split-Path -Path $eventLogPath -Parent) | Out-Null
    }
    ($event | ConvertTo-Json -Compress) | Out-File -FilePath $eventLogPath -Append -Encoding utf8
  } catch {
    Write-Log "[windows-native-dev] failed to append script boot event stage=${Stage}: $($_.Exception.Message)"
  }
}

function Capture-BootTimeoutDiagnostics {
  param(
    [string]$WorkDir,
    [string]$BootSession
  )

  $sessionId = if ([string]::IsNullOrWhiteSpace($BootSession)) { "unknown" } else { $BootSession.Trim() }
  $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $snapshotPath = Join-Path $LogDir "boot-timeout-snapshot-$timestamp-$sessionId.log"

  function Write-SnapshotLine {
    param([string]$Line)
    $Line | Out-File -FilePath $snapshotPath -Append -Encoding utf8
    Write-Log "[windows-native-dev] [snapshot] $Line"
  }

  try {
    "=== boot-timeout snapshot ===" | Out-File -FilePath $snapshotPath -Encoding utf8
    "generated_at=$(Get-Date -Format "yyyy-MM-dd HH:mm:ss")" | Out-File -FilePath $snapshotPath -Append -Encoding utf8
    "boot_session=$sessionId" | Out-File -FilePath $snapshotPath -Append -Encoding utf8
    "workdir=$WorkDir" | Out-File -FilePath $snapshotPath -Append -Encoding utf8
    "dev_url=$devUrl" | Out-File -FilePath $snapshotPath -Append -Encoding utf8

    Write-SnapshotLine ""
    Write-SnapshotLine "[processes] native app"
    $apps = @(Get-NativeAppProcesses -WorkDir $WorkDir)
    if ($apps.Count -eq 0) {
      Write-SnapshotLine "count=0"
    } else {
      foreach ($app in $apps) {
        $windowInfo = "window=unavailable"
        try {
          $managed = Get-Process -Id $app.ProcessId -ErrorAction Stop
          if ($managed.MainWindowHandle -ne 0) {
            $rect = New-Object NativeWindowApi+RECT
            [void][NativeWindowApi]::GetWindowRect([IntPtr]$managed.MainWindowHandle, [ref]$rect)
            $windowInfo = "window_handle=$($managed.MainWindowHandle) rect=[$($rect.Left),$($rect.Top),$($rect.Right),$($rect.Bottom)] iconic=$([NativeWindowApi]::IsIconic([IntPtr]$managed.MainWindowHandle))"
          } else {
            $windowInfo = "window_handle=0"
          }
        } catch {
          $windowInfo = "window_error=$($_.Exception.Message)"
        }
        Write-SnapshotLine "pid=$($app.ProcessId) exe=$($app.ExecutablePath) $windowInfo"
      }
    }

    Write-SnapshotLine ""
    Write-SnapshotLine "[processes] launcher"
    $launchers = @(Get-NativeLauncherProcesses -WorkDir $WorkDir)
    if ($launchers.Count -eq 0) {
      Write-SnapshotLine "count=0"
    } else {
      foreach ($launcher in $launchers) {
        $cmd = if ($launcher.CommandLine) { $launcher.CommandLine } else { "(no commandline)" }
        Write-SnapshotLine "pid=$($launcher.ProcessId) name=$($launcher.Name) cmd=$cmd"
      }
    }

    Write-SnapshotLine ""
    Write-SnapshotLine "[processes] webview2(app scoped)"
    $webviews = @(Get-WebView2ProcessesForAppId -AppId $appId)
    if ($webviews.Count -eq 0) {
      Write-SnapshotLine "count=0"
    } else {
      foreach ($webview in $webviews) {
        $cmd = if ($webview.CommandLine) { $webview.CommandLine } else { "(no commandline)" }
        Write-SnapshotLine "pid=$($webview.ProcessId) cmd=$cmd"
      }
    }

    Write-SnapshotLine ""
    Write-SnapshotLine "[network] 127.0.0.1:4600 listeners"
    $listeners = @(Get-NetTCPConnection -LocalAddress "127.0.0.1" -LocalPort 4600 -State Listen -ErrorAction SilentlyContinue)
    if ($listeners.Count -eq 0) {
      Write-SnapshotLine "count=0"
    } else {
      $ownerIds = $listeners | Select-Object -ExpandProperty OwningProcess -Unique
      foreach ($ownerId in $ownerIds) {
        try {
          $proc = Get-CimInstance Win32_Process -Filter "ProcessId = $ownerId"
          if (-not $proc) {
            Write-SnapshotLine "owner_pid=$ownerId process=missing"
            continue
          }
          $cmd = if ($proc.CommandLine) { $proc.CommandLine } else { "(no commandline)" }
          Write-SnapshotLine "owner_pid=$ownerId name=$($proc.Name) cmd=$cmd"
        } catch {
          Write-SnapshotLine "owner_pid=$ownerId lookup_error=$($_.Exception.Message)"
        }
      }
    }

    Write-SnapshotLine ""
    Write-SnapshotLine "[http probe] dev url and key assets"
    foreach ($url in @($devUrl, "$($devUrl.TrimEnd('/'))/@vite/client", "$($devUrl.TrimEnd('/'))/src/main.tsx")) {
      try {
        $resp = Invoke-WebRequest -Uri $url -Method Get -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop
        Write-SnapshotLine "url=$url status=$($resp.StatusCode) length=$($resp.RawContentLength)"
      } catch {
        Write-SnapshotLine "url=$url error=$($_.Exception.Message)"
      }
    }

    Write-SnapshotLine ""
    Write-SnapshotLine "[files] marker/state"
    if (Test-Path $bootReadyFile) {
      Write-SnapshotLine "boot_ready_file=$bootReadyFile exists=true"
      try {
        $raw = (Get-Content -Path $bootReadyFile -Raw -ErrorAction Stop).Trim()
        Write-SnapshotLine "boot_ready_payload=$raw"
      } catch {
        Write-SnapshotLine "boot_ready_read_error=$($_.Exception.Message)"
      }
    } else {
      Write-SnapshotLine "boot_ready_file=$bootReadyFile exists=false"
    }

    if (Test-Path $stateFile) {
      Write-SnapshotLine "state_file=$stateFile exists=true"
      try {
        $rawState = (Get-Content -Path $stateFile -Raw -ErrorAction Stop).Trim()
        Write-SnapshotLine "state_payload=$rawState"
      } catch {
        Write-SnapshotLine "state_read_error=$($_.Exception.Message)"
      }
    } else {
      Write-SnapshotLine "state_file=$stateFile exists=false"
    }

    Write-Log "[windows-native-dev] boot-timeout diagnostics captured: $snapshotPath"
  } catch {
    Write-Log "[windows-native-dev] boot-timeout diagnostics failed: $($_.Exception.Message)"
  }
}

function Stop-ProcessGracefully {
  param(
    [int]$ProcessId,
    [string]$ProcessLabel,
    [int]$WaitMilliseconds = 5000
  )

  try {
    $process = Get-Process -Id $ProcessId -ErrorAction Stop
  } catch {
    return $true
  }

  if ($process.HasExited) {
    return $true
  }

  if ($process.MainWindowHandle -eq 0) {
    return $false
  }

  try {
    [void]$process.CloseMainWindow()
    if ($process.WaitForExit($WaitMilliseconds)) {
      Write-Log "[windows-native-dev] graceful stop success: $ProcessLabel pid=$ProcessId"
      return $true
    }
    Write-Log "[windows-native-dev] graceful stop timeout: $ProcessLabel pid=$ProcessId"
    return $false
  } catch {
    Write-Log "[windows-native-dev] graceful stop failed: $ProcessLabel pid=$ProcessId error=$($_.Exception.Message)"
    return $false
  }
}

function Stop-NativeDevSession {
  param([string]$WorkDir)

  $launchers = Get-NativeLauncherProcesses -WorkDir $WorkDir
  foreach ($launcher in $launchers) {
    try {
      if (Stop-ProcessGracefully -ProcessId $launcher.ProcessId -ProcessLabel "launcher" -WaitMilliseconds 3000) {
        continue
      }
      Stop-Process -Id $launcher.ProcessId -Force -ErrorAction Stop
      Write-Log "[windows-native-dev] force stopped launcher pid=$($launcher.ProcessId)"
    } catch {
      Write-Log "[windows-native-dev] failed to stop launcher pid=$($launcher.ProcessId): $($_.Exception.Message)"
    }
  }

  $apps = Get-NativeAppProcesses -WorkDir $WorkDir
  foreach ($app in $apps) {
    try {
      if (Stop-ProcessGracefully -ProcessId $app.ProcessId -ProcessLabel "app" -WaitMilliseconds 5000) {
        continue
      }
      # Use taskkill /T to kill the entire process tree (Tauri + all WebView2 children)
      $result = taskkill.exe /PID $app.ProcessId /T /F 2>&1
      Write-Log "[windows-native-dev] force stopped app pid=$($app.ProcessId) (tree): $result"
    } catch {
      Write-Log "[windows-native-dev] failed to stop app pid=$($app.ProcessId): $($_.Exception.Message)"
    }
  }

  $viteProcesses = Get-NativeViteProcesses -WorkDir $WorkDir
  foreach ($viteProcess in $viteProcesses) {
    try {
      Stop-Process -Id $viteProcess.ProcessId -Force -ErrorAction Stop
      Write-Log "[windows-native-dev] stopped vite pid=$($viteProcess.ProcessId)"
    } catch {
      Write-Log "[windows-native-dev] failed to stop vite pid=$($viteProcess.ProcessId): $($_.Exception.Message)"
    }
  }

  $cargoProcesses = Get-NativeCargoProcesses -WorkDir $WorkDir
  foreach ($cargoProcess in $cargoProcesses) {
    try {
      Stop-Process -Id $cargoProcess.ProcessId -Force -ErrorAction Stop
      Write-Log "[windows-native-dev] stopped cargo pid=$($cargoProcess.ProcessId)"
    } catch {
      Write-Log "[windows-native-dev] failed to stop cargo pid=$($cargoProcess.ProcessId): $($_.Exception.Message)"
    }
  }

  $tauriNodeProcesses = Get-NativeTauriNodeProcesses -WorkDir $WorkDir
  foreach ($tauriNodeProcess in $tauriNodeProcesses) {
    try {
      Stop-Process -Id $tauriNodeProcess.ProcessId -Force -ErrorAction Stop
      Write-Log "[windows-native-dev] stopped tauri node pid=$($tauriNodeProcess.ProcessId)"
    } catch {
      Write-Log "[windows-native-dev] failed to stop tauri node pid=$($tauriNodeProcess.ProcessId): $($_.Exception.Message)"
    }
  }

  $tauriCmdProcesses = Get-NativeTauriCmdProcesses -WorkDir $WorkDir
  foreach ($tauriCmdProcess in $tauriCmdProcesses) {
    try {
      Stop-Process -Id $tauriCmdProcess.ProcessId -Force -ErrorAction Stop
      Write-Log "[windows-native-dev] stopped tauri cmd pid=$($tauriCmdProcess.ProcessId)"
    } catch {
      Write-Log "[windows-native-dev] failed to stop tauri cmd pid=$($tauriCmdProcess.ProcessId): $($_.Exception.Message)"
    }
  }

  if (Test-Path $stateFile) {
    Remove-Item -Force $stateFile
  }

  # Wait for foliole-tauri-core.exe to fully exit (up to 8s).
  $exePath = (Join-Path $WorkDir "src-tauri\target\debug\foliole-tauri-core.exe").ToLowerInvariant()
  $waited = 0
  while ($waited -lt 8000) {
    $still = Get-CimInstance Win32_Process | Where-Object {
      $_.Name -eq "foliole-tauri-core.exe" -and
      $_.ExecutablePath -and
      $_.ExecutablePath.ToLowerInvariant() -eq $exePath
    }
    if (-not $still) { break }
    Start-Sleep -Milliseconds 300
    $waited += 300
  }

  # Wait for ALL WebView2 (msedgewebview2.exe) processes to exit before touching the UDF.
  # This is the critical step: WebView2 holds LevelDB LOCK files in the UDF until all its
  # processes exit. A new startup that finds those locks will silently exit within 2-4 seconds.
  Wait-WebView2ProcessesGone -AppId $appId -TimeoutMs 8000

  Reset-WebView2UserData -AppId $appId
}

function Save-StateFile {
  param(
    [string]$WorkDir,
    [int]$LauncherPid,
    [string]$BootSession,
    [string]$TauriLogPath = ""
  )

  $payload = [ordered]@{
    launcher_pid = $LauncherPid
    boot_session = $BootSession
    started_at = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
    workdir = $WorkDir
    tauri_log = $TauriLogPath
  }

  $payload | ConvertTo-Json | Out-File -FilePath $stateFile -Encoding utf8
}

function Write-TauriLogFailureSignals {
  param(
    [string]$WorkDir,
    [string]$BootSession,
    [string]$TauriLogPath,
    [int]$TailLines = 120
  )

  if ([string]::IsNullOrWhiteSpace($BootSession) -or [string]::IsNullOrWhiteSpace($TauriLogPath)) {
    return
  }
  if (-not (Test-Path $TauriLogPath)) {
    return
  }

  try {
    $lines = @(Get-Content -Path $TauriLogPath -Tail $TailLines -ErrorAction Stop)
    $pattern = "(?i)(panic|thread 'main' panicked|webview2|msedgewebview2|hresult|exception|\\berror\\b|failed to|boot timeout)"
    $matched = @()
    foreach ($line in $lines) {
      if ($line -match $pattern) {
        $normalized = ($line -replace "\s+", " ").Trim()
        if ($normalized.Length -gt 0) {
          $matched += $normalized
        }
      }
    }

    $sampleCount = [Math]::Min(8, $matched.Count)
    $samples = @()
    if ($sampleCount -gt 0) {
      $samples = $matched | Select-Object -Last $sampleCount
    }

    Write-Log "[windows-native-dev] tauri log failure signals: matched=$($matched.Count) file=$TauriLogPath"
    Write-ScriptBootEvent -WorkDir $WorkDir -BootSession $BootSession -Stage "tauri_log_failure_signals" -Payload @{
      source = "windows_native_dev_script"
      tauri_log = $TauriLogPath
      tail_lines = $TailLines
      matched_count = $matched.Count
      samples = $samples
    }
  } catch {
    Write-Log "[windows-native-dev] tauri log signal scan failed: $($_.Exception.Message)"
    Write-ScriptBootEvent -WorkDir $WorkDir -BootSession $BootSession -Stage "tauri_log_failure_signals_scan_failed" -Payload @{
      source = "windows_native_dev_script"
      tauri_log = $TauriLogPath
      error = $_.Exception.Message
    }
  }
}

function Write-WindowsFailureSignals {
  param(
    [string]$WorkDir,
    [string]$BootSession
  )

  if ([string]::IsNullOrWhiteSpace($BootSession)) {
    return
  }

  $startTime = (Get-Date).AddMinutes(-10)
  try {
    if (Test-Path $stateFile) {
      $state = Get-Content -Path $stateFile -Raw -ErrorAction Stop | ConvertFrom-Json
      $startedAtRaw = "$($state.started_at)".Trim()
      if (-not [string]::IsNullOrWhiteSpace($startedAtRaw)) {
        $parsedStart = [datetime]::Parse($startedAtRaw)
        if ($parsedStart -lt (Get-Date)) {
          $startTime = $parsedStart.AddSeconds(-5)
        }
      }
    }
  } catch {}

  try {
    $messagePattern = "(?i)(webview2|msedgewebview2|foliole-tauri-core|tauri|wry)"
    $providerSet = @("Application Error", "Windows Error Reporting", "WebView2")
    $events = @(Get-WinEvent -FilterHashtable @{ LogName = "Application"; StartTime = $startTime } -ErrorAction SilentlyContinue |
        Where-Object {
          $providerMatched = $providerSet -contains $_.ProviderName
          $messageMatched = $_.Message -and $_.Message -match $messagePattern
          $providerMatched -or $messageMatched
        } |
        Sort-Object TimeCreated |
        Select-Object -Last 40)

    $samples = @()
    foreach ($event in $events | Select-Object -Last 8) {
      $message = if ($event.Message) { ($event.Message -replace "\s+", " ").Trim() } else { "(no message)" }
      if ($message.Length -gt 240) {
        $message = $message.Substring(0, 240)
      }
      $samples += [ordered]@{
        time = $event.TimeCreated.ToUniversalTime().ToString("o")
        provider = $event.ProviderName
        id = $event.Id
        level = $event.LevelDisplayName
        message = $message
      }
    }

    Write-Log "[windows-native-dev] windows application failure signals: matched=$($events.Count) start=$($startTime.ToString('s'))"
    Write-ScriptBootEvent -WorkDir $WorkDir -BootSession $BootSession -Stage "windows_application_failure_signals" -Payload @{
      source = "windows_native_dev_script"
      start_time_utc = $startTime.ToUniversalTime().ToString("o")
      matched_count = $events.Count
      samples = $samples
    }
  } catch {
    Write-Log "[windows-native-dev] windows application failure signal scan failed: $($_.Exception.Message)"
    Write-ScriptBootEvent -WorkDir $WorkDir -BootSession $BootSession -Stage "windows_application_failure_signals_scan_failed" -Payload @{
      source = "windows_native_dev_script"
      error = $_.Exception.Message
    }
  }

  try {
    $crashDir = Join-Path $webViewUserDataFolder "Crashpad\reports"
    $crashFiles = @()
    if (Test-Path $crashDir) {
      $crashFiles = @(Get-ChildItem -Path $crashDir -File -ErrorAction SilentlyContinue |
          Where-Object { $_.LastWriteTime -ge $startTime } |
          Sort-Object LastWriteTime |
          Select-Object -Last 8)
    }

    $crashSamples = @()
    foreach ($file in $crashFiles) {
      $crashSamples += [ordered]@{
        name = $file.Name
        bytes = $file.Length
        last_write_utc = $file.LastWriteTime.ToUniversalTime().ToString("o")
      }
    }

    Write-Log "[windows-native-dev] webview2 crash dump signals: matched=$($crashFiles.Count) dir=$crashDir"
    Write-ScriptBootEvent -WorkDir $WorkDir -BootSession $BootSession -Stage "webview2_crash_dump_signals" -Payload @{
      source = "windows_native_dev_script"
      crash_dir = $crashDir
      matched_count = $crashFiles.Count
      files = $crashSamples
    }
  } catch {
    Write-Log "[windows-native-dev] webview2 crash dump scan failed: $($_.Exception.Message)"
    Write-ScriptBootEvent -WorkDir $WorkDir -BootSession $BootSession -Stage "webview2_crash_dump_signals_scan_failed" -Payload @{
      source = "windows_native_dev_script"
      error = $_.Exception.Message
    }
  }
}

function Is-NativeDevRunning {
  param([string]$WorkDir)

  $apps = @(Get-NativeAppProcesses -WorkDir $WorkDir)
  return $apps.Count -gt 0
}

function Is-NativeDevLauncherRunning {
  param([string]$WorkDir)

  $launchers = @(Get-NativeLauncherProcesses -WorkDir $WorkDir)
  return $launchers.Count -gt 0
}

function Clear-WorkdirPort4600Listener {
  param([string]$WorkDir)

  $listeners = @(Get-NetTCPConnection -LocalAddress "127.0.0.1" -LocalPort 4600 -State Listen -ErrorAction SilentlyContinue)
  if ($listeners.Count -eq 0) {
    return
  }

  $workDirLower = $WorkDir.ToLowerInvariant()
  $ownerIds = $listeners | Select-Object -ExpandProperty OwningProcess -Unique
  foreach ($ownerId in $ownerIds) {
    try {
      $proc = Get-CimInstance Win32_Process -Filter "ProcessId = $ownerId"
      if (-not $proc) {
        continue
      }
      $cmd = if ($proc.CommandLine) { $proc.CommandLine.ToLowerInvariant() } else { "" }
      $exe = if ($proc.ExecutablePath) { $proc.ExecutablePath.ToLowerInvariant() } else { "" }
      $canStop = $cmd.Contains($workDirLower) -or $cmd.Contains("vite") -or $exe.Contains("\\node.exe")
      if (-not $canStop) {
        continue
      }
      Stop-Process -Id $ownerId -Force -ErrorAction Stop
      Write-Log "[windows-native-dev] cleared port 4600 listener pid=$ownerId"
    } catch {
      Write-Log "[windows-native-dev] failed to clear port 4600 listener pid=$($ownerId): $($_.Exception.Message)"
    }
  }
}

function Show-Status {
  param([string]$WorkDir)

  $launchers = @(Get-NativeLauncherProcesses -WorkDir $WorkDir)
  $apps = @(Get-NativeAppProcesses -WorkDir $WorkDir)

  Write-Log ""
  Write-Log "[windows-native-dev] launcher process count: $($launchers.Count)"
  foreach ($launcher in $launchers) {
    Write-Log "[windows-native-dev] launcher pid=$($launcher.ProcessId) name=$($launcher.Name)"
  }

  Write-Log "[windows-native-dev] app process count: $($apps.Count)"
  foreach ($app in $apps) {
    Write-Log "[windows-native-dev] app pid=$($app.ProcessId) exe=$($app.ExecutablePath)"
  }

  if (Test-Path $stateFile) {
    Write-Log "[windows-native-dev] state file: $stateFile"
  } else {
    Write-Log "[windows-native-dev] state file: missing"
  }
}

function Launch-NativeDev {
  param([string]$WorkDir)

  if (Is-NativeDevLauncherRunning -WorkDir $WorkDir) {
    Write-Log "[windows-native-dev] launcher already running, skip launch."
    return ""
  }

  if (Is-NativeDevRunning -WorkDir $WorkDir) {
    Write-Log "[windows-native-dev] native app already running, skip launch."
    return ""
  }

  Clear-WorkdirPort4600Listener -WorkDir $WorkDir

  if (Test-Path $bootReadyFile) {
    Remove-Item -Force $bootReadyFile -ErrorAction SilentlyContinue
  }

  # Deep clean the WebView2 UDF before every launch. Stale profile data (IndexedDB,
  # cached renderer state) from a previous session causes the Browser Process to exit
  # silently within ~1-2 seconds on the first startup attempt. Retry succeeds because
  # it deep cleans, so we move the clean here to avoid the first-attempt failure.
  Reset-WebView2UserData -AppId $appId -DeepClean

  if (-not (Ensure-WebView2UserDataFolderWritable -UserDataFolder $webViewUserDataFolder)) {
    $script:LastBootFailureReason = "WEBVIEW2_UDF_NOT_WRITABLE"
    return ""
  }

  $bootSession = [Guid]::NewGuid().ToString("N")
  $tauriLogTimestamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $tauriLogPath = Join-Path $LogDir "tauri-dev-$tauriLogTimestamp.log"
  $launchCommand = "cd /d `"$WorkDir`" && set `"FOLIOLE_WORKDIR=$WorkDir`" && set `"FOLIOLE_BOOT_SESSION=$bootSession`" && set `"WEBVIEW2_USER_DATA_FOLDER=$webViewUserDataFolder`" && npm run tauri:dev >> `"$tauriLogPath`" 2>&1"
  Write-Log ""
  Write-Log "[windows-native-dev] step: launch native tauri dev"
  Write-Log "[windows-native-dev] cmd: $launchCommand"
  Write-Log "[windows-native-dev] boot session: $bootSession"
  Write-Log "[windows-native-dev] webview2 udf: $webViewUserDataFolder"
  Write-Log "[windows-native-dev] tauri dev log: $tauriLogPath"
  $cmdProc = Start-Process -FilePath "cmd.exe" -ArgumentList "/k", $launchCommand -PassThru
  Save-StateFile -WorkDir $WorkDir -LauncherPid $cmdProc.Id -BootSession $bootSession -TauriLogPath $tauriLogPath
  Write-Log "[windows-native-dev] launcher pid: $($cmdProc.Id)"
  return $bootSession
}

function Wait-ForDevUrlReady {
  param([int]$TimeoutSeconds)

  $script:LastBootFailureReason = ""
  $maxAttempts = [Math]::Max(1, [Math]::Ceiling(($TimeoutSeconds * 1000) / 250))

  for ($attempt = 1; $attempt -le $maxAttempts; $attempt++) {
    try {
      $response = Invoke-WebRequest -Uri $devUrl -Method Get -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
      if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
        Write-Log "[windows-native-dev] dev url ready: $devUrl status=$($response.StatusCode)"
        return $true
      }
    } catch {
      # Keep retrying until timeout.
    }

    Start-Sleep -Milliseconds 250
  }

  $script:LastBootFailureReason = "DEV_URL_TIMEOUT"
  Write-Log "[windows-native-dev] dev url timeout after ${TimeoutSeconds}s: $devUrl"
  return $false
}

function Wait-ForFrontendReady {
  param(
    [string]$WorkDir,
    [string]$BootSession,
    [int]$TimeoutSeconds
  )

  if ([string]::IsNullOrWhiteSpace($BootSession)) {
    Write-Log "[windows-native-dev] boot readiness wait skipped: empty session."
    return $true
  }

  $webviewSeen = $false
  $webviewLostAfterSeen = $false
  $webviewFirstSeenAttempt = -1
  $webviewLastSeenAttempt = -1
  $webviewLostAttempt = -1
  $webviewLastCount = -1

  $maxAttempts = [Math]::Max(1, [Math]::Ceiling(($TimeoutSeconds * 1000) / 250))
  $earlyFailAttempts = [Math]::Max(1, [Math]::Ceiling(($webViewLostEarlyFailAfterSec * 1000) / 250))
  for ($attempt = 1; $attempt -le $maxAttempts; $attempt++) {
    $webviewCount = @(Get-WebView2ProcessesForAppId -AppId $appId).Count
    if ($webviewCount -gt 0) {
      if (-not $webviewSeen) {
        $webviewSeen = $true
        $webviewFirstSeenAttempt = $attempt
        Write-Log "[windows-native-dev] webview2 process detected during boot: count=$webviewCount attempt=$attempt"
        # Capture cmdlines of WebView2 browser processes to diagnose UDF path issues.
        $wv2Procs = @(Get-WebView2ProcessesForAppId -AppId $appId)
        $wv2CmdList = @()
        foreach ($wv2p in ($wv2Procs | Select-Object -First 3)) {
          $cmdTrunc = if ($wv2p.CommandLine -and $wv2p.CommandLine.Length -gt 500) {
            $wv2p.CommandLine.Substring(0, 500)
          } else { "$($wv2p.CommandLine)" }
          $wv2CmdList += "pid=$($wv2p.ProcessId) cmd=$cmdTrunc"
        }
        Write-ScriptBootEvent -WorkDir $WorkDir -BootSession $BootSession -Stage "webview2_process_detected" -Payload @{
          source = "windows_native_dev_script"
          count = $webviewCount
          attempt = $attempt
          process_samples = $wv2CmdList
        }
      }
      $webviewLastSeenAttempt = $attempt
    } elseif ($webviewSeen -and -not $webviewLostAfterSeen) {
      $webviewLostAfterSeen = $true
      $webviewLostAttempt = $attempt
      Write-Log "[windows-native-dev] webview2 process lost before app_ready: attempt=$attempt"
      Write-ScriptBootEvent -WorkDir $WorkDir -BootSession $BootSession -Stage "webview2_process_lost_before_app_ready" -Payload @{
        source = "windows_native_dev_script"
        attempt = $attempt
        first_seen_attempt = $webviewFirstSeenAttempt
        last_seen_attempt = $webviewLastSeenAttempt
      }
    }
    $webviewLastCount = $webviewCount

    if ($webviewLostAfterSeen -and $webviewLostAttempt -gt 0 -and (($attempt - $webviewLostAttempt) -ge $earlyFailAttempts)) {
      $script:LastBootFailureReason = "WEBVIEW2_LOST_BEFORE_APP_READY"
      Write-Log "[windows-native-dev] early boot fail after webview2 loss: lost_attempt=$webviewLostAttempt wait_sec=$webViewLostEarlyFailAfterSec"
      break
    }

    $appCount = @(Get-NativeAppProcesses -WorkDir $WorkDir).Count
    if ($appCount -eq 0) {
      Start-Sleep -Milliseconds 250
      continue
    }

    if (-not (Test-Path $bootReadyFile)) {
      Start-Sleep -Milliseconds 250
      continue
    }

    try {
      $marker = Get-Content -Path $bootReadyFile -Raw | ConvertFrom-Json
      $markerSession = "$($marker.session)".Trim()
      $expectedSession = $BootSession.Trim()
      if ($markerSession -eq $expectedSession -and $marker.stage -eq "app_ready") {
        $script:LastBootFailureReason = ""
        Write-ScriptBootEvent -WorkDir $WorkDir -BootSession $BootSession -Stage "webview2_boot_observation" -Payload @{
          source = "windows_native_dev_script"
          outcome = "app_ready"
          webview_seen = $webviewSeen
          webview_lost_after_seen = $webviewLostAfterSeen
          first_seen_attempt = $webviewFirstSeenAttempt
          last_seen_attempt = $webviewLastSeenAttempt
          last_count = $webviewLastCount
        }
        Write-Log "[windows-native-dev] frontend ready marker detected."
        return $true
      }
    } catch {
      Write-Log "[windows-native-dev] ready marker parse failed: $($_.Exception.Message)"
    }

    Start-Sleep -Milliseconds 250
  }

  if ([string]::IsNullOrWhiteSpace($script:LastBootFailureReason)) {
    $script:LastBootFailureReason = "BOOT_MARKER_TIMEOUT"
  }
  $webviewOutcome = "present_but_not_ready"
  if (-not $webviewSeen) {
    $webviewOutcome = "never_detected_before_timeout"
  } elseif ($webviewLostAfterSeen) {
    $webviewOutcome = "exited_before_app_ready"
  }
  Write-ScriptBootEvent -WorkDir $WorkDir -BootSession $BootSession -Stage "webview2_boot_observation" -Payload @{
    source = "windows_native_dev_script"
    outcome = $webviewOutcome
    webview_seen = $webviewSeen
    webview_lost_after_seen = $webviewLostAfterSeen
    first_seen_attempt = $webviewFirstSeenAttempt
    last_seen_attempt = $webviewLastSeenAttempt
    last_count = $webviewLastCount
  }
  Write-Log "[windows-native-dev] webview2 boot observation: outcome=$webviewOutcome seen=$webviewSeen lost=$webviewLostAfterSeen last_count=$webviewLastCount"
  Write-Log "[windows-native-dev] frontend ready timeout after ${TimeoutSeconds}s (session=$BootSession)."
  Write-Log "[windows-native-dev] expected marker file: $bootReadyFile"
  Show-BootStageSummary -WorkDir $WorkDir -BootSession $BootSession
  Capture-BootTimeoutDiagnostics -WorkDir $WorkDir -BootSession $BootSession
  try {
    $state = Get-Content -Path $stateFile -Raw -ErrorAction Stop | ConvertFrom-Json
    if ($state.tauri_log -and (Test-Path $state.tauri_log)) {
      Write-TauriLogFailureSignals -WorkDir $WorkDir -BootSession $BootSession -TauriLogPath $state.tauri_log
      Write-Log "[windows-native-dev] tauri dev log (last 30 lines): $($state.tauri_log)"
      Get-Content -Path $state.tauri_log -Tail 30 | ForEach-Object { Write-Log "  $_" }
    }
  } catch {}
  Write-WindowsFailureSignals -WorkDir $WorkDir -BootSession $BootSession
  return $false
}

function Wait-FrontendReadyWithSingleRetry {
  param(
    [string]$WorkDir,
    [string]$BootSession,
    [int]$TimeoutSeconds
  )

  if ((Wait-ForDevUrlReady -TimeoutSeconds $TimeoutSeconds) -and
    (Wait-ForFrontendReady -WorkDir $WorkDir -BootSession $BootSession -TimeoutSeconds $TimeoutSeconds)) {
    return $true
  }

  Write-Log "[windows-native-dev] boot readiness check failed (reason=$script:LastBootFailureReason), retrying launch once."
  Stop-NativeDevSession -WorkDir $WorkDir
  if ($script:LastBootFailureReason -eq "BOOT_MARKER_TIMEOUT" -or
    $script:LastBootFailureReason -eq "WEBVIEW2_LOST_BEFORE_APP_READY") {
    Reset-WebView2UserData -AppId $appId -DeepClean
  }
  # Wait for WebView2 processes and port 4600 to fully drain before re-launch.
  # Stop-NativeDevSession already calls Wait-WebView2ProcessesGone, so this is
  # just an extra buffer for TCP TIME_WAIT and file handle release.
  Start-Sleep -Milliseconds 3000
  $retryBootSession = Launch-NativeDev -WorkDir $WorkDir
  Ensure-AppWindowForeground -WorkDir $WorkDir
  if ((Wait-ForDevUrlReady -TimeoutSeconds $TimeoutSeconds) -and
    (Wait-ForFrontendReady -WorkDir $WorkDir -BootSession $retryBootSession -TimeoutSeconds $TimeoutSeconds)) {
    return $true
  }

  return $false
}

function Ensure-AppWindowForeground {
  param([string]$WorkDir)

  $maxAttempts = 60
  for ($attempt = 1; $attempt -le $maxAttempts; $attempt++) {
    $apps = @(Get-NativeAppProcesses -WorkDir $WorkDir)
    if ($apps.Count -gt 0) {
      $appProcess = $apps[0]
      $managedProcess = Get-Process -Id $appProcess.ProcessId -ErrorAction SilentlyContinue
      if ($managedProcess -and $managedProcess.MainWindowHandle -ne 0) {
        $windowHandle = [IntPtr]$managedProcess.MainWindowHandle
        $windowRect = New-Object NativeWindowApi+RECT
        [void][NativeWindowApi]::GetWindowRect($windowHandle, [ref]$windowRect)
        $windowWidth = $windowRect.Right - $windowRect.Left
        $windowHeight = $windowRect.Bottom - $windowRect.Top
        $isOffscreen = $windowRect.Left -le -15000 -and $windowRect.Top -le -15000
        $needsRestore = [NativeWindowApi]::IsIconic($windowHandle) -or $isOffscreen -or $windowWidth -lt 400 -or $windowHeight -lt 300

        if ($needsRestore) {
          [void][NativeWindowApi]::ShowWindowAsync($windowHandle, 9)
          Start-Sleep -Milliseconds 200
          [void][NativeWindowApi]::GetWindowRect($windowHandle, [ref]$windowRect)
          $windowWidth = $windowRect.Right - $windowRect.Left
          $windowHeight = $windowRect.Bottom - $windowRect.Top
        }

        [void][NativeWindowApi]::SetForegroundWindow($windowHandle)
        if ($windowWidth -ge 400 -and $windowHeight -ge 300 -and -not [NativeWindowApi]::IsIconic($windowHandle)) {
          Write-Log "[windows-native-dev] app window restored and focused."
          return
        }
      }
    }
    Start-Sleep -Milliseconds 300
  }

  Write-Log "[windows-native-dev] app window not ready for focus yet; continue."
}

$sourceSuffix = $SourceRepoLinuxPath.TrimStart("/").Replace("/", "\")
$sourcePath = "\\wsl.localhost\$Distro\$sourceSuffix"

Write-Log "[windows-native-dev] started at $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")"
Write-Log "[windows-native-dev] action: $Action"
Write-Log "[windows-native-dev] source (linux): $SourceRepoLinuxPath"
Write-Log "[windows-native-dev] source (windows path hint): $SourceRepoWindowsPath"
Write-Log "[windows-native-dev] source (unc): $sourcePath"
Write-Log "[windows-native-dev] target (windows): $WindowsWorkDir"

if (-not (Test-Path $sourcePath)) {
  Write-Log "[windows-native-dev] source path does not exist: $sourcePath"
  exit 1
}

New-Item -ItemType Directory -Force -Path $WindowsWorkDir | Out-Null

if ($Action -eq "status") {
  Show-Status -WorkDir $WindowsWorkDir
  Write-Log "[windows-native-dev] status: OK"
  Write-Log "[windows-native-dev] log file: $logPath"
  exit 0
}

if ($Action -eq "stop") {
  Stop-NativeDevSession -WorkDir $WindowsWorkDir
  Show-Status -WorkDir $WindowsWorkDir
  Write-Log "[windows-native-dev] status: STOPPED"
  Write-Log "[windows-native-dev] log file: $logPath"
  exit 0
}

# For restart: stop BEFORE sync. If we sync first, tauri dev's cargo watcher detects
# source file changes and triggers a hot-reload that kills the exe while WebView2 is
# still initialising (2-4 s), causing its IPC pipe to break and WebView2 to exit silently.
if ($Action -eq "restart") {
  Write-Log "[windows-native-dev] step: stop existing native dev session before sync"
  Stop-NativeDevSession -WorkDir $WindowsWorkDir
  # Wait for port 4600 to drain and all WebView2/Tauri processes to fully release file handles.
  Start-Sleep -Milliseconds 3000
}

Invoke-Robocopy -SourcePath $sourcePath -TargetPath $WindowsWorkDir

$packageJsonPath = Join-Path $WindowsWorkDir "package.json"
if (-not (Test-Path $packageJsonPath)) {
  Write-Log "[windows-native-dev] package.json not found after sync: $packageJsonPath"
  exit 1
}

Ensure-NpmDependencies -WorkDir $WindowsWorkDir

if ($Action -eq "sync") {
  Show-Status -WorkDir $WindowsWorkDir
  Write-Log "[windows-native-dev] status: SYNCED"
  Write-Log "[windows-native-dev] log file: $logPath"
  exit 0
}

if ($Action -eq "apply") {
  if (-not (Is-NativeDevRunning -WorkDir $WindowsWorkDir)) {
    Write-Log "[windows-native-dev] apply mode fallback: app not running, start now."
    $applyBootSession = Launch-NativeDev -WorkDir $WindowsWorkDir
    if (-not (Wait-FrontendReadyWithSingleRetry -WorkDir $WindowsWorkDir -BootSession $applyBootSession -TimeoutSeconds $BootReadyTimeoutSec)) {
      Write-Log "[windows-native-dev] boot failure reason: $script:LastBootFailureReason"
      Write-Log "[windows-native-dev] status: BOOT_TIMEOUT"
      Write-Log "[windows-native-dev] log file: $logPath"
      exit 11
    }
  }
  Ensure-AppWindowForeground -WorkDir $WindowsWorkDir

  Show-Status -WorkDir $WindowsWorkDir
  Write-Log "[windows-native-dev] status: SYNCED"
  Write-Log "[windows-native-dev] log file: $logPath"
  exit 0
}

if ($Action -eq "restart") {
  $restartBootSession = Launch-NativeDev -WorkDir $WindowsWorkDir
  Ensure-AppWindowForeground -WorkDir $WindowsWorkDir
  if (-not (Wait-FrontendReadyWithSingleRetry -WorkDir $WindowsWorkDir -BootSession $restartBootSession -TimeoutSeconds $BootReadyTimeoutSec)) {
    Show-Status -WorkDir $WindowsWorkDir
    Write-Log "[windows-native-dev] boot failure reason: $script:LastBootFailureReason"
    Write-Log "[windows-native-dev] status: BOOT_TIMEOUT"
    Write-Log "[windows-native-dev] log file: $logPath"
    exit 11
  }
  Show-Status -WorkDir $WindowsWorkDir
  Write-Log "[windows-native-dev] status: RESTARTED"
  Write-Log "[windows-native-dev] log file: $logPath"
  exit 0
}

if ($Action -eq "start") {
  $startBootSession = Launch-NativeDev -WorkDir $WindowsWorkDir
  Ensure-AppWindowForeground -WorkDir $WindowsWorkDir
  if (-not (Wait-FrontendReadyWithSingleRetry -WorkDir $WindowsWorkDir -BootSession $startBootSession -TimeoutSeconds $BootReadyTimeoutSec)) {
    Show-Status -WorkDir $WindowsWorkDir
    Write-Log "[windows-native-dev] boot failure reason: $script:LastBootFailureReason"
    Write-Log "[windows-native-dev] status: BOOT_TIMEOUT"
    Write-Log "[windows-native-dev] log file: $logPath"
    exit 11
  }
  Show-Status -WorkDir $WindowsWorkDir
  Write-Log "[windows-native-dev] status: STARTED"
  Write-Log "[windows-native-dev] log file: $logPath"
  exit 0
}

Write-Log "[windows-native-dev] unsupported action after validation: $Action"
exit 2
