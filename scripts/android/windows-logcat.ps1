param(
  [string]$PackageName = ""
)

$ErrorActionPreference = "Stop"

function Write-Info {
  param([string]$Message)
  Write-Host "[android-logcat] $Message"
}

$adbExe = Get-Command adb.exe -ErrorAction SilentlyContinue
if ($null -eq $adbExe) {
  throw "adb not found. Install Android platform-tools and expose them in PATH."
}

if ([string]::IsNullOrWhiteSpace($PackageName)) {
  Write-Info "package: <none>"
  & $adbExe.Source logcat
  exit $LASTEXITCODE
}

$pid = (& $adbExe.Source shell pidof $PackageName 2>$null | Select-Object -First 1).Trim()
if ([string]::IsNullOrWhiteSpace($pid)) {
  throw "Package not running or not found: $PackageName"
}

Write-Info "package: $PackageName pid=$pid"
& $adbExe.Source logcat --pid=$pid
exit $LASTEXITCODE
