param(
  [string]$WindowsWorkDir = "C:\dev\foliole-android-preview",
  [string]$AppId = "com.foliole.android",
  [string]$MainActivity = "com.foliole.android.MainActivity",
  [int]$DevServerPort = 24604,
  [int]$DevSyncPort = 38641,
  [int]$BootTimeoutSeconds = 180,
  [string]$TargetSerial = $env:FOLIOLE_ANDROID_SERIAL,
  [string]$StateRoot = ""
)

$ErrorActionPreference = "Stop"

function Write-Info {
  param([string]$Message)
  Write-Host "[android-dev-server-launch] $Message"
}

function Invoke-AdbCommand {
  param([string]$AdbPath, [string[]]$Arguments)
  $out = [System.IO.Path]::GetTempFileName(); $err = [System.IO.Path]::GetTempFileName()
  try {
    $process = Start-Process -FilePath $AdbPath -ArgumentList $Arguments -Wait -PassThru -WindowStyle Hidden -RedirectStandardOutput $out -RedirectStandardError $err
    $global:LASTEXITCODE = $process.ExitCode
    Get-Content -Path $out -ErrorAction SilentlyContinue
    Get-Content -Path $err -ErrorAction SilentlyContinue
  } finally { Remove-Item -Path $out, $err -ErrorAction SilentlyContinue }
}

function Invoke-CheckedAdbCommand {
  param([string]$AdbPath, [string[]]$Arguments, [string]$Description)
  $lines = Invoke-AdbCommand -AdbPath $AdbPath -Arguments $Arguments
  if ($global:LASTEXITCODE -ne 0) {
    throw "$Description failed with exit code $global:LASTEXITCODE"
  }
  return $lines
}

function Resolve-SdkRoot {
  $candidates = @(
    $env:ANDROID_SDK_ROOT,
    $env:ANDROID_HOME,
    "$env:LOCALAPPDATA\Android\Sdk"
  ) | Where-Object { $_ -and $_.Trim().Length -gt 0 }
  foreach ($candidate in $candidates) {
    if (Test-Path -Path $candidate) {
      return $candidate
    }
  }
  throw "Android SDK not found. Install Android SDK first."
}

function Resolve-StateRoot {
  param([string]$RequestedStateRoot, [string]$WindowsWorkDir)
  if ($RequestedStateRoot -and $RequestedStateRoot.Trim().Length -gt 0) {
    return $RequestedStateRoot
  }
  if ($env:FOLIOLE_WINDOWS_ANDROID_DEV_SERVER_STATE_ROOT) {
    return $env:FOLIOLE_WINDOWS_ANDROID_DEV_SERVER_STATE_ROOT
  }
  if ($WindowsWorkDir -and $WindowsWorkDir.Trim().Length -gt 0) {
    return (Join-Path $WindowsWorkDir ".tmp\windows-android-dev-server")
  }
  return ""
}

function Write-AppRuntimeState {
  param(
    [string]$StateRoot,
    [string]$Serial,
    [string]$AppId,
    [string]$MainActivity,
    [int]$DevServerPort,
    [int]$DevSyncPort,
    [string]$ReverseStatus
  )
  if (!$StateRoot) { return }
  New-Item -ItemType Directory -Path $StateRoot -Force | Out-Null
  $statePath = Join-Path $StateRoot "a5-runtime.json"
  $state = [ordered]@{
    appId = $AppId
    appLaunchResult = "opened"
    mainActivity = $MainActivity
    reverseStatus = $ReverseStatus
    serial = $Serial
    devServerPort = $DevServerPort
    devSyncPort = $DevSyncPort
    updatedAt = (Get-Date).ToUniversalTime().ToString("o")
  }
  $tmpPath = "$statePath.tmp"
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($tmpPath, (($state | ConvertTo-Json -Depth 4) + [Environment]::NewLine), $utf8NoBom)
  Move-Item -Path $tmpPath -Destination $statePath -Force
}

function Wait-ForDeviceReady {
  param(
    [string]$AdbPath,
    [string]$TargetSerial,
    [int]$TimeoutSeconds
  )
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    $deviceLines = (Invoke-AdbCommand -AdbPath $AdbPath -Arguments @("devices")) | Select-Object -Skip 1
    $serial = Resolve-AndroidDeviceSerialFromAdbDevices -DeviceLines $deviceLines -TargetSerial $TargetSerial
    if ($null -ne $serial) {
      return $serial
    }
    Start-Sleep -Seconds 3
  }
  return $null
}

$sdkRoot = Resolve-SdkRoot
$resolvedStateRoot = Resolve-StateRoot -RequestedStateRoot $StateRoot -WindowsWorkDir $WindowsWorkDir
$env:ANDROID_HOME = $sdkRoot
$env:ANDROID_SDK_ROOT = $sdkRoot
$env:Path = "$sdkRoot\platform-tools;$env:Path"

$adbPath = Join-Path $sdkRoot "platform-tools\adb.exe"
$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$adbDeviceScript = Join-Path $repoRoot "scripts\android\windows-adb-device.ps1"
if (!(Test-Path -Path $adbPath)) {
  throw "adb not found: $adbPath"
}
if (!(Test-Path -Path $adbDeviceScript)) {
  throw "Android adb device helper not found: $adbDeviceScript"
}
. $adbDeviceScript

Write-Info "waiting for ready device"
Invoke-CheckedAdbCommand -AdbPath $adbPath -Arguments @("start-server") -Description "adb start-server" *> $null
$serial = Wait-ForDeviceReady -AdbPath $adbPath -TargetSerial $TargetSerial -TimeoutSeconds $BootTimeoutSeconds
if ($null -eq $serial) {
  throw "No ready Android device found within ${BootTimeoutSeconds}s."
}
Write-Info "device: $serial"

if ($DevSyncPort -gt 0) {
  Write-Info "configuring dev sync reverse: tcp:$DevSyncPort"
  Invoke-CheckedAdbCommand -AdbPath $adbPath -Arguments @("-s", $serial, "reverse", "tcp:$DevSyncPort", "tcp:$DevSyncPort") -Description "adb reverse dev sync" *> $null
}
if ($DevServerPort -gt 0) {
  Write-Info "configuring dev server reverse: tcp:$DevServerPort"
  Invoke-CheckedAdbCommand -AdbPath $adbPath -Arguments @("-s", $serial, "reverse", "tcp:$DevServerPort", "tcp:$DevServerPort") -Description "adb reverse dev server" *> $null
}

Write-Info "restarting activity: $AppId/$MainActivity"
$reverseStatus = if (($DevSyncPort -gt 0) -or ($DevServerPort -gt 0)) { "ok" } else { "skipped" }
Invoke-CheckedAdbCommand -AdbPath $adbPath -Arguments @("-s", $serial, "shell", "am", "force-stop", $AppId) -Description "adb force-stop" *> $null
Invoke-CheckedAdbCommand -AdbPath $adbPath -Arguments @("-s", $serial, "shell", "am", "start", "-n", "$AppId/$MainActivity") -Description "adb start activity"
Write-AppRuntimeState -StateRoot $resolvedStateRoot -Serial $serial -AppId $AppId -MainActivity $MainActivity -DevServerPort $DevServerPort -DevSyncPort $DevSyncPort -ReverseStatus $reverseStatus
Write-Info "status: OPENED"
