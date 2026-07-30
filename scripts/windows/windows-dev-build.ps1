$ErrorActionPreference = "Stop"

if ($args.Count -ne 0) {
  Write-Error "Windows DEV build accepts no arguments."
  exit 64
}

$systemNode = "C:\Program Files\nodejs\node.exe"
$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\.."))
$runner = Join-Path $PSScriptRoot "windows-dev-build.mjs"
$lockPath = Join-Path $env:LOCALAPPDATA "Foliole\windows-dev-control\build.lock"
$lockDirectory = Split-Path -Parent $lockPath

if (-not (Test-Path -LiteralPath $systemNode -PathType Leaf)) {
  Write-Error "System Node is missing at $systemNode"
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
  Write-Error "Another Windows DEV build owns the foreground slot."
  exit 73
}

try {
  & $systemNode $runner
  $runnerExit = $LASTEXITCODE
} finally {
  $lock.Dispose()
}
exit $runnerExit
