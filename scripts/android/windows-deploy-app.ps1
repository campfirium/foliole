param(
  [string]$WindowsWorkDir = "C:\dev\foliole-android-preview",
  [string]$AndroidHostDir = "android",
  [string]$AppId = "com.foliole.android",
  [string]$MainActivity = "com.foliole.android.MainActivity",
  [int]$BootTimeoutSeconds = 180,
  [int]$LaunchTimeoutSeconds = 20,
  [int]$LaunchStabilitySeconds = 4,
  [int]$DevReverseSyncPort = 38641,
  [Parameter(Mandatory = $true)]
  [ValidateNotNullOrEmpty()]
  [string]$TargetSerial,
  [Parameter(Mandatory = $true)]
  [ValidateNotNullOrEmpty()]
  [string]$NodeExe,
  [switch]$StopGradleDaemon
)

$ErrorActionPreference = "Stop"
if ([string]::IsNullOrWhiteSpace($env:FOLIOLE_ANDROID_ADB_SERVER_PORT)) {
  throw "FOLIOLE_ANDROID_ADB_SERVER_PORT is required."
}
$env:ANDROID_ADB_SERVER_PORT = $env:FOLIOLE_ANDROID_ADB_SERVER_PORT

function Write-Info {
  param([string]$Message)
  Write-Host "[android-deploy] $Message"
}

function Invoke-AdbCommand {
  param([string]$AdbPath, [string[]]$Arguments)
  $Arguments = @("-P", $env:FOLIOLE_ANDROID_ADB_SERVER_PORT) + $Arguments
  $out = [System.IO.Path]::GetTempFileName(); $err = [System.IO.Path]::GetTempFileName()
  try {
    $process = Start-Process -FilePath $AdbPath -ArgumentList $Arguments -Wait -PassThru -WindowStyle Hidden -RedirectStandardOutput $out -RedirectStandardError $err
    $global:LASTEXITCODE = $process.ExitCode
    Get-Content -Path $out -ErrorAction SilentlyContinue
  } finally { Remove-Item -Path $out, $err -ErrorAction SilentlyContinue }
}

function Test-LastCommandFailed {
  return $null -ne $LASTEXITCODE -and $LASTEXITCODE -ne 0
}

function Get-InstalledVersionCode {
  param([string]$AdbPath, [string]$Serial, [string]$PackageName)
  $output = (Invoke-AdbCommand -AdbPath $AdbPath -Arguments @("-s", $Serial, "shell", "dumpsys", "package", $PackageName)) -join "`n"
  $match = [regex]::Match($output, "versionCode=(\d+)")
  if (!$match.Success) {
    return ""
  }
  return $match.Groups[1].Value
}

