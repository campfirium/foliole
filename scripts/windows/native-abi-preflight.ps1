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

  $previousRunAsNode = $env:ELECTRON_RUN_AS_NODE
  $hadRunAsNode = Test-Path Env:ELECTRON_RUN_AS_NODE
  $previousLocation = Get-Location
  $preflightScript = Join-Path $env:TEMP "foliole-native-module-preflight.js"
  $betterSqliteModulePath = (Join-Path $WorkDir "node_modules\better-sqlite3").Replace('\', '/')
  Set-Content -Path $preflightScript -Value @"
try {
  require('$betterSqliteModulePath');
} catch (error) {
  console.error(error && (error.stack || error.message) ? (error.stack || error.message) : String(error));
  process.exit(1);
}
"@ -Encoding UTF8
  $env:ELECTRON_RUN_AS_NODE = "1"
  try {
    Set-Location -Path $WorkDir
    $output = & $electronPath $preflightScript 2>&1
    $exitCode = if ($null -eq $LASTEXITCODE) { 0 } else { $LASTEXITCODE }
  } finally {
    Set-Location -Path $previousLocation
    Remove-Item -Path $preflightScript -Force -ErrorAction SilentlyContinue
    if ($hadRunAsNode) {
      $env:ELECTRON_RUN_AS_NODE = $previousRunAsNode
    } else {
      Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
    }
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
