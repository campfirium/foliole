param(
  [string]$WindowsWorkDir = "C:\dev\foliole",
  [string]$AndroidHostDir = "android",
  [string]$AndroidWebBuildScript = "android:web:build",
  [string]$CapCliPackage = "@capacitor/cli",
  [string]$CapCliVersion = "8.3.0"
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

function Ensure-CapacitorCliAvailable {
  $cliPackageJson = Join-Path $WindowsWorkDir "node_modules\$($CapCliPackage -replace '/', '\')\package.json"
  if (Test-Path -Path $cliPackageJson) {
    return
  }

  $npmCmd = Get-Command npm.cmd -ErrorAction SilentlyContinue
  if ($null -eq $npmCmd) {
    throw "npm.cmd not found on Windows. Install Node.js on Windows first."
  }

  Write-Info "capacitor cli missing in windows mirror; running npm install"
  & $npmCmd.Source install
  if ($LASTEXITCODE -ne 0) {
    throw "npm install failed in Windows mirror; cannot run Capacitor sync."
  }
}

Push-Location $WindowsWorkDir
try {
  Write-Info "workdir: $WindowsWorkDir"
  Ensure-CapacitorCliAvailable
  $npmCmd = Get-Command npm.cmd -ErrorAction SilentlyContinue
  if ($null -eq $npmCmd) {
    throw "npm.cmd not found on Windows. Install Node.js on Windows first."
  }
  Write-Info "building companion web entry"
  & $npmCmd.Source run $AndroidWebBuildScript
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
  $npxCmd = Get-Command npx.cmd -ErrorAction SilentlyContinue
  if ($null -eq $npxCmd) {
    throw "npx.cmd not found on Windows. Install Node.js on Windows first."
  }
  & $npxCmd.Source cap sync android
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
  Write-Info "status: SYNCED"
} finally {
  Pop-Location
}
