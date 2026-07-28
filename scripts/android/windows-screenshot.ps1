param(
  [string]$OutputDir = ".tmp\android-screenshots",
  [string]$TargetSerial = ""
)

$ErrorActionPreference = "Stop"

function Write-Info {
  param([string]$Message)
  Write-Host "[android-screenshot] $Message"
}

function Test-LastCommandFailed {
  return $null -ne $LASTEXITCODE -and $LASTEXITCODE -ne 0
}

function Invoke-ScreenshotCapture {
  param(
    [string]$AdbPath,
    [string]$Serial,
    [string[]]$AdbPrefix,
    [string]$OutputPath
  )

  $process = Start-Process `
    -FilePath $AdbPath `
    -ArgumentList ($AdbPrefix + @("-s", $Serial, "exec-out", "screencap", "-p")) `
    -RedirectStandardOutput $OutputPath `
    -WindowStyle Hidden `
    -Wait `
    -PassThru
  if ($process.ExitCode -ne 0 -or !(Test-Path -LiteralPath $OutputPath)) {
    throw "Android screenshot capture failed."
  }
}

function Invoke-DeviceWake {
  param(
    [string]$AdbPath,
    [string]$Serial,
    [string[]]$AdbPrefix
  )

  $wake = Start-Process `
    -FilePath $AdbPath `
    -ArgumentList ($AdbPrefix + @("-s", $Serial, "shell", "input", "keyevent", "KEYCODE_WAKEUP")) `
    -WindowStyle Hidden `
    -Wait `
    -PassThru
  if ($wake.ExitCode -ne 0) {
    Write-Info "screen wake skipped: adb input was rejected."
    return
  }
  $dismiss = Start-Process `
    -FilePath $AdbPath `
    -ArgumentList ($AdbPrefix + @("-s", $Serial, "shell", "wm", "dismiss-keyguard")) `
    -WindowStyle Hidden `
    -Wait `
    -PassThru
  if ($dismiss.ExitCode -ne 0) {
    Write-Info "keyguard dismissal skipped: device rejected the request."
  }
  Start-Sleep -Milliseconds 750
}

. "$PSScriptRoot\windows-adb-device.ps1"

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

function Resolve-AdbPath {
  $sdkRoot = Resolve-SdkRoot
  $sdkAdbPath = Join-Path $sdkRoot "platform-tools\adb.exe"
  if (Test-Path -Path $sdkAdbPath) {
    return $sdkAdbPath
  }

  $adbExe = Get-Command adb.exe -ErrorAction SilentlyContinue
  if ($null -ne $adbExe) {
    return $adbExe.Source
  }

  throw "adb not found. Install Android platform-tools first."
}

$adbPath = Resolve-AdbPath
$adbPrefix = @()
if (![string]::IsNullOrWhiteSpace($env:FOLIOLE_ANDROID_ADB_SERVER_PORT)) {
  $adbPrefix = @("-P", $env:FOLIOLE_ANDROID_ADB_SERVER_PORT)
  $env:ANDROID_ADB_SERVER_PORT = $env:FOLIOLE_ANDROID_ADB_SERVER_PORT
}
& $adbPath @adbPrefix start-server *> $null

if (![string]::IsNullOrWhiteSpace($TargetSerial)) {
  $serial = $TargetSerial
} else {
  $devicesOutput = & $adbPath @adbPrefix devices 2>$null
  $deviceLines = $devicesOutput | Select-Object -Skip 1
  $serial = Resolve-AndroidDeviceSerialFromAdbDevices -DeviceLines $deviceLines -TargetSerial $TargetSerial
}
if ($null -eq $serial) {
  throw "No ready Android emulator/device found."
}

if (!(Test-Path -Path $OutputDir)) {
  New-Item -ItemType Directory -Path $OutputDir | Out-Null
}
$resolvedOutputDir = (Resolve-Path -LiteralPath $OutputDir).Path

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$outputPath = Join-Path $resolvedOutputDir "android-$timestamp.png"

Write-Info "device: $serial"
Invoke-DeviceWake -AdbPath $adbPath -Serial $serial -AdbPrefix $adbPrefix
Invoke-ScreenshotCapture -AdbPath $adbPath -Serial $serial -AdbPrefix $adbPrefix -OutputPath $outputPath

Write-Info "file: $outputPath"
Write-Info "status: CAPTURED"
