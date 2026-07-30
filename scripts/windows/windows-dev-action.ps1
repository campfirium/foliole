param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("build", "deploy", "verify")]
  [string]$Action
)

$ErrorActionPreference = "Stop"
$systemNode = "C:\Program Files\nodejs\node.exe"
$runner = Join-Path $PSScriptRoot "windows-dev-build.mjs"
$lockPath = Join-Path $env:LOCALAPPDATA "Foliole\windows-dev-control\build.lock"
$lockDirectory = Split-Path -Parent $lockPath

if (-not (Test-Path -LiteralPath $systemNode -PathType Leaf)) {
  [Console]::Error.WriteLine("System Node is missing at $systemNode")
  exit 64
}

New-Item -ItemType Directory -Force -Path $lockDirectory | Out-Null
try {
  $lock = [System.IO.File]::Open(
    $lockPath,
    [System.IO.FileMode]::OpenOrCreate,
    [System.IO.FileAccess]::ReadWrite,
    [System.IO.FileShare]::None
  )
} catch [System.IO.IOException] {
  [Console]::Error.WriteLine("Another Windows DEV action owns the foreground slot.")
  exit 73
}

try {
  & $systemNode $runner $Action
  $runnerExit = $LASTEXITCODE
} finally {
  $lock.Dispose()
}
exit $runnerExit