function Stop-AppProcess {
  param([string]$AdbPath, [string]$Serial, [string]$PackageName)
  Write-Info "force-stopping app before launch"
  Invoke-AdbCommand -AdbPath $AdbPath -Arguments @("-s", $Serial, "shell", "am", "force-stop", $PackageName) *> $null
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

function Stop-GradleWrapperDaemon {
  Write-Info "stopping Gradle daemon"
  $process = Start-Process -FilePath "cmd.exe" -ArgumentList @("/d", "/c", "call .\gradlew.bat --stop") -Wait -PassThru -WindowStyle Hidden
  if ($process.ExitCode -ne 0) {
    Write-Info "Gradle daemon stop failed; continuing"
  }
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
    if ($null -eq $serial) {
      Start-Sleep -Seconds 3
      continue
    }

    $bootCompleted = (Invoke-AdbCommand -AdbPath $AdbPath -Arguments @("-s", $serial, "shell", "getprop", "sys.boot_completed") | Select-Object -First 1).Trim()
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

if (!(Test-Path -Path $NodeExe)) {
  throw "Required system Node executable not found: $NodeExe"
}
$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$adbDeviceScript = Join-Path $repoRoot "scripts\android\windows-adb-device.ps1"
$debugBuildScript = Join-Path $repoRoot "scripts\android\windows-deploy-debug-build.ps1"
$installCacheScript = Join-Path $repoRoot "scripts\android\windows-deploy-install-cache.ps1"
$verifyScript = Join-Path $repoRoot "scripts\android\verify-android-launch.mjs"
if (!(Test-Path -Path $adbDeviceScript)) {
  throw "Android adb device helper not found: $adbDeviceScript"
}
if (!(Test-Path -Path $debugBuildScript)) {
  throw "Android deploy debug build helper not found: $debugBuildScript"
}
if (!(Test-Path -Path $installCacheScript)) {
  throw "Android deploy install cache script not found: $installCacheScript"
}
if (!(Test-Path -Path $verifyScript)) {
  throw "Android launch verification script not found: $verifyScript"
}
. $adbDeviceScript
. $debugBuildScript
. $installCacheScript

$androidDir = Join-Path $WindowsWorkDir $AndroidHostDir
if (!(Test-Path -Path $androidDir)) {
  throw "Android host not initialized: $androidDir. Create the Capacitor Android host first."
}

Write-Info "waiting for ready device"
Invoke-AdbCommand -AdbPath $adbPath -Arguments @("start-server") *> $null
Write-Info "target device: $TargetSerial"
$serial = Wait-ForDeviceReady -AdbPath $adbPath -TargetSerial $TargetSerial -TimeoutSeconds $BootTimeoutSeconds
if ($null -eq $serial) {
  throw "No ready Android device found within ${BootTimeoutSeconds}s."
}

Write-Info "device: $serial"
$apkHash = Get-ApkHash -AndroidDir $androidDir
$nativeSourcesHash = Get-NativeSourcesHash -AndroidDir $androidDir
$webAssetsHash = Get-WebAssetsHash -AndroidDir $androidDir
$installedVersionCode = Get-InstalledVersionCode -AdbPath $adbPath -Serial $serial -PackageName $AppId
if (Test-InstallCacheHit -ApkHash $apkHash -NativeSourcesHash $nativeSourcesHash -Serial $serial -VersionCode $installedVersionCode -WebAssetsHash $webAssetsHash -WindowsWorkDir $WindowsWorkDir) {
  Write-Info "install cache: HIT apk=$apkHash versionCode=$installedVersionCode"
} else {
  Write-Info "install cache: MISS apk=$apkHash nativeSources=$nativeSourcesHash webAssets=$webAssetsHash versionCode=$installedVersionCode"
  Install-DebugBuild -AdbPath $adbPath -AndroidDir $androidDir -Serial $serial
  $apkHash = Get-ApkHash -AndroidDir $androidDir
  $nativeSourcesHash = Get-NativeSourcesHash -AndroidDir $androidDir
  $webAssetsHash = Get-WebAssetsHash -AndroidDir $androidDir
  $installedVersionCode = Get-InstalledVersionCode -AdbPath $adbPath -Serial $serial -PackageName $AppId
  Write-InstallCache -ApkHash $apkHash -NativeSourcesHash $nativeSourcesHash -Serial $serial -VersionCode $installedVersionCode -WebAssetsHash $webAssetsHash -WindowsWorkDir $WindowsWorkDir
}

if ($DevReverseSyncPort -gt 0) {
  Write-Info "configuring dev sync reverse: tcp:$DevReverseSyncPort"
  Invoke-AdbCommand -AdbPath $adbPath -Arguments @("-s", $serial, "reverse", "tcp:$DevReverseSyncPort", "tcp:$DevReverseSyncPort") *> $null
  if (Test-LastCommandFailed) {
    Write-Info "dev sync reverse unavailable; continuing without reverse"
  }
}

Stop-AppProcess -AdbPath $adbPath -Serial $serial -PackageName $AppId
Write-Info "launching activity: $MainActivity"
Invoke-AdbCommand -AdbPath $adbPath -Arguments @("-s", $serial, "shell", "am", "start", "-n", "$AppId/$MainActivity")
if (Test-LastCommandFailed) {
  exit $LASTEXITCODE
}

Write-Info "verifying foreground activity"
& $nodeExe $verifyScript --adb $adbPath --adb-server-port $env:FOLIOLE_ANDROID_ADB_SERVER_PORT --serial $serial --app-id $AppId --component "$AppId/$MainActivity" --timeout-seconds $LaunchTimeoutSeconds --stability-seconds $LaunchStabilitySeconds
if (Test-LastCommandFailed) {
  throw "Android app did not remain in the foreground after launch."
}

if ($StopGradleDaemon) {
  Push-Location $androidDir
  try {
    Stop-GradleWrapperDaemon
  } finally {
    Pop-Location
  }
}

Write-Info "status: OPENED"
exit 0
