param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern("^[a-z]+(?:-[a-z]+)*$")]
  [string]$Action
)

$ErrorActionPreference = "Stop"
$systemNode = "C:\Program Files\nodejs\node.exe"
$systemNpmCli = "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js"
$puller = Join-Path $PSScriptRoot "windows-dev-pull.mjs"
$runner = Join-Path $PSScriptRoot "windows-dev-build.mjs"
$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$releaseRunner = Join-Path $PSScriptRoot "windows-sync-group-provider-release-control.mjs"
$lockPath = Join-Path $env:LOCALAPPDATA "Foliole\windows-dev-control\build.lock"
$lockDirectory = Split-Path -Parent $lockPath

if (-not (Test-Path -LiteralPath $systemNode -PathType Leaf)) {
  [Console]::Error.WriteLine("System Node is missing at $systemNode")
  exit 64
}

$releaseStatus = switch ($Action) {
  "multi-device-sync-provider-complete" { "consumer_complete" }
  "multi-device-sync-provider-cancel" { "cancelled" }
  default { $null }
}
if ($null -ne $releaseStatus) {
  & $systemNode $releaseRunner $releaseStatus
  exit $LASTEXITCODE
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
  & $systemNode $puller
  $runnerExit = $LASTEXITCODE
  if ($runnerExit -eq 0) {
    if ($Action -eq "desktop-preview") {
      Push-Location $repoRoot
      try {
        & $systemNode $systemNpmCli run windows:preview:native
        $runnerExit = $LASTEXITCODE
      } finally {
        Pop-Location
      }
    } elseif ($Action -eq "internal-install") {
      Push-Location $repoRoot
      try {
        & $systemNode $systemNpmCli run windows:package:internal:install
        $runnerExit = $LASTEXITCODE
      } finally {
        Pop-Location
      }
    } else {
      & $systemNode $runner $Action
      $runnerExit = $LASTEXITCODE
    }
  }
} finally {
  $lock.Dispose()
}
exit $runnerExit
