param(
  [string]$OutputDir = ".tmp\android-screenshots"
)

$ErrorActionPreference = "Stop"

function Write-Info {
  param([string]$Message)
  Write-Host "[android-screenshot] $Message"
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

function Get-RunningDeviceSerial {
  param([string]$AdbPath)

  $deviceLines = (& $AdbPath devices 2>$null) | Select-Object -Skip 1
  foreach ($line in $deviceLines) {
    $trimmed = $line.Trim()
    if ([string]::IsNullOrWhiteSpace($trimmed)) {
      continue
    }

    $parts = $trimmed -split "\s+"
    if ($parts.Count -ge 2 -and $parts[1] -eq "device") {
      return $parts[0]
    }
  }

  return $null
}

$adbPath = Resolve-AdbPath
& $adbPath start-server | Out-Null

$serial = Get-RunningDeviceSerial -AdbPath $adbPath
if ($null -eq $serial) {
  throw "No ready Android emulator/device found."
}

if (!(Test-Path -Path $OutputDir)) {
  New-Item -ItemType Directory -Path $OutputDir | Out-Null
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$outputPath = Join-Path $OutputDir "android-$timestamp.png"
$devicePath = "/sdcard/Download/foliole-screenshot-$timestamp.png"

Write-Info "device: $serial"
& $adbPath -s $serial shell screencap -p $devicePath
if ($LASTEXITCODE -ne 0) {
  throw "Android screenshot capture failed."
}
& $adbPath -s $serial pull $devicePath $outputPath | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw "Android screenshot pull failed."
}
& $adbPath -s $serial shell rm $devicePath | Out-Null

Write-Info "file: $outputPath"
Write-Info "status: CAPTURED"
