param(
  [Parameter(Mandatory = $true)]
  [string]$Action,
  [Parameter(Mandatory = $true)]
  [ValidatePattern("^[0-9a-f]{40}$")]
  [string]$Revision,
  [Parameter(Mandatory = $true)]
  [ValidatePattern("^[0-9a-f]{40}$")]
  [string]$TreeDigest,
  [Parameter(Mandatory = $true)]
  [string]$RouteIdentity
)

$ErrorActionPreference = "Stop"
$systemNode = "C:\Program Files\nodejs\node.exe"
$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$runner = Join-Path $PSScriptRoot "t173-windows-candidate-action.mjs"
$release = $Action -in @("multi-device-sync-provider-cancel", "multi-device-sync-provider-complete")
$lockPath = Join-Path $env:LOCALAPPDATA "Foliole\windows-dev-control\build.lock"

if (-not (Test-Path -LiteralPath $systemNode -PathType Leaf)) {
  throw "System Node is missing at $systemNode"
}

if ($release) {
  & $systemNode $runner $Action $Revision $TreeDigest $RouteIdentity
  exit $LASTEXITCODE
}

New-Item -ItemType Directory -Force -Path (Split-Path -Parent $lockPath) | Out-Null
try {
  $lock = [System.IO.File]::Open($lockPath, [System.IO.FileMode]::OpenOrCreate,
    [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)
} catch [System.IO.IOException] {
  [Console]::Error.WriteLine("Another Windows DEV action owns the foreground slot.")
  exit 73
}

try {
  & $systemNode $runner $Action $Revision $TreeDigest $RouteIdentity
  $runnerExit = $LASTEXITCODE
} finally {
  $lock.Dispose()
}
exit $runnerExit
