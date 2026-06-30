param(
  [string]$WindowsWorkDir = "C:\dev\foliole-android-preview",
  [string]$AppId = "com.foliole.android",
  [string]$MainActivity = "com.foliole.android.MainActivity",
  [int]$DevServerPort = 24604,
  [int]$DevSyncPort = 38641,
  [int]$BootTimeoutSeconds = 180,
  [string]$TargetSerial = ""
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
Invoke-AdbCommand -AdbPath $adbPath -Arguments @("start-server") *> $null
$serial = Wait-ForDeviceReady -AdbPath $adbPath -TargetSerial $TargetSerial -TimeoutSeconds $BootTimeoutSeconds
if ($null -eq $serial) {
  throw "No ready Android device found within ${BootTimeoutSeconds}s."
}
Write-Info "device: $serial"

if ($DevSyncPort -gt 0) {
  Write-Info "configuring dev sync reverse: tcp:$DevSyncPort"
  Invoke-AdbCommand -AdbPath $adbPath -Arguments @("-s", $serial, "reverse", "tcp:$DevSyncPort", "tcp:$DevSyncPort") *> $null
}
if ($DevServerPort -gt 0) {
  Write-Info "configuring dev server reverse: tcp:$DevServerPort"
  Invoke-AdbCommand -AdbPath $adbPath -Arguments @("-s", $serial, "reverse", "tcp:$DevServerPort", "tcp:$DevServerPort") *> $null
}

Write-Info "restarting activity: $AppId/$MainActivity"
Invoke-AdbCommand -AdbPath $adbPath -Arguments @("-s", $serial, "shell", "am", "force-stop", $AppId) *> $null
Invoke-AdbCommand -AdbPath $adbPath -Arguments @("-s", $serial, "shell", "am", "start", "-n", "$AppId/$MainActivity")
Write-Info "status: OPENED"
