param(
  [string]$AvdName = ""
)

$ErrorActionPreference = "Stop"

function Write-Info {
  param([string]$Message)
  Write-Host "[android-emulator] $Message"
}

if ([string]::IsNullOrWhiteSpace($AvdName)) {
  throw "Missing AVD name. Pass -AvdName or set FOLIOLE_ANDROID_AVD in WSL."
}

$emulatorExe = Get-Command emulator.exe -ErrorAction SilentlyContinue
if ($null -eq $emulatorExe) {
  throw "Android emulator command not found. Install Android SDK emulator tools and expose them in PATH."
}

Write-Info "avd: $AvdName"
Start-Process -FilePath $emulatorExe.Source -ArgumentList "-avd", $AvdName
Write-Info "status: STARTED"
