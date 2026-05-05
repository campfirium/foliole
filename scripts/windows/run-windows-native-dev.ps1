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
  [ValidateSet("start", "sync", "restart", "stop", "status", "apply")]
  [string]$Action = "apply"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
Set-Location -Path $env:SystemRoot

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$logPath = Join-Path $LogDir "windows-native-dev-$timestamp.log"
$stateFile = Join-Path $WindowsWorkDir ".windows-native-dev-state.json"

function Write-Log {
  param([string]$Message)
  $Message | Tee-Object -FilePath $logPath -Append
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
  $excludeFiles = @("*.log", "*.tmp", ".windows-native-dev-state.json")

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

  if (Test-Path (Join-Path $WorkDir "node_modules")) {
    Write-Log "[windows-native-dev] node_modules exists, skip install."
    return
  }

  $lockPath = Join-Path $WorkDir "package-lock.json"
  if (Test-Path $lockPath) {
    $installCommand = "cd /d `"$WorkDir`" && npm ci --no-audit --no-fund"
  } else {
    $installCommand = "cd /d `"$WorkDir`" && npm install --no-audit --no-fund"
  }

  Write-Log ""
  Write-Log "[windows-native-dev] step: install dependencies"
  Write-Log "[windows-native-dev] cmd: $installCommand"
  cmd.exe /d /c "$installCommand" 2>&1 | Tee-Object -FilePath $logPath -Append | Out-Host
  if ($LASTEXITCODE -ne 0) {
    Write-Log "[windows-native-dev] install failed, exit=$LASTEXITCODE"
    exit $LASTEXITCODE
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
      Stop-Process -Id $app.ProcessId -Force -ErrorAction Stop
      Write-Log "[windows-native-dev] stopped app pid=$($app.ProcessId)"
    } catch {
      Write-Log "[windows-native-dev] failed to stop app pid=$($app.ProcessId): $($_.Exception.Message)"
    }
  }

  if (Test-Path $stateFile) {
    Remove-Item -Force $stateFile
  }
}

function Save-StateFile {
  param(
    [string]$WorkDir,
    [int]$LauncherPid
  )

  $payload = [ordered]@{
    launcher_pid = $LauncherPid
    started_at = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
    workdir = $WorkDir
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
    return
  }

  $launchCommand = "cd /d `"$WorkDir`" && npm run tauri:dev"
  Write-Log ""
  Write-Log "[windows-native-dev] step: launch native tauri dev"
  Write-Log "[windows-native-dev] cmd: $launchCommand"
  $cmdProc = Start-Process -FilePath "cmd.exe" -ArgumentList "/k", $launchCommand -PassThru
  Save-StateFile -WorkDir $WorkDir -LauncherPid $cmdProc.Id
  Write-Log "[windows-native-dev] launcher pid: $($cmdProc.Id)"
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
    Launch-NativeDev -WorkDir $WindowsWorkDir
  }

  Show-Status -WorkDir $WindowsWorkDir
  Write-Log "[windows-native-dev] status: SYNCED"
  Write-Log "[windows-native-dev] log file: $logPath"
  exit 0
}

if ($Action -eq "restart") {
  Stop-NativeDevSession -WorkDir $WindowsWorkDir
  Launch-NativeDev -WorkDir $WindowsWorkDir
  Show-Status -WorkDir $WindowsWorkDir
  Write-Log "[windows-native-dev] status: RESTARTED"
  Write-Log "[windows-native-dev] log file: $logPath"
  exit 0
}

if ($Action -eq "start") {
  Launch-NativeDev -WorkDir $WindowsWorkDir
  Show-Status -WorkDir $WindowsWorkDir
  Write-Log "[windows-native-dev] status: STARTED"
  Write-Log "[windows-native-dev] log file: $logPath"
  exit 0
}

Write-Log "[windows-native-dev] unsupported action after validation: $Action"
exit 2
