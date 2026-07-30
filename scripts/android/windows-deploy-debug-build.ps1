function Invoke-DeployProcess {
  param(
    [string]$FilePath,
    [string[]]$ArgumentList,
    [int]$TimeoutSeconds
  )

  $out = [System.IO.Path]::GetTempFileName(); $err = [System.IO.Path]::GetTempFileName()
  try {
    $process = Start-Process -FilePath $FilePath -ArgumentList $ArgumentList -PassThru -WindowStyle Hidden -RedirectStandardOutput $out -RedirectStandardError $err
    if (!$process.WaitForExit($TimeoutSeconds * 1000)) {
      Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
      throw "$FilePath timed out after ${TimeoutSeconds}s."
    }
    $process.WaitForExit()
    $exitCode = $process.ExitCode
    Get-Content -Path $out, $err -ErrorAction SilentlyContinue
    if ($exitCode -ne 0) { throw "$FilePath exited with code $exitCode." }
  } finally {
    Remove-Item -Path $out, $err -ErrorAction SilentlyContinue
  }
}

function Invoke-GradleAssembleDebug {
  param([string]$AndroidDir, [int]$TimeoutSeconds = 240)
  Push-Location $AndroidDir
  try {
    Invoke-DeployProcess -FilePath "cmd.exe" -ArgumentList @("/d", "/c", "call .\gradlew.bat --no-daemon assembleDebug") -TimeoutSeconds $TimeoutSeconds
  } finally {
    Pop-Location
  }
}

function Install-DebugBuild {
  param(
    [string]$AdbPath,
    [string]$AndroidDir,
    [string]$Serial,
    [int]$InstallTimeoutSeconds = 180
  )

  Write-Info "building debug APK"
  Invoke-GradleAssembleDebug -AndroidDir $AndroidDir
  $apkPath = Join-Path $AndroidDir "app\build\outputs\apk\debug\app-debug.apk"
  if (!(Test-Path -Path $apkPath)) {
    throw "Debug APK was not generated: $apkPath"
  }
  Write-Info "installing debug APK"
  $arguments = @("-s", $Serial, "install", "--no-incremental", "-r", $apkPath)
  if (![string]::IsNullOrWhiteSpace($env:FOLIOLE_ANDROID_ADB_SERVER_PORT)) {
    $arguments = @("-P", $env:FOLIOLE_ANDROID_ADB_SERVER_PORT) + $arguments
  }
  Invoke-DeployProcess -FilePath $AdbPath -ArgumentList $arguments -TimeoutSeconds $InstallTimeoutSeconds
}
