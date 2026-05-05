param(
  [string]$WindowsWorkDir = "C:\dev\foliole",
  [string]$AndroidHostDir = "android",
  [string]$AppId = "com.foliole.android",
  [string]$MainActivity = "com.foliole.android.MainActivity",
  [int]$BootTimeoutSeconds = 180,
  [int]$LaunchTimeoutSeconds = 20,
  [int]$LaunchStabilitySeconds = 4
)

$ErrorActionPreference = "Stop"

function Write-Info {
  param([string]$Message)
  Write-Host "[android-deploy] $Message"
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

function Resolve-NodeExe {
  $candidates = @(
    (Get-Command node -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source -ErrorAction SilentlyContinue),
    "$env:ProgramFiles\nodejs\node.exe",
    "$env:LOCALAPPDATA\Programs\nodejs\node.exe"
  ) | Where-Object { $_ -and $_.Trim().Length -gt 0 }

  foreach ($candidate in $candidates) {
    if (Test-Path -Path $candidate) {
      return $candidate
    }
  }

  throw "node.exe not found. Install Node.js first."
}

function Invoke-GradleWrapper {
  param(
    [string]$TaskName
  )

  $gradleCommand = "call .\gradlew.bat $TaskName"
  & cmd.exe /d /c $gradleCommand
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
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
    if ($parts.Count -lt 2) {
      continue
    }
    if ($parts[1] -eq "device") {
      return $parts[0]
    }
  }
  return $null
}

function Wait-ForDeviceReady {
  param(
    [string]$AdbPath,
    [int]$TimeoutSeconds
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    $serial = Get-RunningDeviceSerial -AdbPath $AdbPath
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

$javaHome = Resolve-JavaHome
$sdkRoot = Resolve-SdkRoot
$env:JAVA_HOME = $javaHome
$env:ANDROID_HOME = $sdkRoot
$env:ANDROID_SDK_ROOT = $sdkRoot
$env:Path = "$javaHome\bin;$sdkRoot\platform-tools;$sdkRoot\emulator;$env:Path"

$adbPath = Join-Path $sdkRoot "platform-tools\adb.exe"
if (!(Test-Path -Path $adbPath)) {
  throw "adb not found. Install Android platform-tools first."
}

$nodeExe = Resolve-NodeExe
$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$verifyScript = Join-Path $repoRoot "scripts\android\verify-android-launch.mjs"
if (!(Test-Path -Path $verifyScript)) {
  throw "Android launch verification script not found: $verifyScript"
}

$androidDir = Join-Path $WindowsWorkDir $AndroidHostDir
if (!(Test-Path -Path $androidDir)) {
  throw "Android host not initialized: $androidDir. Create the Capacitor Android host first."
}

Write-Info "waiting for ready device"
& $adbPath start-server | Out-Null
$serial = Wait-ForDeviceReady -AdbPath $adbPath -TimeoutSeconds $BootTimeoutSeconds
if ($null -eq $serial) {
  throw "No ready Android device found within ${BootTimeoutSeconds}s."
}

Write-Info "device: $serial"
Push-Location $androidDir
try {
  Write-Info "installing debug build"
  Invoke-GradleWrapper -TaskName "installDebug"
} finally {
  Pop-Location
}

Write-Info "launching activity: $MainActivity"
& $adbPath -s $serial shell am start -n "$AppId/$MainActivity"
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

Write-Info "verifying foreground activity"
& $nodeExe $verifyScript --adb $adbPath --serial $serial --app-id $AppId --component "$AppId/$MainActivity" --timeout-seconds $LaunchTimeoutSeconds --stability-seconds $LaunchStabilitySeconds
if ($LASTEXITCODE -ne 0) {
  throw "Android app did not remain in the foreground after launch."
}

Write-Info "status: OPENED"
