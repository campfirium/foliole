param(
  [string]$WindowsWorkDir = "C:\dev\foliole",
  [string]$AndroidHostDir = "android"
)

$ErrorActionPreference = "Stop"

function Write-Info {
  param([string]$Message)
  Write-Host "[android-cap-sync] $Message"
}

$androidDir = Join-Path $WindowsWorkDir $AndroidHostDir
if (!(Test-Path -Path $androidDir)) {
  throw "Android host not initialized: $androidDir. Create the Capacitor Android host first."
}

Push-Location $WindowsWorkDir
try {
  Write-Info "workdir: $WindowsWorkDir"
  & npx cap sync android
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
  Write-Info "status: SYNCED"
} finally {
  Pop-Location
}
