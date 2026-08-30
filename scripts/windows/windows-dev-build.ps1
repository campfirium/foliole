$ErrorActionPreference = "Stop"

if ($args.Count -gt 1 -or ($args.Count -eq 1 -and $args[0] -ne "default-sync-journey")) {
  [Console]::Error.WriteLine("Windows DEV build accepts no arguments or default-sync-journey.")
  exit 64
}

$action = if ($args.Count -eq 1) { $args[0] } else { "build" }

$systemNode = "C:\Program Files\nodejs\node.exe"
$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\.."))
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
  [Console]::Error.WriteLine("Another Windows DEV build owns the foreground slot.")
  exit 73
}

try {
  & $systemNode $runner $action
  $runnerExit = $LASTEXITCODE
} finally {
  $lock.Dispose()
}
exit $runnerExit
