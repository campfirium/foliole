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
$script:LastBootFailureReason = ""

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

function Stop-NativeDevSession {
  param([string]$WorkDir)

  $launchers = Get-NativeLauncherProcesses -WorkDir $WorkDir
  foreach ($launcher in $launchers) {
    try {
      Stop-Process -Id $launcher.ProcessId -Force -ErrorAction Stop
      Write-Log "[windows-native-dev] stopped launcher pid=$($launcher.ProcessId)"
    } catch {
      Write-Log "[windows-native-dev] failed to stop launcher pid=$($launcher.ProcessId): $($_.Exception.Message)"
    }
  }

  $apps = Get-NativeAppProcesses -WorkDir $WorkDir
  foreach ($app in $apps) {
    try {
      # Use taskkill /T to kill the entire process tree (Tauri + all WebView2 children)
      $result = taskkill.exe /PID $app.ProcessId /T /F 2>&1
      Write-Log "[windows-native-dev] stopped app pid=$($app.ProcessId) (tree): $result"
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

  # Wait for foliole-tauri-core.exe to fully exit (up to 5s), then clean up
  # the WebView2 User Data Directory lock so the next launch doesn't deadlock.
  $exePath = (Join-Path $WorkDir "src-tauri\target\debug\foliole-tauri-core.exe").ToLowerInvariant()
  $waited = 0
  while ($waited -lt 5000) {
    $still = Get-CimInstance Win32_Process | Where-Object {
      $_.Name -eq "foliole-tauri-core.exe" -and
      $_.ExecutablePath -and
      $_.ExecutablePath.ToLowerInvariant() -eq $exePath
    }
    if (-not $still) { break }
    Start-Sleep -Milliseconds 300
    $waited += 300
  }

  $appId = "com.foliole.desktop"
  $uddLock = "$env:LOCALAPPDATA\$appId\EBWebView\Default\LOCK"
  if (Test-Path $uddLock) {
    Remove-Item -Force $uddLock -ErrorAction SilentlyContinue
    Write-Log "[windows-native-dev] cleared WebView2 UDD lock: $uddLock"
  }
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

function Is-NativeDevRunning {
  param([string]$WorkDir)

  $apps = @(Get-NativeAppProcesses -WorkDir $WorkDir)
  return $apps.Count -gt 0
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

  if (Is-NativeDevRunning -WorkDir $WorkDir) {
    Write-Log "[windows-native-dev] native app already running, skip launch."
    return ""
  }

  if (Test-Path $bootReadyFile) {
    Remove-Item -Force $bootReadyFile -ErrorAction SilentlyContinue
  }

  $bootSession = [Guid]::NewGuid().ToString("N")
  $tauriLogTimestamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $tauriLogPath = Join-Path $LogDir "tauri-dev-$tauriLogTimestamp.log"
  $launchCommand = "cd /d `"$WorkDir`" && set `"FOLIOLE_WORKDIR=$WorkDir`" && set `"FOLIOLE_BOOT_SESSION=$bootSession`" && npm run tauri:dev >> `"$tauriLogPath`" 2>&1"
  Write-Log ""
  Write-Log "[windows-native-dev] step: launch native tauri dev"
  Write-Log "[windows-native-dev] cmd: $launchCommand"
  Write-Log "[windows-native-dev] boot session: $bootSession"
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

  $maxAttempts = [Math]::Max(1, [Math]::Ceiling(($TimeoutSeconds * 1000) / 250))
  for ($attempt = 1; $attempt -le $maxAttempts; $attempt++) {
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
        Write-Log "[windows-native-dev] frontend ready marker detected."
        return $true
      }
    } catch {
      Write-Log "[windows-native-dev] ready marker parse failed: $($_.Exception.Message)"
    }

    Start-Sleep -Milliseconds 250
  }

  $script:LastBootFailureReason = "BOOT_MARKER_TIMEOUT"
  Write-Log "[windows-native-dev] frontend ready timeout after ${TimeoutSeconds}s (session=$BootSession)."
  Write-Log "[windows-native-dev] expected marker file: $bootReadyFile"
  try {
    $state = Get-Content -Path $stateFile -Raw -ErrorAction Stop | ConvertFrom-Json
    if ($state.tauri_log -and (Test-Path $state.tauri_log)) {
      Write-Log "[windows-native-dev] tauri dev log (last 30 lines): $($state.tauri_log)"
      Get-Content -Path $state.tauri_log -Tail 30 | ForEach-Object { Write-Log "  $_" }
    }
  } catch {}
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

Invoke-Robocopy -SourcePath $sourcePath -TargetPath $WindowsWorkDir

$packageJsonPath = Join-Path $WindowsWorkDir "package.json"
if (-not (Test-Path $packageJsonPath)) {
  Write-Log "[windows-native-dev] package.json not found after sync: $packageJsonPath"
  exit 1
}

if ($Action -eq "restart") {
  Write-Log "[windows-native-dev] step: stop existing native dev session before dependency install"
  Stop-NativeDevSession -WorkDir $WindowsWorkDir
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
