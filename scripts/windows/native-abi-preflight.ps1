param(
  [string]$WorkDir = "C:\dev\foliole",
  [switch]$Run
)

$ErrorActionPreference = "Stop"

function Format-PreflightDetail {
  param($Output)

  $text = ($Output | Out-String).Trim()
  if ([string]::IsNullOrWhiteSpace($text)) {
    return "unknown native module load failure"
  }
  return ($text -replace "\s+", " ").Trim()
}

function Assert-NativeModulesLoadInElectron {
  param([string]$WorkDir)

  $electronPath = Join-Path $WorkDir "node_modules\electron\dist\electron.exe"
  if (!(Test-Path -Path $electronPath)) {
    throw "native module preflight failed: electron runtime not found"
  }

  $runnerPath = Join-Path $WorkDir "scripts\electron-sqlite-runner.mjs"
  if (!(Test-Path -Path $runnerPath)) {
    throw "native module preflight failed: Electron sqlite runner not found"
  }

  $previousLocation = Get-Location
  $previousErrorActionPreference = $ErrorActionPreference
  try {
    Set-Location -Path $WorkDir
    $ErrorActionPreference = "Continue"
    $output = & node $runnerPath --preflight 2>&1
    $exitCode = if ($null -eq $LASTEXITCODE) { 0 } else { $LASTEXITCODE }
  } finally {
    $ErrorActionPreference = $previousErrorActionPreference
    Set-Location -Path $previousLocation
  }

  if ($exitCode -ne 0) {
    $detail = Format-PreflightDetail -Output $output
    throw "native module preflight failed: better-sqlite3 load failed; restore better-sqlite3 for the Electron ABI in the Windows mirror before preview; do not run plain Node npm rebuild for this native module; detail=$detail"
  }
}

if ($Run) {
  Assert-NativeModulesLoadInElectron -WorkDir $WorkDir
  Write-Host "[windows-native-abi] native module preflight passed"
}
