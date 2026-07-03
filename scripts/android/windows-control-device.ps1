param(
  [string]$TargetSerial = "",
  [string]$ScrcpyPath = "",
  [string]$AdbPath = ""
)

$ErrorActionPreference = "Stop"

function Write-Info {
  param([string]$Message)
  Write-Host "[android-control] $Message"
}

function Resolve-ScrcpyPath {
  param([string]$PreferredPath)

  $candidates = @(
    $PreferredPath,
    $env:SCRCPY_PATH
  ) | Where-Object { $_ -and $_.Trim().Length -gt 0 }

  foreach ($candidate in $candidates) {
    if (Test-Path -LiteralPath $candidate) {
      return (Resolve-Path -LiteralPath $candidate).Path
    }
  }

  $command = Get-Command scrcpy.exe -ErrorAction SilentlyContinue
  if ($null -ne $command) {
    return $command.Source
  }

  $scoopCandidate = Join-Path $env:USERPROFILE "scoop\shims\scrcpy.exe"
  if (Test-Path -LiteralPath $scoopCandidate) {
    return $scoopCandidate
  }

  $localCandidate = "C:\tmp\scrcpy\scrcpy-win64-v3.3.4\scrcpy.exe"
  if (Test-Path -LiteralPath $localCandidate) {
    return $localCandidate
  }

  throw "scrcpy.exe not found. Install scrcpy or set SCRCPY_PATH."
}

function Resolve-AdbPath {
  param([string]$PreferredPath)

  $candidates = @(
    $PreferredPath,
    $env:ADB_PATH,
    (Join-Path $env:LOCALAPPDATA "Android\Sdk\platform-tools\adb.exe")
  ) | Where-Object { $_ -and $_.Trim().Length -gt 0 }

  foreach ($candidate in $candidates) {
    if (Test-Path -LiteralPath $candidate) {
      return (Resolve-Path -LiteralPath $candidate).Path
    }
  }

  $command = Get-Command adb.exe -ErrorAction SilentlyContinue
  if ($null -ne $command) {
    return $command.Source
  }

  throw "adb.exe not found. Install Android platform-tools or set ADB_PATH."
}

function Get-FolioleScrcpyProcesses {
  param([string]$Serial)

  Get-CimInstance Win32_Process -Filter "Name = 'scrcpy.exe'" |
    Where-Object {
      $_.CommandLine -like "*--window-title=Foliole-Android*" -and
        ([string]::IsNullOrWhiteSpace($Serial) -or $_.CommandLine -like "*--serial=$Serial*")
    } |
    Sort-Object ProcessId
}

function Stop-ExtraFolioleScrcpyProcesses {
  param([object[]]$Processes)

  if ($Processes.Count -le 1) {
    return
  }

  $extraProcesses = $Processes | Select-Object -Skip 1
  foreach ($process in $extraProcesses) {
    Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
  }
  Write-Info "closed duplicate mirrors: $($extraProcesses.Count)"
}

function Set-DeviceScreenOff {
  param(
    [string]$Adb,
    [string]$Serial
  )

  $adbArgs = @()
  if (![string]::IsNullOrWhiteSpace($Serial)) {
    $adbArgs = @("-s", $Serial)
  }

  & $Adb @adbArgs shell svc power stayon false | Out-Null
  & $Adb @adbArgs shell settings put global stay_on_while_plugged_in 0 | Out-Null
  & $Adb @adbArgs shell input keyevent KEYCODE_SLEEP | Out-Null
}

$scrcpy = Resolve-ScrcpyPath -PreferredPath $ScrcpyPath
$adb = Resolve-AdbPath -PreferredPath $AdbPath
$serial = $TargetSerial
if ([string]::IsNullOrWhiteSpace($serial)) {
  $serial = $env:FOLIOLE_ANDROID_SERIAL
}
if ([string]::IsNullOrWhiteSpace($serial)) {
  $serial = $env:ANDROID_SERIAL
}

$arguments = @(
  "--turn-screen-off",
  "--no-audio",
  "--window-title=Foliole-Android",
  "--window-x=40",
  "--window-y=40",
  "--window-width=840",
  "--window-height=1530"
)
if (![string]::IsNullOrWhiteSpace($serial)) {
  $arguments = @("--serial=$serial") + $arguments
  Write-Info "device: $serial"
} else {
  Write-Info "device: auto"
}

$existingMirrors = @(Get-FolioleScrcpyProcesses -Serial $serial)
if ($existingMirrors.Count -gt 0) {
  Stop-ExtraFolioleScrcpyProcesses -Processes $existingMirrors
  Write-Info "mirror: reused"
  Write-Info "status: OPENED"
  exit 0
}

Write-Info "device screen: turned off"
Write-Info "stay awake: disabled"

Start-Process `
  -FilePath $scrcpy `
  -ArgumentList $arguments `
  -WindowStyle Normal
Start-Sleep -Milliseconds 750
Set-DeviceScreenOff -Adb $adb -Serial $serial
Write-Info "screen sleep: requested"
Write-Info "status: OPENED"
