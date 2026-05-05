param(
  [string]$AvdName = "",
  [int]$BootTimeoutSeconds = 180
)

$ErrorActionPreference = "Stop"

function Write-Info {
  param([string]$Message)
  Write-Host "[android-emulator] $Message"
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

function Resolve-JavaHome {
  $candidates = @(
    $env:JAVA_HOME,
    "$env:LOCALAPPDATA\Programs\Android Studio\jbr",
    "$env:ProgramFiles\Android\Android Studio\jbr"
  ) | Where-Object { $_ -and $_.Trim().Length -gt 0 }

  foreach ($candidate in $candidates) {
    if (Test-Path -Path (Join-Path $candidate "bin\java.exe")) {
      return $candidate
    }
  }

  throw "JAVA_HOME not found. Install Android Studio or configure a JDK."
}

function Resolve-ToolPath {
  param(
    [string]$SdkRoot,
    [string]$RelativePath,
    [string]$CommandName,
    [string]$MissingMessage
  )

  $sdkToolPath = Join-Path $SdkRoot $RelativePath
  if (Test-Path -Path $sdkToolPath) {
    return $sdkToolPath
  }

  $command = Get-Command $CommandName -ErrorAction SilentlyContinue
  if ($null -ne $command) {
    return $command.Source
  }

  throw $MissingMessage
}

function Get-RunningEmulatorSerial {
  param([string]$AdbPath)

  $deviceLines = (& $AdbPath devices 2>$null) | Select-Object -Skip 1
  foreach ($line in $deviceLines) {
    $trimmed = $line.Trim()
    if ([string]::IsNullOrWhiteSpace($trimmed)) {
      continue
    }
    $parts = $trimmed -split "\s+"
    if ($parts.Count -lt 2) {
      continue
    }
    if ($parts[0] -like "emulator-*" -and $parts[1] -ne "offline") {
      return $parts[0]
    }
  }
  return $null
}

function Wait-ForEmulatorReady {
  param(
    [string]$AdbPath,
    [int]$TimeoutSeconds
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    $serial = Get-RunningEmulatorSerial -AdbPath $AdbPath
    if ($null -eq $serial) {
      Start-Sleep -Seconds 3
      continue
    }

    $bootCompleted = (& $AdbPath -s $serial shell getprop sys.boot_completed 2>$null | Select-Object -First 1).Trim()
    if ($bootCompleted -eq "1") {
      return $serial
    }

    Start-Sleep -Seconds 3
  }

  return $null
}

if ([string]::IsNullOrWhiteSpace($AvdName)) {
  $AvdName = "Foliole_API_36"
}

$sdkRoot = Resolve-SdkRoot
$env:ANDROID_SDK_ROOT = $sdkRoot
$env:ANDROID_HOME = $sdkRoot
$javaHome = Resolve-JavaHome
$env:JAVA_HOME = $javaHome
$env:Path = "$javaHome\bin;$sdkRoot\platform-tools;$sdkRoot\emulator;$env:Path"

$emulatorPath = Resolve-ToolPath `
  -SdkRoot $sdkRoot `
  -RelativePath "emulator\emulator.exe" `
  -CommandName "emulator.exe" `
  -MissingMessage "Android emulator command not found. Install Android SDK emulator tools first."
$adbPath = Resolve-ToolPath `
  -SdkRoot $sdkRoot `
  -RelativePath "platform-tools\adb.exe" `
  -CommandName "adb.exe" `
  -MissingMessage "adb not found. Install Android platform-tools first."

Write-Info "avd: $AvdName"
Write-Info "sdk: $sdkRoot"

$existingProcess = Get-CimInstance Win32_Process -Filter "name = 'qemu-system-x86_64.exe' or name = 'qemu-system-x86_64-headless.exe'" |
  Where-Object { $_.CommandLine -like "*-avd $AvdName*" }

if ($null -eq $existingProcess) {
  Start-Process -FilePath $emulatorPath -ArgumentList "-avd", $AvdName
  Write-Info "launch: requested"
} else {
  Write-Info "launch: already running"
}

& $adbPath start-server | Out-Null
$serial = Wait-ForEmulatorReady -AdbPath $adbPath -TimeoutSeconds $BootTimeoutSeconds
if ($null -eq $serial) {
  Write-Info "status: STARTED"
  exit 0
}

Write-Info "serial: $serial"
Write-Info "status: READY"
