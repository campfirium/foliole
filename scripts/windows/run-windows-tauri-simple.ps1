param(
  [Parameter(Mandatory = $true)]
  [string]$Distro,
  [Parameter(Mandatory = $true)]
  [string]$SourceRepoLinuxPath,
  [Parameter(Mandatory = $true)]
  [string]$WindowsWorkDir,
  [Parameter(Mandatory = $true)]
  [string]$LogDir,
  [ValidateSet("start", "stop", "restart", "status")]
  [string]$Action = "start"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
Set-Location -Path $env:SystemRoot

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$logPath = Join-Path $LogDir "windows-tauri-simple-$timestamp.log"
$stateFile = Join-Path $WindowsWorkDir ".windows-tauri-simple-state.json"

function Write-Log {
  param([string]$Message)
  $Message | Tee-Object -FilePath $logPath -Append | Out-Host
}

function Invoke-Robocopy {
  param([string]$SourcePath, [string]$TargetPath)

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
  $excludeFiles = @("*.log", "*.tmp", ".windows-tauri-simple-state.json")

  $dirArgs = ($excludeDirs | ForEach-Object { "/XD `"$($_)`"" }) -join " "
  $fileArgs = ($excludeFiles | ForEach-Object { "/XF `"$($_)`"" }) -join " "
  $syncCommand = "robocopy `"$SourcePath`" `"$TargetPath`" /MIR /R:2 /W:1 /NFL /NDL /NP /XJ $dirArgs $fileArgs"

  Write-Log "[windows-tauri-simple] step: sync source to windows mirror"
  Write-Log "[windows-tauri-simple] cmd: $syncCommand"
  cmd.exe /d /c "$syncCommand" 2>&1 | Tee-Object -FilePath $logPath -Append | Out-Host
  $code = $LASTEXITCODE
  if ($code -ge 8) {
    Write-Log "[windows-tauri-simple] sync failed, robocopy exit=$code"
    exit $code
  }
  Write-Log "[windows-tauri-simple] sync done, robocopy exit=$code"
}

function Get-LauncherProcesses {
  param([string]$WorkDir)

  $normalizedWorkDir = $WorkDir.ToLowerInvariant()
  return Get-CimInstance Win32_Process | Where-Object {
    if ($_.Name -ne "cmd.exe" -or -not $_.CommandLine) {
      return $false
    }

    $commandLineLower = $_.CommandLine.ToLowerInvariant()
    return $commandLineLower.Contains($normalizedWorkDir) -and
      $commandLineLower.Contains("npm run tauri:dev")
  }
}

function Get-AppProcesses {
  param([string]$WorkDir)

  $exePathLower = (Join-Path $WorkDir "src-tauri\target\debug\foliole-tauri-core.exe").ToLowerInvariant()
  return Get-CimInstance Win32_Process | Where-Object {
    $_.Name -eq "foliole-tauri-core.exe" -and
    $_.ExecutablePath -and
    $_.ExecutablePath.ToLowerInvariant() -eq $exePathLower
  }
}

function Save-StateFile {
  param([string]$WorkDir, [int]$LauncherPid)

  $payload = [ordered]@{
    launcher_pid = $LauncherPid
    started_at = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
    workdir = $WorkDir
    command = "npm run tauri:dev"
  }

  $payload | ConvertTo-Json | Out-File -FilePath $stateFile -Encoding utf8
}

function Stop-Session {
  param([string]$WorkDir)

  $launchers = @(Get-LauncherProcesses -WorkDir $WorkDir)
  foreach ($launcher in $launchers) {
    try {
      Stop-Process -Id $launcher.ProcessId -Force -ErrorAction Stop
      Write-Log "[windows-tauri-simple] stopped launcher pid=$($launcher.ProcessId)"
    } catch {
      try {
        $result = taskkill.exe /PID $launcher.ProcessId /T /F 2>&1
        Write-Log "[windows-tauri-simple] stopped launcher pid=$($launcher.ProcessId) with taskkill: $result"
      } catch {
        Write-Log "[windows-tauri-simple] failed to stop launcher pid=$($launcher.ProcessId): $($_.Exception.Message)"
      }
    }
  }

  $apps = @(Get-AppProcesses -WorkDir $WorkDir)
  foreach ($app in $apps) {
    try {
      $result = taskkill.exe /PID $app.ProcessId /T /F 2>&1
      Write-Log "[windows-tauri-simple] stopped app pid=$($app.ProcessId): $result"
    } catch {
      Write-Log "[windows-tauri-simple] failed to stop app pid=$($app.ProcessId): $($_.Exception.Message)"
    }
  }

  if (Test-Path $stateFile) {
    Remove-Item -Force $stateFile
  }
}

function Show-Status {
  param([string]$WorkDir)

  $launchers = @(Get-LauncherProcesses -WorkDir $WorkDir)
  $apps = @(Get-AppProcesses -WorkDir $WorkDir)

  Write-Log "[windows-tauri-simple] launcher process count: $($launchers.Count)"
  foreach ($launcher in $launchers) {
    Write-Log "[windows-tauri-simple] launcher pid=$($launcher.ProcessId)"
  }

  Write-Log "[windows-tauri-simple] app process count: $($apps.Count)"
  foreach ($app in $apps) {
    Write-Log "[windows-tauri-simple] app pid=$($app.ProcessId)"
  }

  if (Test-Path $stateFile) {
    Write-Log "[windows-tauri-simple] state file: $stateFile"
  } else {
    Write-Log "[windows-tauri-simple] state file: missing"
  }
}

function Start-Session {
  param([string]$WorkDir)

  $existingApps = @(Get-AppProcesses -WorkDir $WorkDir)
  if ($existingApps.Count -gt 0) {
    Write-Log "[windows-tauri-simple] app already running, skip start."
    return
  }

  $launchCommand = "cd /d `"$WorkDir`" && npm run tauri:dev"
  Write-Log "[windows-tauri-simple] step: launch tauri dev"
  Write-Log "[windows-tauri-simple] cmd: $launchCommand"

  $proc = Start-Process -FilePath "cmd.exe" -ArgumentList "/k", $launchCommand -PassThru
  Save-StateFile -WorkDir $WorkDir -LauncherPid $proc.Id
  Write-Log "[windows-tauri-simple] launcher pid: $($proc.Id)"
}

$sourceSuffix = $SourceRepoLinuxPath.TrimStart("/").Replace("/", "\")
$sourcePath = "\\wsl.localhost\$Distro\$sourceSuffix"

Write-Log "[windows-tauri-simple] started at $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")"
Write-Log "[windows-tauri-simple] action: $Action"
Write-Log "[windows-tauri-simple] source (linux): $SourceRepoLinuxPath"
Write-Log "[windows-tauri-simple] source (unc): $sourcePath"
Write-Log "[windows-tauri-simple] target (windows): $WindowsWorkDir"

if (-not (Test-Path $sourcePath)) {
  Write-Log "[windows-tauri-simple] source path does not exist: $sourcePath"
  exit 1
}

New-Item -ItemType Directory -Force -Path $WindowsWorkDir | Out-Null

if ($Action -eq "status") {
  Show-Status -WorkDir $WindowsWorkDir
  Write-Log "[windows-tauri-simple] status: OK"
  exit 0
}

if ($Action -eq "stop") {
  Stop-Session -WorkDir $WindowsWorkDir
  Show-Status -WorkDir $WindowsWorkDir
  Write-Log "[windows-tauri-simple] status: STOPPED"
  exit 0
}

Invoke-Robocopy -SourcePath $sourcePath -TargetPath $WindowsWorkDir

if ($Action -eq "restart") {
  Stop-Session -WorkDir $WindowsWorkDir
  Start-Sleep -Milliseconds 1000
}

Start-Session -WorkDir $WindowsWorkDir
Show-Status -WorkDir $WindowsWorkDir
Write-Log "[windows-tauri-simple] status: STARTED"
exit 0
